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
    is_favorite = Column(Boolean, nullable=False, default=False)
    location = Column(String, nullable=True)

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
    is_favorite = Column(Boolean, nullable=False, default=False)

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
    name = Column(String, nullable=True)  # Full display name from CSV (e.g. "TUJ1 chk Millipore")
    target = Column(String, nullable=False)
    clone = Column(String, nullable=True)
    host = Column(String, nullable=True)
    isotype = Column(String, nullable=True)
    fluorophore_id = Column(
        String(100),
        ForeignKey("fluorophores.id", ondelete="SET NULL"),
        nullable=True,
    )
    conjugate = Column(String, nullable=True)  # e.g. "AF488", "PE", "FITC"
    vendor = Column(String, nullable=True)
    catalog_number = Column(String, nullable=True)
    confirmed_in_stock = Column(Boolean, nullable=False, default=False)
    date_received = Column(String, nullable=True)  # ISO date string
    flow_dilution = Column(String, nullable=True)
    icc_if_dilution = Column(String, nullable=True)
    wb_dilution = Column(String, nullable=True)
    flow_dilution_factor = Column(Integer, nullable=True)       # N in 1:N
    icc_if_dilution_factor = Column(Integer, nullable=True)     # N in 1:N
    wb_dilution_factor = Column(Integer, nullable=True)         # N in 1:N
    reacts_with = Column(Text, nullable=True)  # JSON array string
    storage_temp = Column(String, nullable=True)
    validation_notes = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
    website = Column(String, nullable=True)
    physical_location = Column(String, nullable=True)
    is_favorite = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("name", "catalog_number", name="uq_antibody_name_catalog"),
    )

    fluorophore = relationship("Fluorophore")
    tags = relationship(
        "AntibodyTag",
        secondary="antibody_tag_assignments",
        back_populates="antibodies",
    )


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


class SecondaryAntibody(Base):
    __tablename__ = "secondary_antibodies"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    host = Column(String, nullable=False)
    target_species = Column(String, nullable=False)
    target_isotype = Column(String, nullable=True)
    binding_mode = Column(String(20), nullable=False, default="species")
    target_conjugate = Column(String, nullable=True)
    fluorophore_id = Column(
        String(100),
        ForeignKey("fluorophores.id", ondelete="SET NULL"),
        nullable=True,
    )
    vendor = Column(String, nullable=True)
    catalog_number = Column(String, nullable=True)
    lot_number = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    fluorophore = relationship("Fluorophore")


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
        nullable=True,
    )
    staining_mode = Column(String(10), nullable=False, default="direct")
    secondary_antibody_id = Column(
        String(36),
        ForeignKey("secondary_antibodies.id", ondelete="SET NULL"),
        nullable=True,
    )
    sort_order = Column(Integer, nullable=False, default=0)

    panel = relationship("Panel", back_populates="targets")
    antibody = relationship("Antibody")
    secondary_antibody = relationship("SecondaryAntibody")


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


class AntibodyTag(Base):
    __tablename__ = "antibody_tags"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False, unique=True)
    color = Column(String, nullable=True)  # hex color for UI badge

    antibodies = relationship(
        "Antibody",
        secondary="antibody_tag_assignments",
        back_populates="tags",
    )


class AntibodyTagAssignment(Base):
    __tablename__ = "antibody_tag_assignments"

    antibody_id = Column(
        String(36),
        ForeignKey("antibodies.id", ondelete="CASCADE"),
        primary_key=True,
    )
    tag_id = Column(
        String(36),
        ForeignKey("antibody_tags.id", ondelete="CASCADE"),
        primary_key=True,
    )

class UserPreference(Base):
    __tablename__ = "user_preferences"

    key = Column(String, primary_key=True)
    value = Column(String, nullable=False)


class ListEntry(Base):
    __tablename__ = "list_entries"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    list_type = Column(String, nullable=False)  # "host" or "target_species"
    value = Column(String, nullable=False)
    sort_order = Column(Integer, nullable=False, default=0)

    __table_args__ = (
        UniqueConstraint("list_type", "value", name="uq_list_entry"),
    )


class ConjugateChemistry(Base):
    __tablename__ = "conjugate_chemistries"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False, unique=True)  # Lowercase key, e.g. "biotin"
    label = Column(String, nullable=False)  # Display label for binding partner, e.g. "Streptavidin / Anti-Biotin"
    sort_order = Column(Integer, nullable=False, default=0)


class InstrumentView(Base):
    __tablename__ = "instrument_views"

    id = Column(Integer, primary_key=True, autoincrement=True)
    instrument_id = Column(
        String(36),
        ForeignKey("instruments.id", ondelete="CASCADE"),
        nullable=False,
    )
    viewed_at = Column(DateTime, server_default=func.now())

    __table_args__ = (
        Index("ix_instrument_views_instrument_viewed", "instrument_id", "viewed_at"),
    )


class PlateMap(Base):
    __tablename__ = "plate_maps"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    plate_type = Column(String(20), nullable=False, default="96-well")
    well_data = Column(Text, nullable=False, default="{}")
    legend = Column(Text, nullable=False, default="{}")
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class Microscope(Base):
    __tablename__ = "microscopes"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    is_favorite = Column(Boolean, nullable=False, default=False)
    location = Column(String, nullable=True)

    lasers = relationship("MicroscopeLaser", back_populates="microscope", cascade="all, delete-orphan")


class MicroscopeLaser(Base):
    __tablename__ = "microscope_lasers"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    microscope_id = Column(
        String(36),
        ForeignKey("microscopes.id", ondelete="CASCADE"),
        nullable=False,
    )
    wavelength_nm = Column(Integer, nullable=False)
    name = Column(String, nullable=False)

    microscope = relationship("Microscope", back_populates="lasers")
    filters = relationship("MicroscopeFilter", back_populates="laser", cascade="all, delete-orphan")


class MicroscopeFilter(Base):
    __tablename__ = "microscope_filters"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    laser_id = Column(
        String(36),
        ForeignKey("microscope_lasers.id", ondelete="CASCADE"),
        nullable=False,
    )
    filter_midpoint = Column(Integer, nullable=False)
    filter_width = Column(Integer, nullable=False)
    name = Column(String, nullable=True)

    laser = relationship("MicroscopeLaser", back_populates="filters")


class MicroscopeView(Base):
    __tablename__ = "microscope_views"

    id = Column(Integer, primary_key=True, autoincrement=True)
    microscope_id = Column(
        String(36),
        ForeignKey("microscopes.id", ondelete="CASCADE"),
        nullable=False,
    )
    viewed_at = Column(DateTime, server_default=func.now())

    __table_args__ = (
        Index("ix_microscope_views_microscope_viewed", "microscope_id", "viewed_at"),
    )


class IFPanel(Base):
    __tablename__ = "if_panels"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    panel_type = Column(String(3), nullable=False, default="IF")
    microscope_id = Column(
        String(36),
        ForeignKey("microscopes.id", ondelete="SET NULL"),
        nullable=True,
    )
    view_mode = Column(String(10), nullable=False, default="simple")
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    microscope = relationship("Microscope")
    targets = relationship("IFPanelTarget", back_populates="panel", cascade="all, delete-orphan")
    assignments = relationship("IFPanelAssignment", back_populates="panel", cascade="all, delete-orphan")


class IFPanelTarget(Base):
    __tablename__ = "if_panel_targets"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    panel_id = Column(
        String(36),
        ForeignKey("if_panels.id", ondelete="CASCADE"),
        nullable=False,
    )
    antibody_id = Column(
        String(36),
        ForeignKey("antibodies.id", ondelete="CASCADE"),
        nullable=True,
    )
    staining_mode = Column(String(10), nullable=False, default="direct")
    secondary_antibody_id = Column(
        String(36),
        ForeignKey("secondary_antibodies.id", ondelete="SET NULL"),
        nullable=True,
    )
    sort_order = Column(Integer, nullable=False, default=0)

    panel = relationship("IFPanel", back_populates="targets")
    antibody = relationship("Antibody")
    secondary_antibody = relationship("SecondaryAntibody")


class IFPanelAssignment(Base):
    __tablename__ = "if_panel_assignments"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    panel_id = Column(
        String(36),
        ForeignKey("if_panels.id", ondelete="CASCADE"),
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
    filter_id = Column(
        String(36),
        ForeignKey("microscope_filters.id", ondelete="SET NULL"),
        nullable=True,
    )
    notes = Column(Text, nullable=True)

    __table_args__ = (
        UniqueConstraint("panel_id", "antibody_id", name="uq_if_panel_antibody"),
    )

    panel = relationship("IFPanel", back_populates="assignments")
    antibody = relationship("Antibody")
    fluorophore = relationship("Fluorophore")
    filter = relationship("MicroscopeFilter")
