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
from models import Detector
from models import Fluorophore
from models import Instrument
from models import Laser
from routers import antibodies
from routers import fluorophores
from routers import instruments
from routers import panels

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
