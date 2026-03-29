from __future__ import annotations

import json
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from database import Base
from database import SessionLocal
from database import engine
from models import Antibody
from models import AntibodyTag
from models import Fluorophore
from models import Instrument
from routers import antibodies
from routers import fluorophores
from routers import instruments
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


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    load_seed_data()
    seed_fluorophores_if_needed()
    seed_non_fluorescent_conjugates()
    seed_tags_if_needed()
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
