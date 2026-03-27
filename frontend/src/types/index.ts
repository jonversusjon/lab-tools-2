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

export interface Antibody {
  id: string
  target: string
  clone: string | null
  host: string | null
  isotype: string | null
  fluorophore_id: string | null
  vendor: string | null
  catalog_number: string | null
  fluorophore_name: string | null
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

export interface PanelTarget {
  id: string
  panel_id: string
  antibody_id: string
  sort_order: number
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
  clone?: string | null
  host?: string | null
  isotype?: string | null
  fluorophore_id?: string | null
  vendor?: string | null
  catalog_number?: string | null
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

export interface FpbaseCatalogItem {
  name: string
  id: string
}

export interface BatchFetchFpbaseResult {
  fetched: Fluorophore[]
  errors: { name: string; detail: string }[]
}
