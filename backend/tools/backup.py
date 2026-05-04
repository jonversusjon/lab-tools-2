from __future__ import annotations

import argparse
import gzip
import logging
import re
import shutil
import sqlite3
import time
from datetime import date
from datetime import timedelta
from pathlib import Path

logger = logging.getLogger(__name__)

_SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_DB_PATH = _SCRIPT_DIR.parent / "panels.db"
DEFAULT_BACKUP_DIR = _SCRIPT_DIR.parent / "backups"


def take_snapshot(
    db_path: Path = DEFAULT_DB_PATH,
    backup_dir: Path = DEFAULT_BACKUP_DIR,
    today: date | None = None,
    force: bool = False,
) -> Path | None:
    """Copy db_path to a timestamped gzip in backup_dir using SQLite online backup API.

    Returns the created Path, or None if skipped (already exists and not --force).
    """
    if today is None:
        today = date.today()
    backup_dir.mkdir(parents=True, exist_ok=True)
    dest_gz = backup_dir / ("panels-%s.db.gz" % today.isoformat())
    if dest_gz.exists() and not force:
        logger.info("Snapshot for %s already exists — skipping. Use --force to override.", today)
        return None
    if not db_path.exists():
        raise FileNotFoundError("DB not found: %s" % db_path)
    tmp_db = backup_dir / ("panels-%s.db.tmp" % today.isoformat())
    src_conn = sqlite3.connect(str(db_path))
    dst_conn = sqlite3.connect(str(tmp_db))
    try:
        src_conn.backup(dst_conn)
    finally:
        dst_conn.close()
        src_conn.close()
    with open(tmp_db, "rb") as f_in, gzip.open(str(dest_gz), "wb", compresslevel=9) as f_out:
        shutil.copyfileobj(f_in, f_out)
    tmp_db.unlink()
    logger.info("Snapshot created: %s (%d bytes)", dest_gz.name, dest_gz.stat().st_size)
    return dest_gz


def _rotation_plan(backup_dir: Path, today: date) -> dict[Path, str]:
    """Return {file: classification} for all snapshot files found in backup_dir.

    Classifications: 'daily' | 'weekly' | 'monthly' | 'delete'

    Retention policy:
      - Daily:   keep all snapshots from last 14 days
      - Weekly:  from older, keep earliest snapshot per ISO week for 4 most recent such weeks
      - Monthly: from dates outside those 4 weeks, keep earliest per calendar month for 2 months
      - Delete:  everything else
    """
    pattern = re.compile(r"^panels-(\d{4})-(\d{2})-(\d{2})\.db\.gz$")
    files_by_date: dict[date, Path] = {}
    for f in backup_dir.glob("panels-*.db.gz"):
        m = pattern.match(f.name)
        if not m:
            continue
        try:
            d = date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
            files_by_date[d] = f
        except ValueError:
            continue

    plan: dict[Path, str] = {}
    cutoff_daily = today - timedelta(days=14)

    for d, f in files_by_date.items():
        if d > cutoff_daily:
            plan[f] = "daily"

    older_dates = sorted(d for d in files_by_date if d <= cutoff_daily)

    # Weekly grouping
    weeks: dict[tuple[int, int], list[date]] = {}
    for d in older_dates:
        wk = d.isocalendar()[:2]
        weeks.setdefault(wk, []).append(d)
    top_4_weeks = sorted(weeks.keys(), reverse=True)[:4]
    weekly_wks = set(top_4_weeks)
    for wk in top_4_weeks:
        plan[files_by_date[min(weeks[wk])]] = "weekly"

    # Monthly grouping — only from dates outside the 4 weekly groups
    monthly_candidates = [d for d in older_dates if d.isocalendar()[:2] not in weekly_wks]
    months: dict[tuple[int, int], list[date]] = {}
    for d in monthly_candidates:
        months.setdefault((d.year, d.month), []).append(d)
    top_2_months = sorted(months.keys(), reverse=True)[:2]
    for mk in top_2_months:
        plan[files_by_date[min(months[mk])]] = "monthly"

    # Mark the rest as delete
    for f in files_by_date.values():
        if f not in plan:
            plan[f] = "delete"

    return plan


def rotate(
    backup_dir: Path = DEFAULT_BACKUP_DIR,
    today: date | None = None,
    dry_run: bool = False,
) -> list[Path]:
    """Delete snapshots outside the retention window. Returns list of deleted paths."""
    if today is None:
        today = date.today()
    if not backup_dir.exists():
        return []
    plan = _rotation_plan(backup_dir, today)
    deleted: list[Path] = []
    for f, cls in plan.items():
        if cls == "delete":
            if not dry_run:
                f.unlink()
                logger.info("Rotated out: %s", f.name)
            deleted.append(f)
    return deleted


def restore(src: Path, dst: Path, force: bool = False) -> None:
    """Decompress src (.db.gz) to dst (.db). Runs integrity_check after restore.

    Refuses to overwrite an existing dst unless force=True.
    """
    if dst.exists() and not force:
        raise FileExistsError(
            "Destination already exists: %s. Use --force to overwrite." % dst
        )
    tmp = dst.parent / (dst.name + ".restore_tmp")
    try:
        with gzip.open(str(src), "rb") as f_in, open(tmp, "wb") as f_out:
            shutil.copyfileobj(f_in, f_out)
        conn = sqlite3.connect(str(tmp))
        try:
            result = conn.execute("PRAGMA integrity_check;").fetchone()
            if result[0] != "ok":
                raise RuntimeError("integrity_check failed: %s" % result[0])
        finally:
            conn.close()
        tmp.replace(dst)
        logger.info("Restored %s -> %s", src.name, dst)
    except Exception:
        if tmp.exists():
            tmp.unlink()
        raise


def list_backups(backup_dir: Path = DEFAULT_BACKUP_DIR) -> None:
    """Print a table of backup files with size, mtime, and retention classification."""
    if not backup_dir.exists():
        print("Backup directory not found: %s" % backup_dir)
        return
    plan = _rotation_plan(backup_dir, date.today())
    all_files = sorted(plan.keys(), key=lambda f: f.name, reverse=True)
    if not all_files:
        print("No backups found in %s" % backup_dir)
        return
    print("%-44s  %8s  %-12s  %s" % ("Filename", "Size", "Modified", "Class"))
    print("-" * 82)
    for f in all_files:
        size_kb = f.stat().st_size // 1024
        mtime = time.strftime("%Y-%m-%d", time.localtime(f.stat().st_mtime))
        cls = plan.get(f, "unknown")
        print("%-44s  %7d K  %-12s  %s" % (f.name, size_kb, mtime, cls))


def _main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    p = argparse.ArgumentParser(description="panels.db backup utility")
    sub = p.add_subparsers(dest="cmd", required=True)

    snap = sub.add_parser("snapshot", help="Create a daily snapshot")
    snap.add_argument("--db", type=Path, default=DEFAULT_DB_PATH)
    snap.add_argument("--backup-dir", type=Path, default=DEFAULT_BACKUP_DIR)
    snap.add_argument("--force", action="store_true", help="Overwrite today's snapshot if it exists")
    snap.add_argument("--no-rotate", action="store_true", help="Skip rotation after snapshot")

    res = sub.add_parser("restore", help="Restore from a snapshot")
    res.add_argument("--src", type=Path, required=True)
    res.add_argument("--dst", type=Path, default=DEFAULT_DB_PATH)
    res.add_argument("--force", action="store_true", help="Overwrite destination if it exists")

    ls = sub.add_parser("list", help="List backups with retention classification")
    ls.add_argument("--backup-dir", type=Path, default=DEFAULT_BACKUP_DIR)

    args = p.parse_args()

    if args.cmd == "snapshot":
        result = take_snapshot(db_path=args.db, backup_dir=args.backup_dir, force=args.force)
        if result and not args.no_rotate:
            deleted = rotate(backup_dir=args.backup_dir)
            if deleted:
                logger.info("Rotated %d old snapshot(s).", len(deleted))
    elif args.cmd == "restore":
        restore(src=args.src, dst=args.dst, force=args.force)
    elif args.cmd == "list":
        list_backups(backup_dir=args.backup_dir)


if __name__ == "__main__":
    _main()
