/**
 * FlowPanelBlock tests
 *
 * Tests the panel block instance component as it appears embedded in an
 * experiment page. The block hydrates from a JSON snapshot rather than
 * live backend data, so every test uses synthetic snapshot content.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import FlowPanelBlock from '@/components/experiments/FlowPanelBlock'
import type { PanelLibraryData } from '@/components/experiments/FlowPanelBlock'
import type { ExperimentBlock, FlowPanelBlockContent, Antibody, Fluorophore, FluorophoreWithSpectra, Instrument } from '@/types'

vi.mock('react-chartjs-2', () => ({
  Line: () => <canvas data-testid="chart" />,
}))
vi.mock('chartjs-plugin-annotation', () => ({ default: {} }))

// ── Fixture IDs ───────────────────────────────────────────────────────────────
const EXP_ID    = 'exp-1'
const BLOCK_ID  = 'block-1'
const AB1_ID    = 'ab1'    // CD3 unconjugated
const AB2_ID    = 'ab2'    // CD45 pre-conjugated FITC
const FL1_ID    = 'fl-1'   // FITC
const INST_ID   = 'inst-1'
const INST2_ID  = 'inst-2'
const DET_D1    = 'd1'     // 530/30 — 488 nm

// ── Snapshot instrument ──────────────────────────────────────────────────────
const snapshotInstrument: FlowPanelBlockContent['instrument'] = {
  id: INST_ID,
  name: 'BD FACSAria III',
  lasers: [
    {
      id: 'l1', wavelength_nm: 488, name: 'Blue',
      detectors: [
        { id: DET_D1, filter_midpoint: 530, filter_width: 30, name: null },
        { id: 'd2',   filter_midpoint: 695, filter_width: 40, name: null },
      ],
    },
  ],
}

// ── Block content factory ────────────────────────────────────────────────────
function makeContent(overrides: Partial<FlowPanelBlockContent> = {}): FlowPanelBlockContent {
  return {
    source_panel_id: 'src-panel-1',
    name: 'Flow Panel Block',
    instrument: snapshotInstrument,
    targets: [
      {
        id: 't1', antibody_id: AB1_ID, antibody_name: 'anti-CD3',
        antibody_target: 'CD3', antibody_host: 'Mouse', antibody_clone: 'OKT3',
        dye_label_id: null, dye_label_name: null, dye_label_target: null,
        dye_label_fluorophore_id: null, dye_label_fluorophore_name: null,
        staining_mode: 'direct', secondary_antibody_id: null, secondary_antibody_name: null,
        sort_order: 0, flow_dilution_factor: 100, icc_if_dilution_factor: null,
      },
      {
        id: 't2', antibody_id: AB2_ID, antibody_name: 'anti-CD45',
        antibody_target: 'CD45', antibody_host: 'Mouse', antibody_clone: 'HI30',
        dye_label_id: null, dye_label_name: null, dye_label_target: null,
        dye_label_fluorophore_id: null, dye_label_fluorophore_name: null,
        staining_mode: 'direct', secondary_antibody_id: null, secondary_antibody_name: null,
        sort_order: 1, flow_dilution_factor: 200, icc_if_dilution_factor: null,
      },
    ],
    assignments: [
      {
        id: 'a1', antibody_id: AB1_ID, dye_label_id: null, fluorophore_id: FL1_ID,
        fluorophore_name: 'FITC', detector_id: DET_D1, detector_name: '530/30',
      },
    ],
    volume_params: {
      num_samples: 1, volume_per_sample_ul: 100, pipet_error_factor: 1.1, dilution_source: 'flow',
    },
    ...overrides,
  }
}

// ── ExperimentBlock factory ──────────────────────────────────────────────────
function makeBlock(content: FlowPanelBlockContent = makeContent()): ExperimentBlock {
  return {
    id: BLOCK_ID, experiment_id: EXP_ID, block_type: 'flow_panel',
    content: content as unknown as Record<string, unknown>,
    sort_order: 0, parent_id: null, created_at: null, updated_at: null,
  }
}

// ── Library data factory ─────────────────────────────────────────────────────
function makeAb(id: string, target: string, opts: Partial<Antibody> = {}): Antibody {
  return {
    id, target, name: null, clone: null, host: null, isotype: null,
    fluorophore_id: null, conjugate: null, fluorophore_name: null,
    vendor: null, catalog_number: null, confirmed_in_stock: false,
    date_received: null, flow_dilution: null, icc_if_dilution: null,
    wb_dilution: null, flow_dilution_factor: null, icc_if_dilution_factor: null,
    wb_dilution_factor: null, reacts_with: null, storage_temp: null,
    validation_notes: null, notes: null, website: null, physical_location: null,
    is_favorite: false, tags: [], created_at: null, updated_at: null,
    ...opts,
  }
}

const mockFluorophores: Fluorophore[] = [
  {
    id: FL1_ID, name: 'FITC', fluor_type: null, source: 'seed',
    ex_max_nm: 494, em_max_nm: 519, ext_coeff: null, qy: null, lifetime_ns: null,
    oligomerization: null, switch_type: null, has_spectra: false, is_favorite: false,
  },
]
const mockFluorophoresWithSpectra: FluorophoreWithSpectra[] = mockFluorophores.map((f) => ({ ...f, spectra: null }))

const mockInstrument1: Instrument = {
  id: INST_ID, name: 'BD FACSAria III', is_favorite: false, location: null,
  lasers: [
    {
      id: 'l1', instrument_id: INST_ID, wavelength_nm: 488, name: 'Blue',
      detectors: [
        { id: DET_D1, laser_id: 'l1', filter_midpoint: 530, filter_width: 30, name: null },
        { id: 'd2',   laser_id: 'l1', filter_midpoint: 695, filter_width: 40, name: null },
      ],
    },
  ],
}

const mockInstrument2: Instrument = {
  id: INST2_ID, name: 'Sony ID7000', is_favorite: false, location: null, lasers: [],
}

function makeLibraryData(overrides: Partial<PanelLibraryData> = {}): PanelLibraryData {
  return {
    antibodies: [
      makeAb(AB1_ID, 'CD3', { flow_dilution_factor: 100 }),
      makeAb(AB2_ID, 'CD45', { fluorophore_id: FL1_ID, fluorophore_name: 'FITC' }),
    ],
    allFluorophores: mockFluorophores,
    secondaries: [],
    conjugateChemistries: [],
    spectraCache: null,
    fluorophoresWithSpectra: mockFluorophoresWithSpectra,
    allFluorophoresForScoring: mockFluorophoresWithSpectra,
    instruments: [mockInstrument1, mockInstrument2],
    microscopes: [],
    dyeLabels: [],
    ...overrides,
  }
}

// ── Render helper ─────────────────────────────────────────────────────────────
function renderBlock(
  blockOverrides: Partial<FlowPanelBlockContent> = {},
  libraryOverrides: Partial<PanelLibraryData> = {}
) {
  const content = makeContent(blockOverrides)
  const block = makeBlock(content)
  const libraryData = makeLibraryData(libraryOverrides)
  return render(
    <FlowPanelBlock experimentId={EXP_ID} block={block} libraryData={libraryData} />
  )
}

// ════════════════════════════════════════════════════════════════════════════
describe('FlowPanelBlock', () => {
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockFetch = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', mockFetch)
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  // ── Initial render from snapshot ──────────────────────────────────────────
  describe('initial render from snapshot content', () => {
    it('renders the panel name from snapshot content', () => {
      renderBlock()
      expect(screen.getByRole('heading', { name: 'Flow Panel Block' })).toBeInTheDocument()
    })

    it('renders all target antibody names from snapshot content', () => {
      renderBlock()
      expect(screen.getByText('CD3')).toBeInTheDocument()
      expect(screen.getByText('CD45')).toBeInTheDocument()
    })

    it('renders the assigned fluorophore in the detector cell', () => {
      renderBlock()
      // AB1 (CD3) is assigned FITC at d1
      const cell = screen.getByTestId(`cell-${AB1_ID}-${DET_D1}`)
      expect(cell).toHaveAttribute('data-state', 'assigned')
      expect(cell).toHaveTextContent('FITC')
    })

    it('renders the laser group header from snapshot instrument', () => {
      renderBlock()
      // The laser header appears in both the column group <th> and the spectra section
      expect(screen.getAllByText('488nm Blue').length).toBeGreaterThan(0)
    })

    it('renders detector column headers from snapshot instrument', () => {
      renderBlock()
      expect(screen.getByText('530/30')).toBeInTheDocument()
      expect(screen.getByText('695/40')).toBeInTheDocument()
    })

    it('wraps the block in a container with data-block-id', () => {
      const { container } = renderBlock()
      expect(container.querySelector(`[data-block-id="${BLOCK_ID}"]`)).toBeInTheDocument()
    })
  })

  // ── Panel name from snapshot ──────────────────────────────────────────────
  describe('panel name — different content values', () => {
    it('renders custom panel name from block content', () => {
      renderBlock({ name: 'My Custom Flow Panel' })
      expect(screen.getByRole('heading', { name: 'My Custom Flow Panel' })).toBeInTheDocument()
    })
  })

  // ── Instrument selector ───────────────────────────────────────────────────
  describe('instrument selector', () => {
    it('renders the instrument dropdown', () => {
      renderBlock()
      expect(screen.getByLabelText(/Instrument/)).toBeInTheDocument()
    })

    it('instrument options come from libraryData.instruments', () => {
      renderBlock()
      expect(screen.getByRole('option', { name: 'BD FACSAria III' })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: 'Sony ID7000' })).toBeInTheDocument()
    })

    it('current instrument from snapshot is pre-selected', () => {
      renderBlock()
      const select = screen.getByLabelText(/Instrument/) as HTMLSelectElement
      expect(select.value).toBe(INST_ID)
    })
  })

  // ── Undo / Redo ───────────────────────────────────────────────────────────
  describe('Undo / Redo buttons', () => {
    it('renders Undo and Redo buttons', () => {
      renderBlock()
      expect(screen.getByText('Undo')).toBeInTheDocument()
      expect(screen.getByText('Redo')).toBeInTheDocument()
    })

    it('Undo button is initially disabled (no history yet)', () => {
      renderBlock()
      expect(screen.getByText('Undo')).toBeDisabled()
    })

    it('Redo button is initially disabled (no future yet)', () => {
      renderBlock()
      expect(screen.getByText('Redo')).toBeDisabled()
    })
  })

  // ── Auto-assign controls ──────────────────────────────────────────────────
  describe('auto-assign controls', () => {
    it('auto-assign toggle is rendered and defaults to on', () => {
      renderBlock()
      const toggle = screen.getByRole('switch')
      expect(toggle).toBeInTheDocument()
      expect(toggle).toHaveAttribute('aria-checked', 'true')
    })

    it('threshold slider is rendered', () => {
      renderBlock()
      expect(screen.getByRole('slider')).toBeInTheDocument()
    })

    it('clicking the toggle switches off auto-assign', () => {
      renderBlock()
      fireEvent.click(screen.getByRole('switch'))
      expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false')
    })
  })

  // ── Target interactions ───────────────────────────────────────────────────
  describe('target row interactions', () => {
    it('Remove target buttons are present for each target', () => {
      renderBlock()
      expect(screen.getAllByLabelText('Remove target')).toHaveLength(2)
    })

    it('clicking Remove target removes the row from the UI', () => {
      renderBlock()
      const removeBtns = screen.getAllByLabelText('Remove target')
      fireEvent.click(removeBtns[0])
      expect(screen.queryByText('CD3')).not.toBeInTheDocument()
      expect(screen.getByText('CD45')).toBeInTheDocument()
    })

    it('clicking "+ Add Target" shows the target search omnibox', () => {
      renderBlock()
      fireEvent.click(screen.getByText('Add Target'))
      expect(screen.getByPlaceholderText('Search antibody, dye, or label...')).toBeInTheDocument()
    })

    it('removing a pending row removes the omnibox', () => {
      renderBlock()
      fireEvent.click(screen.getByText('Add Target'))
      fireEvent.click(screen.getByLabelText('Remove pending row'))
      expect(screen.queryByPlaceholderText('Search antibody, dye, or label...')).not.toBeInTheDocument()
    })
  })

  // ── Auto-save on state changes ────────────────────────────────────────────
  describe('auto-save (debounced)', () => {
    it('calls fetch after removing a target when the debounce fires', async () => {
      vi.useFakeTimers()
      renderBlock()
      const removeBtns = screen.getAllByLabelText('Remove target')
      fireEvent.click(removeBtns[0])
      // Before debounce: no fetch
      expect(mockFetch).not.toHaveBeenCalled()
      // Fire the debounce
      await act(async () => {
        vi.advanceTimersByTime(1600)
      })
      expect(mockFetch).toHaveBeenCalledWith(
        `/api/v1/experiments/${EXP_ID}/blocks/${BLOCK_ID}`,
        expect.objectContaining({ method: 'PUT' })
      )
    })

    it('saves the updated content JSON with the PUT request', async () => {
      vi.useFakeTimers()
      renderBlock()
      fireEvent.click(screen.getAllByLabelText('Remove target')[0])
      await act(async () => {
        vi.advanceTimersByTime(1600)
      })
      const [, init] = mockFetch.mock.calls[0]
      const body = JSON.parse(init.body)
      // After removing CD3 (t1), only CD45 (t2) remains
      expect(body.content.targets).toHaveLength(1)
      expect(body.content.targets[0].antibody_target).toBe('CD45')
    })

    it('saves panel name change via auto-save', async () => {
      vi.useFakeTimers()
      renderBlock()
      // Click heading to enter edit mode
      fireEvent.click(screen.getByRole('heading', { name: 'Flow Panel Block' }))
      const input = screen.getByRole('textbox')
      fireEvent.change(input, { target: { value: 'Renamed Panel' } })
      fireEvent.keyDown(input, { key: 'Enter' })
      await act(async () => {
        vi.advanceTimersByTime(1600)
      })
      const [, init] = mockFetch.mock.calls[0]
      const body = JSON.parse(init.body)
      expect(body.content.name).toBe('Renamed Panel')
    })

    it('flushes unsaved state to fetch on unmount', () => {
      const { unmount } = renderBlock()
      const removeBtns = screen.getAllByLabelText('Remove target')
      fireEvent.click(removeBtns[0])
      // Unmount before debounce fires — should flush immediately
      unmount()
      // After unmount: fetch should have been called (keepalive flush)
      expect(mockFetch).toHaveBeenCalled()
    })
  })

  // ── Null instrument ───────────────────────────────────────────────────────
  describe('null instrument in snapshot', () => {
    it('shows the "Select an instrument" prompt when snapshot has no instrument', () => {
      renderBlock({ instrument: null })
      expect(screen.getByText(/Select an instrument to begin designing/)).toBeInTheDocument()
    })

    it('still renders target rows even without an instrument', () => {
      renderBlock({ instrument: null })
      expect(screen.getByText('CD3')).toBeInTheDocument()
    })
  })
})
