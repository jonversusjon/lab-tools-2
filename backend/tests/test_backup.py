from __future__ import annotations

import gzip
import sqlite3
from datetime import date
from datetime import timedelta
from pathlib import Path

import pytest

from tools.backup import _rotation_plan
from tools.backup import restore
from tools.backup import rotate
from tools.backup import take_snapshot


# ── helpers ───────────────────────────────────────────────────────────────────

def _make_db(path: Path) -> None:
    """Create a minimal valid SQLite database at path."""
    conn = sqlite3.connect(str(path))
    conn.execute("CREATE TABLE t (id INTEGER PRIMARY KEY, val TEXT)")
    conn.execute("INSERT INTO t VALUES (1, 'hello')")
    conn.commit()
    conn.close()


def _make_fake_gz(path: Path) -> None:
    """Write a minimal gzip file at path (contents don't matter for rotation tests)."""
    with gzip.open(str(path), "wb") as f:
        f.write(b"fake")


def _days_ago(n: int) -> date:
    return date.today() - timedelta(days=n)


# ── snapshot tests ────────────────────────────────────────────────────────────

def test_snapshot_creates_gz(tmp_path):
    db = tmp_path / "panels.db"
    backup_dir = tmp_path / "backups"
    _make_db(db)

    result = take_snapshot(db_path=db, backup_dir=backup_dir)

    assert result is not None
    assert result.exists()
    assert result.suffix == ".gz"
    assert result.stat().st_size > 0


def test_snapshot_is_valid_sqlite_after_decompress(tmp_path):
    db = tmp_path / "panels.db"
    backup_dir = tmp_path / "backups"
    _make_db(db)

    gz = take_snapshot(db_path=db, backup_dir=backup_dir)
    assert gz is not None

    restored = tmp_path / "check.db"
    with gzip.open(str(gz), "rb") as f_in, open(restored, "wb") as f_out:
        import shutil
        shutil.copyfileobj(f_in, f_out)

    conn = sqlite3.connect(str(restored))
    result = conn.execute("PRAGMA integrity_check;").fetchone()
    conn.close()
    assert result[0] == "ok"


def test_snapshot_idempotent_same_day(tmp_path):
    db = tmp_path / "panels.db"
    backup_dir = tmp_path / "backups"
    _make_db(db)

    r1 = take_snapshot(db_path=db, backup_dir=backup_dir)
    r2 = take_snapshot(db_path=db, backup_dir=backup_dir)  # second call — same day

    assert r1 is not None
    assert r2 is None  # skipped
    assert len(list((backup_dir).glob("*.gz"))) == 1


def test_snapshot_force_overwrites(tmp_path):
    db = tmp_path / "panels.db"
    backup_dir = tmp_path / "backups"
    _make_db(db)

    r1 = take_snapshot(db_path=db, backup_dir=backup_dir)
    r2 = take_snapshot(db_path=db, backup_dir=backup_dir, force=True)

    assert r1 is not None
    assert r2 is not None
    assert len(list(backup_dir.glob("*.gz"))) == 1


def test_snapshot_raises_if_db_missing(tmp_path):
    with pytest.raises(FileNotFoundError, match="DB not found"):
        take_snapshot(db_path=tmp_path / "nonexistent.db", backup_dir=tmp_path / "backups")


# ── restore tests ─────────────────────────────────────────────────────────────

def test_restore_round_trip(tmp_path):
    db = tmp_path / "panels.db"
    backup_dir = tmp_path / "backups"
    _make_db(db)

    gz = take_snapshot(db_path=db, backup_dir=backup_dir)
    assert gz is not None

    restored = tmp_path / "restored.db"
    restore(src=gz, dst=restored)

    assert restored.exists()
    conn = sqlite3.connect(str(restored))
    row = conn.execute("SELECT val FROM t WHERE id=1").fetchone()
    conn.close()
    assert row[0] == "hello"


def test_restore_refuses_to_overwrite_without_force(tmp_path):
    db = tmp_path / "panels.db"
    backup_dir = tmp_path / "backups"
    _make_db(db)

    gz = take_snapshot(db_path=db, backup_dir=backup_dir)
    assert gz is not None

    dst = tmp_path / "dst.db"
    dst.touch()

    with pytest.raises(FileExistsError, match="--force"):
        restore(src=gz, dst=dst)


def test_restore_force_overwrites(tmp_path):
    db = tmp_path / "panels.db"
    backup_dir = tmp_path / "backups"
    _make_db(db)

    gz = take_snapshot(db_path=db, backup_dir=backup_dir)
    assert gz is not None

    dst = tmp_path / "dst.db"
    dst.touch()

    restore(src=gz, dst=dst, force=True)
    assert dst.stat().st_size > 0


# ── rotation tests ────────────────────────────────────────────────────────────

def _populate_fake_backups(backup_dir: Path, n_days: int) -> list[Path]:
    """Create n_days fake .db.gz files, one per day going back from today."""
    backup_dir.mkdir(parents=True, exist_ok=True)
    today = date.today()
    files = []
    for i in range(n_days):
        d = today - timedelta(days=i)
        f = backup_dir / ("panels-%s.db.gz" % d.isoformat())
        _make_fake_gz(f)
        files.append(f)
    return files


def test_rotation_keeps_all_within_14_days(tmp_path):
    backup_dir = tmp_path / "backups"
    files = _populate_fake_backups(backup_dir, 14)

    plan = _rotation_plan(backup_dir, date.today())
    for f in files:
        assert plan[f] in ("daily",), "all 14 files should be 'daily', got %s for %s" % (plan[f], f.name)


def test_rotation_deletes_excess_after_4_weeks(tmp_path):
    backup_dir = tmp_path / "backups"
    # Create 60 days of snapshots
    _populate_fake_backups(backup_dir, 60)
    today = date.today()

    deleted = rotate(backup_dir=backup_dir, today=today)
    remaining = list(backup_dir.glob("panels-*.db.gz"))

    # Should keep at most: 14 daily + 4 weekly + 2 monthly = 20
    assert len(remaining) <= 20
    # Must have deleted at least some
    assert len(deleted) > 0


def test_rotation_plan_classifications(tmp_path):
    backup_dir = tmp_path / "backups"
    _populate_fake_backups(backup_dir, 60)
    today = date.today()

    plan = _rotation_plan(backup_dir, today)
    classes = set(plan.values())
    assert classes <= {"daily", "weekly", "monthly", "delete"}

    daily_count = sum(1 for c in plan.values() if c == "daily")
    weekly_count = sum(1 for c in plan.values() if c == "weekly")
    monthly_count = sum(1 for c in plan.values() if c == "monthly")

    # 60 days: 14 daily + at most 4 weekly + at most 2 monthly
    assert daily_count == 14
    assert weekly_count <= 4
    assert monthly_count <= 2


def test_rotation_dry_run_does_not_delete(tmp_path):
    backup_dir = tmp_path / "backups"
    _populate_fake_backups(backup_dir, 60)
    before = len(list(backup_dir.glob("*.gz")))

    rotate(backup_dir=backup_dir, dry_run=True)

    after = len(list(backup_dir.glob("*.gz")))
    assert before == after


# ── DATABASE_URL integration ──────────────────────────────────────────────────

def test_backup_uses_database_url(tmp_path, monkeypatch):
    custom_db = tmp_path / "custom.db"
    _make_db(custom_db)
    backup_dir = tmp_path / "backups"

    monkeypatch.setenv("DATABASE_URL", "sqlite:///" + str(custom_db))
    result = take_snapshot(backup_dir=backup_dir)  # no db_path — must use DATABASE_URL

    assert result is not None
    assert result.exists()
    assert result.stat().st_size > 0


def test_backup_explicit_src_overrides_env(tmp_path, monkeypatch):
    real_db = tmp_path / "real.db"
    _make_db(real_db)
    backup_dir = tmp_path / "backups"

    # Set DATABASE_URL to a path that doesn't exist — explicit --db must win
    monkeypatch.setenv("DATABASE_URL", "sqlite:///" + str(tmp_path / "nonexistent.db"))
    result = take_snapshot(db_path=real_db, backup_dir=backup_dir)

    assert result is not None
    assert result.exists()
