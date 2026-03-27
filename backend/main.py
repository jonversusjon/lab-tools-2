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
    """Load seed data atomically if the instruments table is empty."""
    session = SessionLocal()
    try:
        count = session.scalar(select(Instrument.id).limit(1))
        if count is not None:
            logger.info("Seed data already present — skipping.")
            return

        logger.info("Loading seed data...")

        # Load instruments
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

        # Load fluorophores
        with open(SEED_DIR / "fluorophores.json") as f:
            fluorophores_data = json.load(f)

        for fl_data in fluorophores_data:
            source = fl_data.get("source", "seed")
            if source == "gaussian_approximation":
                source = "seed"
            fluorophore = Fluorophore(
                name=fl_data["name"],
                excitation_max_nm=fl_data["excitation_max_nm"],
                emission_max_nm=fl_data["emission_max_nm"],
                spectra=fl_data.get("spectra"),
                source=source,
            )
            session.add(fluorophore)

        # Load antibodies
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
            "Seed data loaded: %d instruments, %d fluorophores, %d antibodies",
            len(instruments_data),
            len(fluorophores_data),
            len(antibodies_data),
        )
    except Exception:
        session.rollback()
        logger.exception("Failed to load seed data — rolled back.")
        raise
    finally:
        session.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    load_seed_data()
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
