from __future__ import annotations

from datetime import datetime
from typing import Generic
from typing import TypeVar

from pydantic import BaseModel

T = TypeVar("T")


class PaginatedResponse(BaseModel, Generic[T]):
    items: list[T]
    total: int
    skip: int
    limit: int


# --- Detector ---

class DetectorBase(BaseModel):
    filter_midpoint: int
    filter_width: int
    name: str | None = None


class DetectorCreate(DetectorBase):
    pass


class DetectorRead(DetectorBase):
    id: str
    laser_id: str

    model_config = {"from_attributes": True}


# --- Laser ---

class LaserBase(BaseModel):
    wavelength_nm: int
    name: str


class LaserCreate(LaserBase):
    detectors: list[DetectorCreate] = []


class LaserRead(LaserBase):
    id: str
    instrument_id: str
    detectors: list[DetectorRead] = []

    model_config = {"from_attributes": True}


# --- Instrument ---

class InstrumentBase(BaseModel):
    name: str


class InstrumentCreate(InstrumentBase):
    lasers: list[LaserCreate] = []


class InstrumentUpdate(InstrumentBase):
    lasers: list[LaserCreate] = []


class InstrumentRead(InstrumentBase):
    id: str
    lasers: list[LaserRead] = []

    model_config = {"from_attributes": True}


# --- Fluorophore ---

class FluorophoreBase(BaseModel):
    name: str
    excitation_max_nm: int
    emission_max_nm: int
    source: str = "user"


class FluorophoreCreate(FluorophoreBase):
    spectra: dict | None = None


class FluorophoreRead(FluorophoreBase):
    id: str

    model_config = {"from_attributes": True}


class FluorophoreSpectraRead(BaseModel):
    id: str
    name: str
    spectra: dict | None = None

    model_config = {"from_attributes": True}


class BatchSpectraRequest(BaseModel):
    ids: list[str]


class FetchFpbaseRequest(BaseModel):
    name: str


# --- Antibody ---

class AntibodyBase(BaseModel):
    target: str
    clone: str | None = None
    host: str | None = None
    isotype: str | None = None
    fluorophore_id: str | None = None
    vendor: str | None = None
    catalog_number: str | None = None


class AntibodyCreate(AntibodyBase):
    pass


class AntibodyUpdate(AntibodyBase):
    pass


class AntibodyRead(AntibodyBase):
    id: str

    model_config = {"from_attributes": True}


# --- PanelTarget ---

class PanelTargetCreate(BaseModel):
    antibody_id: str


class PanelTargetRead(BaseModel):
    id: str
    panel_id: str
    antibody_id: str
    sort_order: int

    model_config = {"from_attributes": True}


# --- PanelAssignment ---

class PanelAssignmentCreate(BaseModel):
    antibody_id: str
    fluorophore_id: str
    detector_id: str
    notes: str | None = None


class PanelAssignmentRead(BaseModel):
    id: str
    panel_id: str
    antibody_id: str
    fluorophore_id: str
    detector_id: str
    notes: str | None = None

    model_config = {"from_attributes": True}


# --- Panel ---

class PanelBase(BaseModel):
    name: str
    instrument_id: str | None = None


class PanelCreate(PanelBase):
    pass


class PanelUpdate(PanelBase):
    pass


class PanelRead(PanelBase):
    id: str
    created_at: datetime | None = None
    updated_at: datetime | None = None
    targets: list[PanelTargetRead] = []
    assignments: list[PanelAssignmentRead] = []

    model_config = {"from_attributes": True}
