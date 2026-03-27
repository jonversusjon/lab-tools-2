from __future__ import annotations

import uuid

from sqlalchemy import Boolean
from sqlalchemy import Column
from sqlalchemy import DateTime
from sqlalchemy import Float
from sqlalchemy import ForeignKey
from sqlalchemy import Index
from sqlalchemy import Integer
from sqlalchemy import String
from sqlalchemy import Text
from sqlalchemy import UniqueConstraint
from sqlalchemy import func
from sqlalchemy.orm import relationship

from database import Base


class Instrument(Base):
    __tablename__ = "instruments"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)

    lasers = relationship("Laser", back_populates="instrument", cascade="all, delete-orphan")


class Laser(Base):
    __tablename__ = "lasers"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    instrument_id = Column(
        String(36),
        ForeignKey("instruments.id", ondelete="CASCADE"),
        nullable=False,
    )
    wavelength_nm = Column(Integer, nullable=False)
    name = Column(String, nullable=False)

    instrument = relationship("Instrument", back_populates="lasers")
    detectors = relationship("Detector", back_populates="laser", cascade="all, delete-orphan")


class Detector(Base):
    __tablename__ = "detectors"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    laser_id = Column(
        String(36),
        ForeignKey("lasers.id", ondelete="CASCADE"),
        nullable=False,
    )
    filter_midpoint = Column(Integer, nullable=False)
    filter_width = Column(Integer, nullable=False)
    name = Column(String, nullable=True)

    laser = relationship("Laser", back_populates="detectors")


class Fluorophore(Base):
    __tablename__ = "fluorophores"

    # FPbase slug (e.g. "egfp", "alexa-fluor-488") or user-generated UUID for user-created dyes
    id = Column(String(100), primary_key=True)
    name = Column(String, nullable=False, unique=True)
    fluor_type = Column(String, nullable=True)  # "protein" or "dye"
    source = Column(String, nullable=False, default="FPbase")
    ex_max_nm = Column(Float, nullable=True)
    em_max_nm = Column(Float, nullable=True)
    ext_coeff = Column(Float, nullable=True)
    qy = Column(Float, nullable=True)
    lifetime_ns = Column(Float, nullable=True)
    oligomerization = Column(String, nullable=True)
    switch_type = Column(String, nullable=True)
    has_spectra = Column(Boolean, nullable=False, default=False)

    spectra_records = relationship(
        "FluorophoreSpectrum",
        back_populates="fluorophore",
        cascade="all, delete-orphan",
    )


class FluorophoreSpectrum(Base):
    __tablename__ = "fluorophore_spectra"

    id = Column(Integer, primary_key=True, autoincrement=True)
    fluorophore_id = Column(
        String(100),
        ForeignKey("fluorophores.id", ondelete="CASCADE"),
        nullable=False,
    )
    spectrum_type = Column(String(10), nullable=False)  # EX, EM, AB, A_2P
    wavelength_nm = Column(Float, nullable=False)
    intensity = Column(Float, nullable=False)

    __table_args__ = (
        Index("ix_fluor_spectra", "fluorophore_id", "spectrum_type", "wavelength_nm"),
    )

    fluorophore = relationship("Fluorophore", back_populates="spectra_records")


class Antibody(Base):
    __tablename__ = "antibodies"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    target = Column(String, nullable=False)
    clone = Column(String, nullable=True)
    host = Column(String, nullable=True)
    isotype = Column(String, nullable=True)
    fluorophore_id = Column(
        String(100),
        ForeignKey("fluorophores.id", ondelete="SET NULL"),
        nullable=True,
    )
    vendor = Column(String, nullable=True)
    catalog_number = Column(String, nullable=True)

    fluorophore = relationship("Fluorophore")


class Panel(Base):
    __tablename__ = "panels"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    instrument_id = Column(
        String(36),
        ForeignKey("instruments.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    instrument = relationship("Instrument")
    targets = relationship("PanelTarget", back_populates="panel", cascade="all, delete-orphan")
    assignments = relationship("PanelAssignment", back_populates="panel", cascade="all, delete-orphan")


class PanelTarget(Base):
    __tablename__ = "panel_targets"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    panel_id = Column(
        String(36),
        ForeignKey("panels.id", ondelete="CASCADE"),
        nullable=False,
    )
    antibody_id = Column(
        String(36),
        ForeignKey("antibodies.id", ondelete="CASCADE"),
        nullable=False,
    )
    sort_order = Column(Integer, default=0)

    __table_args__ = (
        UniqueConstraint("panel_id", "antibody_id", name="uq_panel_target"),
    )

    panel = relationship("Panel", back_populates="targets")
    antibody = relationship("Antibody")


class PanelAssignment(Base):
    __tablename__ = "panel_assignments"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    panel_id = Column(
        String(36),
        ForeignKey("panels.id", ondelete="CASCADE"),
        nullable=False,
    )
    antibody_id = Column(
        String(36),
        ForeignKey("antibodies.id", ondelete="CASCADE"),
        nullable=False,
    )
    fluorophore_id = Column(
        String(100),
        ForeignKey("fluorophores.id", ondelete="CASCADE"),
        nullable=False,
    )
    detector_id = Column(
        String(36),
        ForeignKey("detectors.id", ondelete="CASCADE"),
        nullable=False,
    )
    notes = Column(Text, nullable=True)

    __table_args__ = (
        UniqueConstraint("panel_id", "antibody_id", name="uq_panel_antibody"),
        UniqueConstraint("panel_id", "detector_id", name="uq_panel_detector"),
    )

    panel = relationship("Panel", back_populates="assignments")
    antibody = relationship("Antibody")
    fluorophore = relationship("Fluorophore")
    detector = relationship("Detector")
