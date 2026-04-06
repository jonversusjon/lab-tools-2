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
from models import AntibodyTag
from models import AntibodyTagAssignment
from models import Detector
from models import Experiment  # noqa: F401
from models import ExperimentBlock  # noqa: F401
from models import Fluorophore
from models import FluorophoreSpectrum
from models import Instrument
from models import Laser
from models import SecondaryAntibody

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


def _make_spectra_points(peak_nm: float, fwhm: float = 30.0) -> list[tuple]:
    """Generate a minimal Gaussian-shaped spectrum for test purposes."""
    import math

    sigma = fwhm / (2 * math.sqrt(2 * math.log(2)))
    points = []
    for wl in range(int(peak_nm) - 100, int(peak_nm) + 100, 2):
        intensity = math.exp(-0.5 * ((wl - peak_nm) / sigma) ** 2)
        if intensity >= 0.01:
            points.append((float(wl), round(intensity, 4)))
    return points


def _load_seed(session):
    """Load seed data into the test database."""
    # Load instruments from JSON
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

    # Create a small set of test fluorophores (FPbase-style schema)
    test_fluorophores = [
        {
            "id": "test-egfp",
            "name": "EGFP",
            "fluor_type": "protein",
            "source": "FPbase",
            "ex_max_nm": 488.0,
            "em_max_nm": 507.0,
            "ext_coeff": 56000.0,
            "qy": 0.60,
            "has_spectra": True,
            "ex_peak": 488.0,
            "em_peak": 507.0,
        },
        {
            "id": "test-mcherry",
            "name": "mCherry",
            "fluor_type": "protein",
            "source": "FPbase",
            "ex_max_nm": 587.0,
            "em_max_nm": 610.0,
            "ext_coeff": 72000.0,
            "qy": 0.22,
            "has_spectra": True,
            "ex_peak": 587.0,
            "em_peak": 610.0,
        },
        {
            "id": "test-dye-no-spectra",
            "name": "TestDyeNoSpectra",
            "fluor_type": "dye",
            "source": "FPbase",
            "ex_max_nm": 650.0,
            "em_max_nm": 670.0,
            "ext_coeff": None,
            "qy": None,
            "has_spectra": False,
            "ex_peak": None,
            "em_peak": None,
        },
    ]

    for fl_data in test_fluorophores:
        fl = Fluorophore(
            id=fl_data["id"],
            name=fl_data["name"],
            fluor_type=fl_data["fluor_type"],
            source=fl_data["source"],
            ex_max_nm=fl_data["ex_max_nm"],
            em_max_nm=fl_data["em_max_nm"],
            ext_coeff=fl_data.get("ext_coeff"),
            qy=fl_data.get("qy"),
            has_spectra=fl_data["has_spectra"],
        )
        session.add(fl)
        session.flush()

        if fl_data["has_spectra"]:
            for wl, intensity in _make_spectra_points(fl_data["ex_peak"]):
                session.add(
                    FluorophoreSpectrum(
                        fluorophore_id=fl.id,
                        spectrum_type="EX",
                        wavelength_nm=wl,
                        intensity=intensity,
                    )
                )
            for wl, intensity in _make_spectra_points(fl_data["em_peak"]):
                session.add(
                    FluorophoreSpectrum(
                        fluorophore_id=fl.id,
                        spectrum_type="EM",
                        wavelength_nm=wl,
                        intensity=intensity,
                    )
                )

    # Seed test antibodies
    test_antibodies = [
        {"target": "CD3", "clone": "UCHT1", "host": "Mouse", "isotype": "IgG1"},
        {"target": "CD4", "clone": "RPA-T4", "host": "Mouse", "isotype": "IgG1"},
        {"target": "CD8", "clone": "SK1", "host": "Mouse", "isotype": "IgG1"},
        {"target": "CD14", "clone": "M5E2", "host": "Mouse", "isotype": "IgG2a"},
        {"target": "CD19", "clone": "HIB19", "host": "Mouse", "isotype": "IgG1"},
        {"target": "CD25", "clone": "M-A251", "host": "Mouse", "isotype": "IgG1"},
        {"target": "CD45", "clone": "HI30", "host": "Mouse", "isotype": "IgG1"},
        {"target": "CD56", "clone": "NCAM16.2", "host": "Mouse", "isotype": "IgG2b"},
        {"target": "CD127", "clone": "A019D5", "host": "Mouse", "isotype": "IgG1"},
        {"target": "HLA-DR", "clone": "L243", "host": "Mouse", "isotype": "IgG2a"},
        {"target": "Ki-67", "clone": "Ki-67", "host": "Mouse", "isotype": "IgG1"},
        {"target": "FoxP3", "clone": "236A/E7", "host": "Mouse", "isotype": "IgG1"},
    ]
    for ab_data in test_antibodies:
        session.add(Antibody(
            target=ab_data["target"],
            clone=ab_data["clone"],
            host=ab_data["host"],
            isotype=ab_data["isotype"],
        ))

    # Seed secondary antibodies
    sa1 = SecondaryAntibody(
        id="test-secondary-with-fluor",
        name="Goat anti-Mouse IgG AF488",
        host="Goat",
        target_species="Mouse",
        target_isotype=None,
        fluorophore_id="test-egfp",
        vendor="Thermo Fisher",
        catalog_number="A-11001",
    )
    sa2 = SecondaryAntibody(
        id="test-secondary-no-fluor",
        name="Goat anti-Rabbit IgG",
        host="Goat",
        target_species="Rabbit",
        target_isotype=None,
        fluorophore_id=None,
        vendor="Thermo Fisher",
        catalog_number="A-21428",
    )
    session.add(sa1)
    session.add(sa2)

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
