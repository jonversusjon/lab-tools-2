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
  excitation_max_nm: number
  emission_max_nm: number
  source: string
}

export interface FluorophoreSpectra {
  id: string
  name: string
  spectra: {
    excitation: number[][]
    emission: number[][]
  } | null
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
  excitation_max_nm: number
  emission_max_nm: number
  source?: string
  spectra?: Record<string, number[][]> | null
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
