from __future__ import annotations

import json
import sys
from contextlib import asynccontextmanager
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy import event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# Ensure backend package is importable
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from database import Base
from database import get_db
from main import app
from models import Antibody
from models import Detector
from models import Fluorophore
from models import Instrument
from models import Laser

SEED_DIR = Path(__file__).resolve().parent.parent / "seed_data"


# Override the lifespan so TestClient doesn't run the production seed loader
@asynccontextmanager
async def _test_lifespan(app):
    yield


app.router.lifespan_context = _test_lifespan


def _make_test_engine():
    eng = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(eng, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    return eng


def _load_seed(session):
    """Load seed data into the test database."""
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

    with open(SEED_DIR / "antibodies.json") as f:
        antibodies_data = json.load(f)
    for ab_data in antibodies_data:
        antibody = Antibody(
            target=ab_data["target"],
            clone=ab_data.get("clone"),
            host=ab_data.get("host"),
            isotype=ab_data.get("isotype"),
            fluorophore_id=ab_data.get("fluorophore_id"),
        )
        session.add(antibody)

    session.commit()


@pytest.fixture(autouse=True)
def db_session():
    engine = _make_test_engine()
    Base.metadata.create_all(bind=engine)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = SessionLocal()
    _load_seed(session)
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def client(db_session):
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
