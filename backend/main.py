from __future__ import annotations

import json
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy import text

from database import Base
from database import SessionLocal
from database import engine
from models import Antibody
from models import AntibodyTag
from models import Fluorophore
from models import Instrument
from routers import antibodies
from routers import conjugate_chemistries
from routers import fluorophores
from routers import instruments
from routers import list_entries
from routers import panels
from routers import preferences
from routers import secondaries
from routers import tags

logger = logging.getLogger(__name__)
SEED_DIR = Path(__file__).parent / "seed_data"


def load_seed_data() -> None:
    """Load instruments from seed JSON if instruments table is empty."""
    session = SessionLocal()
    try:
        count = session.scalar(select(Instrument.id).limit(1))
        if count is not None:
            logger.info("Seed data already present — skipping.")
            return

        logger.info("Loading seed data (instruments)...")

        with open(SEED_DIR / "instruments.json") as f:
            instruments_data = json.load(f)

        from models import Detector
        from models import Laser

        for inst_data in instruments_data:
            instrument = Instrument(name=inst_data["name"])
            session.add(instrument)
            session.flush()
            for laser_data in inst_data.get("lasers", []):
                laser = Laser(
                    instrument_id=instrument.id,
                    wavelength_nm=laser_data["wavelength_nm"],
                    name=laser_data["name"],
                )
                session.add(laser)
                session.flush()
                for det_data in laser_data.get("detectors", []):
                    detector = Detector(
                        laser_id=laser.id,
                        filter_midpoint=det_data["filter_midpoint"],
                        filter_width=det_data["filter_width"],
                        name=det_data.get("name"),
                    )
                    session.add(detector)

        session.commit()
        logger.info(
            "Seed data loaded: %d instruments",
            len(instruments_data),
        )
    except Exception:
        session.rollback()
        logger.exception("Failed to load seed data — rolled back.")
        raise
    finally:
        session.close()


DEFAULT_TAGS = [
    {"name": "stress markers", "color": "#ef4444"},
    {"name": "neuron identity", "color": "#3b82f6"},
    {"name": "ENS", "color": "#8b5cf6"},
    {"name": "glia", "color": "#06b6d4"},
    {"name": "neurotransmitter", "color": "#f59e0b"},
    {"name": "surface", "color": "#10b981"},
    {"name": "intracellular", "color": "#6366f1"},
    {"name": "flow validated", "color": "#22c55e"},
]


def seed_tags_if_needed() -> None:
    """Seed default antibody tags if none exist."""
    session = SessionLocal()
    try:
        count = session.scalar(select(AntibodyTag.id).limit(1))
        if count is not None:
            return

        logger.info("Seeding default antibody tags...")
        for tag_data in DEFAULT_TAGS:
            tag = AntibodyTag(name=tag_data["name"], color=tag_data["color"])
            session.add(tag)
        session.commit()
        logger.info("Seeded %d default tags.", len(DEFAULT_TAGS))
    except Exception:
        session.rollback()
        logger.exception("Failed to seed tags.")
    finally:
        session.close()


def seed_fluorophores_if_needed() -> None:
    """Seed FPbase fluorophore data if the fluorophores table is empty."""
    session = SessionLocal()
    try:
        count = session.scalar(select(Fluorophore.id).limit(1))
        if count is not None:
            return
    finally:
        session.close()

    fpbase_data_dir = Path(__file__).parent.parent / "fpbase_data"
    if not (fpbase_data_dir / "fpbase_spectra_long.parquet").exists():
        logger.warning(
            "FPbase data files not found at %s — skipping fluorophore seed. "
            "Run 'python seed_fpbase.py' to populate the fluorophore database.",
            fpbase_data_dir,
        )
        return

    logger.info("Seeding FPbase fluorophore data (first-time setup, may take a minute)...")
    try:
        from seed_fpbase import seed_fpbase
        seed_fpbase()
    except Exception:
        logger.exception(
            "Failed to seed FPbase fluorophore data. "
            "Try running 'python seed_fpbase.py' manually."
        )


NON_FLUORESCENT_CONJUGATES = [
    {"id": "biotin", "name": "Biotin", "fluor_type": "non-fluorescent", "source": "system"},
    {"id": "hrp", "name": "HRP", "fluor_type": "non-fluorescent", "source": "system"},
    {"id": "ap", "name": "Alkaline Phosphatase", "fluor_type": "non-fluorescent", "source": "system"},
    {"id": "digoxigenin", "name": "Digoxigenin", "fluor_type": "non-fluorescent", "source": "system"},
    {"id": "agarose", "name": "Agarose", "fluor_type": "non-fluorescent", "source": "system"},
    {"id": "gold-np", "name": "Gold Nanoparticle", "fluor_type": "non-fluorescent", "source": "system"},
]


def seed_non_fluorescent_conjugates() -> None:
    """Seed non-fluorescent conjugates into the fluorophores table (idempotent)."""
    session = SessionLocal()
    try:
        for entry in NON_FLUORESCENT_CONJUGATES:
            existing = session.get(Fluorophore, entry["id"])
            if existing is not None:
                continue
            fl = Fluorophore(
                id=entry["id"],
                name=entry["name"],
                fluor_type=entry["fluor_type"],
                source=entry["source"],
                has_spectra=False,
                is_favorite=False,
            )
            session.add(fl)
        session.commit()
        logger.info("Non-fluorescent conjugates seeded.")
    except Exception:
        session.rollback()
        logger.exception("Failed to seed non-fluorescent conjugates.")
    finally:
        session.close()


DEFAULT_HOSTS = [
    "Goat", "Donkey", "Chicken", "Rabbit", "Rat", "Mouse", "N/A",
]

DEFAULT_TARGET_SPECIES = [
    "Mouse", "Rabbit", "Rat", "Human", "Goat",
    "Armenian Hamster", "Syrian Hamster", "Biotin",
]


def seed_list_entries_if_needed() -> None:
    """Seed default host and target_species list entries if none exist."""
    from models import ListEntry

    session = SessionLocal()
    try:
        has_hosts = session.scalar(
            select(ListEntry.id).where(ListEntry.list_type == "host").limit(1)
        )
        if has_hosts is None:
            logger.info("Seeding default host list entries...")
            for i, value in enumerate(DEFAULT_HOSTS):
                session.add(ListEntry(list_type="host", value=value, sort_order=i))
            session.commit()
            logger.info("Seeded %d host entries.", len(DEFAULT_HOSTS))

        has_targets = session.scalar(
            select(ListEntry.id).where(ListEntry.list_type == "target_species").limit(1)
        )
        if has_targets is None:
            logger.info("Seeding default target species list entries...")
            for i, value in enumerate(DEFAULT_TARGET_SPECIES):
                session.add(ListEntry(list_type="target_species", value=value, sort_order=i))
            session.commit()
            logger.info("Seeded %d target species entries.", len(DEFAULT_TARGET_SPECIES))
    except Exception:
        session.rollback()
        logger.exception("Failed to seed list entries.")
    finally:
        session.close()


def migrate_dilution_factors() -> None:
    """One-time migration: parse existing free-text dilution fields into integer factors."""
    from services.dilutions import parse_dilution

    session = SessionLocal()
    try:
        antibodies = session.query(Antibody).filter(
            Antibody.flow_dilution_factor.is_(None) | Antibody.icc_if_dilution_factor.is_(None) | Antibody.wb_dilution_factor.is_(None)
        ).all()
        updated = 0
        for ab in antibodies:
            changed = False
            if ab.flow_dilution_factor is None and ab.flow_dilution:
                factor = parse_dilution(ab.flow_dilution)
                if factor is not None:
                    ab.flow_dilution_factor = factor
                    changed = True
            if ab.icc_if_dilution_factor is None and ab.icc_if_dilution:
                factor = parse_dilution(ab.icc_if_dilution)
                if factor is not None:
                    ab.icc_if_dilution_factor = factor
                    changed = True
            if ab.wb_dilution_factor is None and ab.wb_dilution:
                factor = parse_dilution(ab.wb_dilution)
                if factor is not None:
                    ab.wb_dilution_factor = factor
                    changed = True
            if changed:
                updated += 1
        if updated:
            session.commit()
            logger.info("Migrated dilution factors for %d antibodies.", updated)
    except Exception:
        session.rollback()
        logger.exception("Failed to migrate dilution factors.")
    finally:
        session.close()


def migrate_instrument_fields() -> None:
    """One-time migration: add is_favorite, location to instruments and create instrument_views."""
    session = SessionLocal()
    try:
        conn = session.connection()
        result = conn.execute(text("PRAGMA table_info(instruments)"))
        existing_cols = {row[1] for row in result.fetchall()}
        if "is_favorite" not in existing_cols:
            conn.execute(
                text("ALTER TABLE instruments ADD COLUMN is_favorite BOOLEAN NOT NULL DEFAULT 0")
            )
            logger.info("Added is_favorite column to instruments.")
        if "location" not in existing_cols:
            conn.execute(
                text("ALTER TABLE instruments ADD COLUMN location VARCHAR DEFAULT NULL")
            )
            logger.info("Added location column to instruments.")
        session.commit()
    except Exception:
        session.rollback()
        logger.exception("Failed to migrate instruments fields.")
    finally:
        session.close()


def migrate_secondary_binding_mode() -> None:
    """One-time migration: add binding_mode and target_conjugate columns to secondary_antibodies."""
    session = SessionLocal()
    try:
        conn = session.connection()
        # Check if columns already exist
        result = conn.execute(
            text("PRAGMA table_info(secondary_antibodies)")
        )
        existing_cols = {row[1] for row in result.fetchall()}
        if "binding_mode" not in existing_cols:
            conn.execute(
                text(
                    "ALTER TABLE secondary_antibodies ADD COLUMN binding_mode VARCHAR(20) NOT NULL DEFAULT 'species'"
                )
            )
            logger.info("Added binding_mode column to secondary_antibodies.")
        if "target_conjugate" not in existing_cols:
            conn.execute(
                text(
                    "ALTER TABLE secondary_antibodies ADD COLUMN target_conjugate VARCHAR DEFAULT NULL"
                )
            )
            logger.info("Added target_conjugate column to secondary_antibodies.")
        session.commit()
    except Exception:
        session.rollback()
        logger.exception("Failed to migrate secondary_antibodies binding_mode.")
    finally:
        session.close()


DEFAULT_CONJUGATE_CHEMISTRIES = [
    {"name": "biotin", "label": "Streptavidin / Anti-Biotin"},
    {"name": "dig", "label": "Anti-DIG"},
    {"name": "digoxigenin", "label": "Anti-DIG"},
    {"name": "hrp", "label": "Anti-HRP"},
    {"name": "ap", "label": "Anti-AP"},
    {"name": "alkaline phosphatase", "label": "Anti-Alkaline Phosphatase"},
    {"name": "gold", "label": "Anti-Gold"},
    {"name": "agarose", "label": "Anti-Agarose"},
]


def seed_conjugate_chemistries_if_needed() -> None:
    """Seed default conjugate chemistries if none exist."""
    from models import ConjugateChemistry

    session = SessionLocal()
    try:
        count = session.scalar(select(ConjugateChemistry.id).limit(1))
        if count is not None:
            return

        logger.info("Seeding default conjugate chemistries...")
        for i, entry in enumerate(DEFAULT_CONJUGATE_CHEMISTRIES):
            session.add(ConjugateChemistry(
                name=entry["name"],
                label=entry["label"],
                sort_order=i,
            ))
        session.commit()
        logger.info("Seeded %d conjugate chemistries.", len(DEFAULT_CONJUGATE_CHEMISTRIES))
    except Exception:
        session.rollback()
        logger.exception("Failed to seed conjugate chemistries.")
    finally:
        session.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    migrate_instrument_fields()
    migrate_secondary_binding_mode()
    load_seed_data()
    seed_fluorophores_if_needed()
    seed_non_fluorescent_conjugates()
    seed_tags_if_needed()
    seed_list_entries_if_needed()
    seed_conjugate_chemistries_if_needed()
    migrate_dilution_factors()
    yield


app = FastAPI(title="Flow Panel Designer", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(instruments.router, prefix="/api/v1/instruments", tags=["instruments"])
app.include_router(fluorophores.router, prefix="/api/v1/fluorophores", tags=["fluorophores"])
app.include_router(antibodies.router, prefix="/api/v1/antibodies", tags=["antibodies"])
app.include_router(panels.router, prefix="/api/v1/panels", tags=["panels"])
app.include_router(secondaries.router, prefix="/api/v1/secondary-antibodies", tags=["secondary-antibodies"])
app.include_router(tags.router, prefix="/api/v1/tags", tags=["tags"])
app.include_router(preferences.router, prefix="/api/v1/preferences", tags=["preferences"])
app.include_router(list_entries.router, prefix="/api/v1/list-entries", tags=["list-entries"])
app.include_router(conjugate_chemistries.router, prefix="/api/v1/conjugate-chemistries", tags=["conjugate-chemistries"])
