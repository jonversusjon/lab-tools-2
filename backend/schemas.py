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
    location: str | None = None


class InstrumentCreate(InstrumentBase):
    lasers: list[LaserCreate] = []


class InstrumentUpdate(InstrumentBase):
    lasers: list[LaserCreate] = []


class InstrumentRead(InstrumentBase):
    id: str
    is_favorite: bool = False
    lasers: list[LaserRead] = []

    model_config = {"from_attributes": True}


class InstrumentExport(InstrumentBase):
    lasers: list[LaserCreate] = []


# --- MicroscopeFilter ---

class MicroscopeFilterBase(BaseModel):
    filter_midpoint: int
    filter_width: int
    name: str | None = None


class MicroscopeFilterCreate(MicroscopeFilterBase):
    pass


class MicroscopeFilterRead(MicroscopeFilterBase):
    id: str
    laser_id: str

    model_config = {"from_attributes": True}


# --- MicroscopeLaser ---

class MicroscopeLaserBase(BaseModel):
    wavelength_nm: int
    name: str
    excitation_type: str = "laser"  # "laser" | "arc"
    ex_filter_width: int | None = None


class MicroscopeLaserCreate(MicroscopeLaserBase):
    filters: list[MicroscopeFilterCreate] = []


class MicroscopeLaserRead(MicroscopeLaserBase):
    id: str
    microscope_id: str
    filters: list[MicroscopeFilterRead] = []

    model_config = {"from_attributes": True}


# --- Microscope ---

class MicroscopeBase(BaseModel):
    name: str
    location: str | None = None


class MicroscopeCreate(MicroscopeBase):
    lasers: list[MicroscopeLaserCreate] = []


class MicroscopeUpdate(MicroscopeBase):
    lasers: list[MicroscopeLaserCreate] = []


class MicroscopeRead(MicroscopeBase):
    id: str
    is_favorite: bool = False
    lasers: list[MicroscopeLaserRead] = []

    model_config = {"from_attributes": True}


class MicroscopeExport(MicroscopeBase):
    lasers: list[MicroscopeLaserCreate] = []


# --- Fluorophore ---

class FluorophoreRead(BaseModel):
    id: str
    name: str
    fluor_type: str | None = None
    source: str
    ex_max_nm: float | None = None
    em_max_nm: float | None = None
    ext_coeff: float | None = None
    qy: float | None = None
    lifetime_ns: float | None = None
    oligomerization: str | None = None
    switch_type: str | None = None
    has_spectra: bool
    is_favorite: bool = False

    model_config = {"from_attributes": True}


class FluorophoreCreate(BaseModel):
    name: str
    fluor_type: str | None = None
    source: str = "user"
    ex_max_nm: float | None = None
    em_max_nm: float | None = None
    ext_coeff: float | None = None
    qy: float | None = None
    lifetime_ns: float | None = None
    oligomerization: str | None = None
    switch_type: str | None = None


class FluorophoreSpectraResponse(BaseModel):
    fluorophore_id: str
    name: str
    spectra: dict[str, list[list[float]]]


class BatchSpectraRequest(BaseModel):
    ids: list[str]
    types: list[str] = ["EX", "EM"]


class LaserCompatibility(BaseModel):
    wavelength_nm: int
    excitation_efficiency: float


class DetectorCompatibility(BaseModel):
    name: str | None
    center_nm: int
    bandwidth_nm: int
    collection_efficiency: float
    laser_wavelength_nm: int


class InstrumentCompatibility(BaseModel):
    instrument_id: str
    instrument_name: str
    is_favorite: bool = False
    laser_lines: list[LaserCompatibility]
    detectors: list[DetectorCompatibility]


class InstrumentCompatibilityResponse(BaseModel):
    fluorophore_id: str
    instrument_compatibilities: list[InstrumentCompatibility]


class ListEntryCreate(BaseModel):
    value: str


class ListEntryUpdate(BaseModel):
    value: str


class ListEntryRead(BaseModel):
    id: str
    list_type: str
    value: str
    sort_order: int

    model_config = {"from_attributes": True}


class ConjugateChemistryCreate(BaseModel):
    name: str
    label: str


class ConjugateChemistryUpdate(BaseModel):
    name: str | None = None
    label: str | None = None


class ConjugateChemistryRead(BaseModel):
    id: str
    name: str
    label: str
    sort_order: int

    model_config = {"from_attributes": True}


class PreferenceBase(BaseModel):
    value: str


class PreferenceRead(PreferenceBase):
    key: str

    model_config = {"from_attributes": True}


class PreferenceUpdate(PreferenceBase):
    pass


class FluorophoreCompatibilityDetail(BaseModel):
    fluorophore_id: str
    name: str
    excitation_efficiency: float
    detection_efficiency: float
    is_favorite: bool


class DetectorCompatibilityResponse(BaseModel):
    instrument_id: str
    min_excitation_pct: int
    min_detection_pct: int
    compatibility: dict[str, list[FluorophoreCompatibilityDetail]]


# --- FPbase live-fetch schemas (kept for on-demand fetch from FPbase API) ---

class FetchFpbaseRequest(BaseModel):
    name: str


class BatchFetchFpbaseRequest(BaseModel):
    names: list[str]


class BatchFetchFpbaseResult(BaseModel):
    fetched: list[FluorophoreRead]
    errors: list[dict]


# --- Fluorophore Bulk Import ---

class FluorophoreImportItem(BaseModel):
    """A single fluorophore from a CSV or JSON import, after parsing."""
    name: str
    fluor_type: str | None = None
    ex_max_nm: float | None = None
    em_max_nm: float | None = None
    ext_coeff: float | None = None
    qy: float | None = None
    lifetime_ns: float | None = None
    oligomerization: str | None = None
    switch_type: str | None = None
    spectra: dict[str, list[list[float]]] | None = None
    row_number: int = 0
    warnings: list[str] = []


class FluorophoreImportDuplicate(BaseModel):
    row_number: int
    name: str
    existing_id: str


class FluorophoreImportError(BaseModel):
    row_number: int
    error: str
    raw_data: dict | None = None


class FluorophoreImportPreview(BaseModel):
    """Response from the parse/preview endpoint."""
    new_items: list[FluorophoreImportItem]
    duplicates: list[FluorophoreImportDuplicate]
    parse_errors: list[FluorophoreImportError]
    format_detected: str
    total_rows: int


class FluorophoreImportConfirmRequest(BaseModel):
    items: list[FluorophoreImportItem]


class FluorophoreImportConfirmResponse(BaseModel):
    created: int
    skipped: int
    errors: list[str]


class FpbaseCatalogItem(BaseModel):
    name: str
    id: str


# --- Antibody Tag ---

class TagCreate(BaseModel):
    name: str
    color: str | None = None


class TagRead(BaseModel):
    id: str
    name: str
    color: str | None = None

    model_config = {"from_attributes": True}


# --- Antibody ---

class AntibodyBase(BaseModel):
    target: str
    name: str | None = None
    clone: str | None = None
    host: str | None = None
    isotype: str | None = None
    fluorophore_id: str | None = None
    conjugate: str | None = None
    vendor: str | None = None
    catalog_number: str | None = None
    confirmed_in_stock: bool = False
    date_received: str | None = None
    flow_dilution: str | None = None
    icc_if_dilution: str | None = None
    wb_dilution: str | None = None
    flow_dilution_factor: int | None = None
    icc_if_dilution_factor: int | None = None
    wb_dilution_factor: int | None = None
    reacts_with: list[str] | None = None
    storage_temp: str | None = None
    validation_notes: str | None = None
    notes: str | None = None
    website: str | None = None
    physical_location: str | None = None


class AntibodyCreate(AntibodyBase):
    pass


class AntibodyUpdate(AntibodyBase):
    pass


class AntibodyRead(AntibodyBase):
    id: str
    fluorophore_name: str | None = None
    is_favorite: bool = False
    tags: list[TagRead] = []
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}


class FavoriteToggle(BaseModel):
    is_favorite: bool


# --- CSV Import ---

class ParsedAntibody(BaseModel):
    name: str | None = None
    catalog_number: str | None = None
    conjugate: str | None = None
    host_species: str | None = None
    isotype: str | None = None
    manufacturer: str | None = None
    confirmed_in_stock: bool = False
    date_received: str | None = None
    flow_dilution: str | None = None
    icc_if_dilution: str | None = None
    wb_dilution: str | None = None
    reacts_with: list[str] = []
    storage_temp: str | None = None
    validation_notes: str | None = None
    notes: str | None = None
    website: str | None = None
    physical_location: str | None = None


class NewAntibodyRow(BaseModel):
    csv_row_index: int
    parsed: ParsedAntibody
    missing_fields: list[str] = []
    warnings: list[str] = []


class ExistingAntibodyRow(BaseModel):
    csv_row_index: int
    name: str | None = None
    catalog_number: str | None = None
    existing_id: str


class ParseErrorRow(BaseModel):
    csv_row_index: int
    raw_row: dict
    error: str


class ImportSummary(BaseModel):
    total_csv_rows: int
    new: int
    existing: int
    errors: int


class CsvImportResponse(BaseModel):
    new_antibodies: list[NewAntibodyRow]
    already_exists: list[ExistingAntibodyRow]
    parse_errors: list[ParseErrorRow]
    summary: ImportSummary


class ImportAntibodyItem(BaseModel):
    name: str | None = None
    target: str | None = None
    catalog_number: str | None = None
    conjugate: str | None = None
    host: str | None = None
    isotype: str | None = None
    vendor: str | None = None
    confirmed_in_stock: bool = False
    date_received: str | None = None
    flow_dilution: str | None = None
    icc_if_dilution: str | None = None
    wb_dilution: str | None = None
    reacts_with: list[str] = []
    storage_temp: str | None = None
    validation_notes: str | None = None
    notes: str | None = None
    website: str | None = None
    physical_location: str | None = None


class ImportConfirmRequest(BaseModel):
    antibodies: list[ImportAntibodyItem]


class ImportConfirmResponse(BaseModel):
    imported: int
    errors: list[dict]


# --- Antibody Tag ---

class TagAssignRequest(BaseModel):
    tag_ids: list[str]


# --- Secondary Antibody ---

class SecondaryAntibodyCreate(BaseModel):
    name: str
    host: str
    target_species: str
    target_isotype: str | None = None
    binding_mode: str = "species"
    target_conjugate: str | None = None
    fluorophore_id: str | None = None
    vendor: str | None = None
    catalog_number: str | None = None
    lot_number: str | None = None
    notes: str | None = None


class SecondaryAntibodyUpdate(SecondaryAntibodyCreate):
    pass


class SecondaryImportItem(BaseModel):
    name: str
    host: str
    target_species: str
    target_isotype: str | None = None
    binding_mode: str = "species"
    target_conjugate: str | None = None
    fluorophore_name: str | None = None
    fluorophore_id: str | None = None
    vendor: str | None = None
    catalog_number: str | None = None
    lot_number: str | None = None
    warnings: list[str] = []
    row_number: int


class SecondaryImportResponse(BaseModel):
    items: list[SecondaryImportItem]
    total_rows: int
    valid_rows: int
    warning_count: int


class SecondaryImportConfirmRequest(BaseModel):
    items: list[SecondaryImportItem]


class SecondaryImportConfirmResponse(BaseModel):
    created: int
    skipped: int
    errors: list[str]


class SecondaryAntibodyResponse(BaseModel):
    id: str
    name: str
    host: str
    target_species: str
    target_isotype: str | None
    binding_mode: str
    target_conjugate: str | None
    fluorophore_id: str | None
    fluorophore_name: str | None = None
    vendor: str | None
    catalog_number: str | None
    lot_number: str | None
    notes: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# --- PanelTarget ---

class PanelTargetCreate(BaseModel):
    antibody_id: str | None = None
    staining_mode: str = "direct"
    secondary_antibody_id: str | None = None


class PanelTargetUpdate(BaseModel):
    antibody_id: str | None = None
    staining_mode: str | None = None
    secondary_antibody_id: str | None = None


class PanelTargetReorder(BaseModel):
    target_ids: list[str]


class PanelTargetRead(BaseModel):
    id: str
    panel_id: str
    antibody_id: str | None
    staining_mode: str
    secondary_antibody_id: str | None
    sort_order: int
    antibody_name: str | None = None
    antibody_target: str | None = None
    secondary_antibody_name: str | None = None
    secondary_fluorophore_id: str | None = None
    secondary_fluorophore_name: str | None = None

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


class PanelListRead(PanelBase):
    id: str
    created_at: datetime | None = None
    updated_at: datetime | None = None
    target_count: int = 0
    assignment_count: int = 0

    model_config = {"from_attributes": True}


class PanelRead(PanelBase):
    id: str
    created_at: datetime | None = None
    updated_at: datetime | None = None
    targets: list[PanelTargetRead] = []
    assignments: list[PanelAssignmentRead] = []

    model_config = {"from_attributes": True}


# --- IFPanelTarget ---

class IFPanelTargetCreate(BaseModel):
    antibody_id: str | None = None
    staining_mode: str = "direct"
    secondary_antibody_id: str | None = None
    dilution_override: str | None = None


class IFPanelTargetUpdate(BaseModel):
    antibody_id: str | None = None
    staining_mode: str | None = None
    secondary_antibody_id: str | None = None
    dilution_override: str | None = None


class IFPanelTargetReorder(BaseModel):
    target_ids: list[str]


class IFPanelTargetRead(BaseModel):
    id: str
    panel_id: str
    antibody_id: str | None
    staining_mode: str
    secondary_antibody_id: str | None
    sort_order: int
    antibody_name: str | None = None
    antibody_target: str | None = None
    secondary_antibody_name: str | None = None
    secondary_fluorophore_id: str | None = None
    secondary_fluorophore_name: str | None = None
    dilution_override: str | None = None
    antibody_icc_if_dilution: str | None = None

    model_config = {"from_attributes": True}


# --- IFPanelAssignment ---

class IFPanelAssignmentCreate(BaseModel):
    antibody_id: str
    fluorophore_id: str
    filter_id: str | None = None
    notes: str | None = None


class IFPanelAssignmentRead(BaseModel):
    id: str
    panel_id: str
    antibody_id: str
    fluorophore_id: str
    filter_id: str | None = None
    notes: str | None = None

    model_config = {"from_attributes": True}


# --- IFPanel ---

class IFPanelBase(BaseModel):
    name: str
    panel_type: str = "IF"
    microscope_id: str | None = None
    view_mode: str = "simple"


class IFPanelCreate(IFPanelBase):
    pass


class IFPanelUpdate(BaseModel):
    name: str | None = None
    panel_type: str | None = None
    microscope_id: str | None = None
    view_mode: str | None = None


class IFPanelListRead(IFPanelBase):
    id: str
    created_at: datetime | None = None
    updated_at: datetime | None = None
    target_count: int = 0
    assignment_count: int = 0

    model_config = {"from_attributes": True}


class IFPanelRead(IFPanelBase):
    id: str
    created_at: datetime | None = None
    updated_at: datetime | None = None
    targets: list[IFPanelTargetRead] = []
    assignments: list[IFPanelAssignmentRead] = []

    model_config = {"from_attributes": True}


# --- Plate Map ---

class PlateMapCreate(BaseModel):
    name: str
    description: str | None = None
    plate_type: str = "96-well"
    well_data: dict = {}
    legend: dict = {}


class PlateMapUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    plate_type: str | None = None
    well_data: dict | None = None
    legend: dict | None = None


class PlateMapRead(BaseModel):
    id: str
    name: str
    description: str | None
    plate_type: str
    well_data: dict
    legend: dict
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}


class PlateMapListRead(BaseModel):
    id: str
    name: str
    description: str | None
    plate_type: str
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}


# --- ExperimentBlock ---

class ExperimentBlockCreate(BaseModel):
    block_type: str
    content: dict = {}
    sort_order: float
    parent_id: str | None = None


class ExperimentBlockUpdate(BaseModel):
    block_type: str | None = None
    content: dict | None = None
    sort_order: float | None = None
    parent_id: str | None = None


class ExperimentBlockRead(BaseModel):
    id: str
    experiment_id: str
    block_type: str
    content: dict
    sort_order: float
    parent_id: str | None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}


class ExperimentBlockReorderItem(BaseModel):
    id: str
    sort_order: float
    parent_id: str | None = None


class ExperimentBlockReorder(BaseModel):
    blocks: list[ExperimentBlockReorderItem]


# --- Experiment ---

class ExperimentCreate(BaseModel):
    name: str
    description: str | None = None


class ExperimentUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


class ExperimentRead(BaseModel):
    id: str
    name: str
    description: str | None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    blocks: list[ExperimentBlockRead] = []

    model_config = {"from_attributes": True}


class ExperimentListRead(BaseModel):
    id: str
    name: str
    description: str | None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    block_count: int = 0

    model_config = {"from_attributes": True}


class SnapshotPanelRequest(BaseModel):
    source_panel_id: str
    panel_type: str  # "flow" | "if"
