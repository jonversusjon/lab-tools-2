export interface PaginatedResponse<T> {
  items: T[]
  total: number
  skip: number
  limit: number
}

export interface Detector {
  id: string
  laser_id: string
  filter_midpoint: number
  filter_width: number
  name: string | null
}

export interface Laser {
  id: string
  instrument_id: string
  wavelength_nm: number
  name: string
  detectors: Detector[]
}

export interface Instrument {
  id: string
  name: string
  lasers: Laser[]
}

export interface Fluorophore {
  id: string
  name: string
  fluor_type: string | null
  source: string
  ex_max_nm: number | null
  em_max_nm: number | null
  ext_coeff: number | null
  qy: number | null
  lifetime_ns: number | null
  oligomerization: string | null
  switch_type: string | null
  has_spectra: boolean
  is_favorite: boolean
}

/** Spectra data keyed by type: "EX", "EM", "AB", "A_2P" */
export type SpectraData = Record<string, number[][]>

export interface FluorophoreSpectra {
  fluorophore_id: string
  name: string
  spectra: SpectraData
}

export interface FluorophoreWithSpectra extends Fluorophore {
  spectra: SpectraData | null
}

export interface LaserCompatibility {
  wavelength_nm: number
  excitation_efficiency: number
}

export interface DetectorCompatibility {
  name: string | null
  center_nm: number
  bandwidth_nm: number
  collection_efficiency: number
  laser_wavelength_nm: number
}

export interface InstrumentCompatibility {
  instrument_id: string
  instrument_name: string
  laser_lines: LaserCompatibility[]
  detectors: DetectorCompatibility[]
}

export interface InstrumentCompatibilityResponse {
  fluorophore_id: string
  instrument_compatibilities: InstrumentCompatibility[]
}

export interface FluorophoreCompatibilityDetail {
  fluorophore_id: string
  name: string
  excitation_efficiency: number
  detection_efficiency: number
  is_favorite: boolean
}

export interface DetectorCompatibilityResponse {
  instrument_id: string
  min_excitation_pct: number
  min_detection_pct: number
  compatibility: Record<string, FluorophoreCompatibilityDetail[]>
}

export interface UserPreference {
  key: string
  value: string
}

export interface AntibodyTag {
  id: string
  name: string
  color: string | null
}

export interface AntibodyTagWithCount extends AntibodyTag {
  antibody_count: number
}

export interface Antibody {
  id: string
  name: string | null
  target: string
  clone: string | null
  host: string | null
  isotype: string | null
  fluorophore_id: string | null
  conjugate: string | null
  vendor: string | null
  catalog_number: string | null
  confirmed_in_stock: boolean
  date_received: string | null
  flow_dilution: string | null
  icc_if_dilution: string | null
  wb_dilution: string | null
  reacts_with: string[] | null
  storage_temp: string | null
  validation_notes: string | null
  notes: string | null
  website: string | null
  physical_location: string | null
  fluorophore_name: string | null
  is_favorite: boolean
  tags: AntibodyTag[]
  created_at: string | null
  updated_at: string | null
}

export interface PanelListItem {
  id: string
  name: string
  instrument_id: string | null
  created_at: string | null
  updated_at: string | null
  target_count: number
  assignment_count: number
}

export interface SecondaryAntibody {
  id: string
  name: string
  host: string
  target_species: string
  target_isotype: string | null
  fluorophore_id: string | null
  fluorophore_name: string | null
  vendor: string | null
  catalog_number: string | null
  lot_number: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface SecondaryAntibodyCreate {
  name: string
  host: string
  target_species: string
  target_isotype?: string | null
  fluorophore_id?: string | null
  vendor?: string | null
  catalog_number?: string | null
  lot_number?: string | null
  notes?: string | null
}

export interface PanelTarget {
  id: string
  panel_id: string
  antibody_id: string | null
  staining_mode: "direct" | "indirect"
  secondary_antibody_id: string | null
  sort_order: number
  antibody_name: string | null
  antibody_target: string | null
  secondary_antibody_name: string | null
  secondary_fluorophore_id: string | null
  secondary_fluorophore_name: string | null
}

export interface PanelTargetCreate {
  antibody_id?: string | null
  staining_mode?: "direct" | "indirect"
  secondary_antibody_id?: string | null
}

export interface PanelTargetUpdate {
  antibody_id?: string | null
  staining_mode?: "direct" | "indirect"
  secondary_antibody_id?: string | null
}

export interface PanelAssignment {
  id: string
  panel_id: string
  antibody_id: string
  fluorophore_id: string
  detector_id: string
  notes: string | null
}

export interface Panel {
  id: string
  name: string
  instrument_id: string | null
  created_at: string | null
  updated_at: string | null
  targets: PanelTarget[]
  assignments: PanelAssignment[]
}

export interface InstrumentCreate {
  name: string
  lasers?: LaserCreate[]
}

export interface LaserCreate {
  wavelength_nm: number
  name: string
  detectors?: DetectorCreate[]
}

export interface DetectorCreate {
  filter_midpoint: number
  filter_width: number
  name?: string | null
}

export interface FluorophoreCreate {
  name: string
  fluor_type?: string | null
  source?: string
  ex_max_nm?: number | null
  em_max_nm?: number | null
  ext_coeff?: number | null
  qy?: number | null
  lifetime_ns?: number | null
  oligomerization?: string | null
  switch_type?: string | null
}

export interface AntibodyCreate {
  target: string
  name?: string | null
  clone?: string | null
  host?: string | null
  isotype?: string | null
  fluorophore_id?: string | null
  conjugate?: string | null
  vendor?: string | null
  catalog_number?: string | null
  confirmed_in_stock?: boolean
  date_received?: string | null
  flow_dilution?: string | null
  icc_if_dilution?: string | null
  wb_dilution?: string | null
  reacts_with?: string[] | null
  storage_temp?: string | null
  validation_notes?: string | null
  notes?: string | null
  website?: string | null
  physical_location?: string | null
}

// --- CSV Import types ---

export interface ParsedAntibody {
  name: string | null
  catalog_number: string | null
  conjugate: string | null
  host_species: string | null
  isotype: string | null
  manufacturer: string | null
  confirmed_in_stock: boolean
  date_received: string | null
  flow_dilution: string | null
  icc_if_dilution: string | null
  wb_dilution: string | null
  reacts_with: string[]
  storage_temp: string | null
  validation_notes: string | null
  notes: string | null
  website: string | null
  physical_location: string | null
}

export interface NewAntibodyRow {
  csv_row_index: number
  parsed: ParsedAntibody
  missing_fields: string[]
  warnings: string[]
}

export interface ExistingAntibodyRow {
  csv_row_index: number
  name: string | null
  catalog_number: string | null
  existing_id: string
}

export interface ParseErrorRow {
  csv_row_index: number
  raw_row: Record<string, string>
  error: string
}

export interface CsvImportResponse {
  new_antibodies: NewAntibodyRow[]
  already_exists: ExistingAntibodyRow[]
  parse_errors: ParseErrorRow[]
  summary: {
    total_csv_rows: number
    new: number
    existing: number
    errors: number
  }
}

export interface ImportAntibodyItem {
  name?: string | null
  target?: string | null
  catalog_number?: string | null
  conjugate?: string | null
  host?: string | null
  isotype?: string | null
  vendor?: string | null
  confirmed_in_stock?: boolean
  date_received?: string | null
  flow_dilution?: string | null
  icc_if_dilution?: string | null
  wb_dilution?: string | null
  reacts_with?: string[]
  storage_temp?: string | null
  validation_notes?: string | null
  notes?: string | null
  website?: string | null
  physical_location?: string | null
}

export interface ImportConfirmResponse {
  imported: number
  errors: { name?: string; error: string }[]
}

export interface TagCreate {
  name: string
  color?: string | null
}

export interface PanelCreate {
  name: string
  instrument_id?: string | null
}

export interface PanelAssignmentCreate {
  antibody_id: string
  fluorophore_id: string
  detector_id: string
  notes?: string | null
}

export interface SecondaryImportItem {
  name: string
  host: string
  target_species: string
  target_isotype: string | null
  fluorophore_name: string | null
  fluorophore_id: string | null
  vendor: string | null
  catalog_number: string | null
  lot_number: string | null
  warnings: string[]
  row_number: number
}

export interface SecondaryImportResponse {
  items: SecondaryImportItem[]
  total_rows: number
  valid_rows: number
  warning_count: number
}

export interface SecondaryImportConfirmResponse {
  created: number
  skipped: number
  errors: string[]
}

export interface FpbaseCatalogItem {
  name: string
  id: string
}

export interface BatchFetchFpbaseResult {
  fetched: Fluorophore[]
  errors: { name: string; detail: string }[]
}
