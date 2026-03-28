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
from models import Detector
from models import Fluorophore
from models import Instrument
from models import Laser
from models import SecondaryAntibody
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
    """Load instruments and antibodies from seed JSON if instruments table is empty."""
    session = SessionLocal()
    try:
        count = session.scalar(select(Instrument.id).limit(1))
        if count is not None:
            logger.info("Seed data already present — skipping.")
            return

        logger.info("Loading seed data (instruments + antibodies)...")

        with open(SEED_DIR / "instruments.json") as f:
            instruments_data = json.load(f)

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

        with open(SEED_DIR / "antibodies.json") as f:
            antibodies_data = json.load(f)

        for ab_data in antibodies_data:
            antibody = Antibody(
                target=ab_data["target"],
                clone=ab_data.get("clone"),
                host=ab_data.get("host"),
                isotype=ab_data.get("isotype"),
                fluorophore_id=ab_data.get("fluorophore_id"),
                vendor=ab_data.get("vendor"),
                catalog_number=ab_data.get("catalog_number"),
            )
            session.add(antibody)

        session.commit()
        logger.info(
            "Seed data loaded: %d instruments, %d antibodies",
            len(instruments_data),
            len(antibodies_data),
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


def seed_secondary_antibodies_if_needed() -> None:
    """Seed secondary antibodies if none exist."""
    session = SessionLocal()
    try:
        count = session.scalar(select(SecondaryAntibody.id).limit(1))
        if count is not None:
            return

        logger.info("Seeding secondary antibodies...")
        with open(SEED_DIR / "secondary_antibodies.json") as f:
            secondaries_data = json.load(f)

        # Build a lookup of fluorophore names for matching
        fluorophores = list(session.scalars(select(Fluorophore)))
        fl_by_name_lower = {fl.name.lower(): fl for fl in fluorophores}

        for sa_data in secondaries_data:
            # Try to match fluorophore from the secondary name (e.g., "AF488" in name)
            fluorophore_id = None
            name = sa_data["name"]
            for fl_name, fl in fl_by_name_lower.items():
                if fl_name in name.lower():
                    fluorophore_id = fl.id
                    break

            sa = SecondaryAntibody(
                name=sa_data["name"],
                host=sa_data["host"],
                target_species=sa_data["target_species"],
                target_isotype=sa_data.get("target_isotype"),
                fluorophore_id=fluorophore_id,
                vendor=sa_data.get("vendor"),
                catalog_number=sa_data.get("catalog_number"),
            )
            session.add(sa)

        session.commit()
        logger.info("Seeded %d secondary antibodies.", len(secondaries_data))
    except Exception:
        session.rollback()
        logger.exception("Failed to seed secondary antibodies.")
    finally:
        session.close()


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


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    load_seed_data()
    seed_fluorophores_if_needed()
    seed_secondary_antibodies_if_needed()
    seed_tags_if_needed()
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
