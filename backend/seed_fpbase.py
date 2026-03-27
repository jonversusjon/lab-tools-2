from __future__ import annotations

"""
Seed FPbase fluorophore data from pre-downloaded CSV/Parquet files.

Usage:
    cd backend
    python seed_fpbase.py

Data files expected at ../fpbase_data/ relative to this script.
The panels.db is expected in the same directory as this script.
"""

import logging
import math
import sys
from pathlib import Path

logger = logging.getLogger(__name__)

# Add backend dir to sys.path so local imports work when run as a script
sys.path.insert(0, str(Path(__file__).parent))

FPBASE_DATA_DIR = Path(__file__).parent.parent / "fpbase_data"
METADATA_CSV = FPBASE_DATA_DIR / "fpbase_metadata.csv"
SPECTRA_PARQUET = FPBASE_DATA_DIR / "fpbase_spectra_long.parquet"
DB_PATH = Path(__file__).parent / "panels.db"


def _nan_to_none(val):
    """Convert NaN/inf float to None for SQLite NULL storage."""
    if val is None:
        return None
    try:
        f = float(val)
        if math.isnan(f) or math.isinf(f):
            return None
        return f
    except (TypeError, ValueError):
        return None


def seed_fpbase() -> None:
    """
    Seed FPbase fluorophore data from pre-downloaded CSV and Parquet files.

    Idempotent: uses INSERT OR REPLACE for fluorophores, clears and re-inserts spectra.
    """
    try:
        import pandas as pd
    except ImportError:
        logger.error(
            "pandas is required for seeding FPbase data. "
            "Install it with: pip install pandas pyarrow"
        )
        raise

    if not METADATA_CSV.exists():
        raise FileNotFoundError(
            "FPbase metadata CSV not found at: %s" % METADATA_CSV
        )
    if not SPECTRA_PARQUET.exists():
        raise FileNotFoundError(
            "FPbase spectra Parquet not found at: %s" % SPECTRA_PARQUET
        )

    logger.info("Reading FPbase metadata from %s ...", METADATA_CSV)
    meta = pd.read_csv(METADATA_CSV)

    logger.info("Reading FPbase spectra from %s ...", SPECTRA_PARQUET)
    spectra_df = pd.read_parquet(SPECTRA_PARQUET)

    # Determine which fluorophores have at least one EX or EM spectrum
    has_ex_em = set(
        spectra_df[spectra_df["spectrum_subtype"].isin(["EX", "EM"])]["fluorophore"].unique()
    )

    # Ensure database tables exist before connecting directly
    from database import engine
    from models import Base

    Base.metadata.create_all(bind=engine)

    import sqlite3

    conn = sqlite3.connect(str(DB_PATH))
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA journal_mode=WAL")

    try:
        # --- Upsert fluorophores ---
        logger.info("Upserting %d fluorophores ...", len(meta))
        fluor_rows = []
        for _, row in meta.iterrows():
            slug = str(row["slug"])
            name = str(row["fluorophore"])
            fluor_type_val = str(row["fluor_type"]) if pd.notna(row.get("fluor_type")) else None
            oligom = str(row["oligomerization"]) if pd.notna(row.get("oligomerization")) else None
            switch = str(row["switch_type"]) if pd.notna(row.get("switch_type")) else None
            has_spec = 1 if name in has_ex_em else 0

            fluor_rows.append((
                slug,
                name,
                fluor_type_val,
                "FPbase",
                _nan_to_none(row.get("ex_max_nm")),
                _nan_to_none(row.get("em_max_nm")),
                _nan_to_none(row.get("ext_coeff")),
                _nan_to_none(row.get("qy")),
                _nan_to_none(row.get("lifetime_ns")),
                oligom,
                switch,
                has_spec,
            ))

        conn.executemany(
            """
            INSERT OR REPLACE INTO fluorophores
                (id, name, fluor_type, source,
                 ex_max_nm, em_max_nm, ext_coeff, qy, lifetime_ns,
                 oligomerization, switch_type, has_spectra)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            fluor_rows,
        )
        logger.info("Upserted %d fluorophore records.", len(fluor_rows))

        # --- Clear and re-insert spectra ---
        logger.info("Clearing existing fluorophore_spectra rows ...")
        conn.execute("DELETE FROM fluorophore_spectra")

        # Build name → slug mapping for joining parquet data
        slug_map = dict(zip(meta["fluorophore"], meta["slug"]))
        spectra_df["slug"] = spectra_df["fluorophore"].map(slug_map)

        # Only keep rows where the fluorophore is in our metadata
        spectra_with_slug = spectra_df.dropna(subset=["slug"])
        total_rows = len(spectra_with_slug)
        logger.info("Inserting %d spectra rows (this may take a moment) ...", total_rows)

        # Extract as plain lists for fast executemany
        spec_data = spectra_with_slug[
            ["slug", "spectrum_subtype", "wavelength_nm", "intensity"]
        ].values.tolist()

        BATCH_SIZE = 50000
        inserted = 0
        for i in range(0, len(spec_data), BATCH_SIZE):
            batch = spec_data[i : i + BATCH_SIZE]
            conn.executemany(
                """
                INSERT INTO fluorophore_spectra
                    (fluorophore_id, spectrum_type, wavelength_nm, intensity)
                VALUES (?, ?, ?, ?)
                """,
                batch,
            )
            inserted += len(batch)
            logger.info("  ... %d / %d rows inserted", inserted, total_rows)

        conn.commit()

        # --- Print summary ---
        fluor_count = conn.execute("SELECT COUNT(*) FROM fluorophores").fetchone()[0]
        has_spec_count = conn.execute(
            "SELECT COUNT(*) FROM fluorophores WHERE has_spectra = 1"
        ).fetchone()[0]
        protein_count = conn.execute(
            "SELECT COUNT(*) FROM fluorophores WHERE fluor_type = 'protein'"
        ).fetchone()[0]
        dye_count = conn.execute(
            "SELECT COUNT(*) FROM fluorophores WHERE fluor_type = 'dye'"
        ).fetchone()[0]
        spec_row_count = conn.execute(
            "SELECT COUNT(*) FROM fluorophore_spectra"
        ).fetchone()[0]

        logger.info(
            "Seed complete: %d fluorophores total "
            "(%d proteins, %d dyes, %d with EX/EM spectra), "
            "%d spectral data rows.",
            fluor_count,
            protein_count,
            dye_count,
            has_spec_count,
            spec_row_count,
        )

    except Exception:
        conn.rollback()
        logger.exception("Seed failed — transaction rolled back.")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
    )
    seed_fpbase()
