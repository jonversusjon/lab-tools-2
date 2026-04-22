/**
 * IFPanelBlock tests
 *
 * Tests the IF panel block instance component as it appears embedded in an
 * experiment page. The block hydrates from a JSON snapshot rather than live
 * backend data, so every test uses synthetic snapshot content.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import IFPanelBlock from '@/components/experiments/IFPanelBlock'
import type { IFPanelLibraryData } from '@/components/experiments/IFPanelBlock'
import type {
  ExperimentBlock,
  IFPanelBlockContent,
  Antibody,
  Fluorophore,
  SecondaryAntibody,
  Microscope,
} from '@/types'

vi.mock('react-chartjs-2', () => ({
  Line: () => <canvas data-testid="chart" />,
}))
vi.mock('chartjs-plugin-annotation', () => ({ default: {} }))

// Mock the microscopes API (called on microscope change)
vi.mock('@/api/microscopes', () => ({
  getMicroscope: vi.fn().mockResolvedValue({
    id: 'micro-2',
    name: 'Zeiss LSM 980',
    is_favorite: false,
    location: null,
    lasers: [],
  }),
}))

// ── Fixture IDs ───────────────────────────────────────────────────────────────
const EXP_ID    = 'exp-1'
const BLOCK_ID  = 'block-1'
const AB1_ID    = 'ab1'    // MAP2 unconjugated
const AB2_ID    = 'ab2'    // GFAP unconjugated
const MICRO_ID  = 'micro-1'
const MICRO2_ID = 'micro-2'

// ── Snapshot microscope ───────────────────────────────────────────────────────
const snapshotMicroscope: IFPanelBlockContent['microscope'] = {
  id: MICRO_ID,
  name: 'Leica SP8',
  lasers: [],
}

// ── Block content factory ─────────────────────────────────────────────────────
function makeContent(overrides: Partial<IFPanelBlockContent> = {}): IFPanelBlockContent {
  return {
    source_panel_id: 'src-panel-1',
    name: 'Neuronal IF Panel',
    panel_type: 'IF',
    microscope: snapshotMicroscope,
    view_mode: 'simple',
    targets: [
      {
        id: 't1',
        antibody_id: AB1_ID,
        antibody_name: 'anti-MAP2',
        antibody_target: 'MAP2',
        antibody_host: 'Chicken',
        dye_label_id: null,
        dye_label_name: null,
        dye_label_target: null,
        dye_label_fluorophore_id: null,
        dye_label_fluorophore_name: null,
        staining_mode: 'direct',
        secondary_antibody_id: null,
        secondary_antibody_name: null,
        secondary_fluorophore_id: null,
        secondary_fluorophore_name: null,
        sort_order: 0,
        dilution_override: null,
        icc_if_dilution_factor: 500,
      },
      {
        id: 't2',
        antibody_id: AB2_ID,
        antibody_name: 'anti-GFAP',
        antibody_target: 'GFAP',
        antibody_host: 'Mouse',
        dye_label_id: null,
        dye_label_name: null,
        dye_label_target: null,
        dye_label_fluorophore_id: null,
        dye_label_fluorophore_name: null,
        staining_mode: 'direct',
        secondary_antibody_id: null,
        secondary_antibody_name: null,
        secondary_fluorophore_id: null,
        secondary_fluorophore_name: null,
        sort_order: 1,
        dilution_override: null,
        icc_if_dilution_factor: 1000,
      },
    ],
    assignments: [],
    volume_params: {
      num_samples: 1,
      volume_per_sample_ul: 200,
      pipet_error_factor: 1.1,
      dilution_source: 'icc_if',
    },
    ...overrides,
  }
}

// ── ExperimentBlock factory ───────────────────────────────────────────────────
function makeBlock(content: IFPanelBlockContent = makeContent()): ExperimentBlock {
  return {
    id: BLOCK_ID,
    experiment_id: EXP_ID,
    block_type: 'if_panel',
    content: content as unknown as Record<string, unknown>,
    sort_order: 0,
    parent_id: null,
    created_at: null,
    updated_at: null,
  }
}

// ── Library data factory ──────────────────────────────────────────────────────
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

const mockMicroscope1: Microscope = {
  id: MICRO_ID, name: 'Leica SP8', is_favorite: false, location: null, lasers: [],
}

const mockMicroscope2: Microscope = {
  id: MICRO2_ID, name: 'Zeiss LSM 980', is_favorite: false, location: null, lasers: [],
}

function makeLibraryData(overrides: Partial<IFPanelLibraryData> = {}): IFPanelLibraryData {
  return {
    antibodies: [
      makeAb(AB1_ID, 'MAP2', { host: 'Chicken' }),
      makeAb(AB2_ID, 'GFAP', { host: 'Mouse' }),
    ],
    fluorophores: [] as Fluorophore[],
    secondaries: [] as SecondaryAntibody[],
    conjugateChemistries: [],
    microscopes: [mockMicroscope1, mockMicroscope2],
    ...overrides,
  }
}

// ── Render helper ─────────────────────────────────────────────────────────────
function renderBlock(
  blockOverrides: Partial<IFPanelBlockContent> = {},
  libraryOverrides: Partial<IFPanelLibraryData> = {}
) {
  const content = makeContent(blockOverrides)
  const block = makeBlock(content)
  const libraryData = makeLibraryData(libraryOverrides)
  return render(
    <IFPanelBlock experimentId={EXP_ID} block={block} libraryData={libraryData} />
  )
}

// ════════════════════════════════════════════════════════════════════════════
describe('IFPanelBlock', () => {
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
      expect(screen.getByRole('heading', { name: 'Neuronal IF Panel' })).toBeInTheDocument()
    })

    it('renders all target antibody names from snapshot content', () => {
      renderBlock()
      expect(screen.getByText('MAP2')).toBeInTheDocument()
      expect(screen.getByText('GFAP')).toBeInTheDocument()
    })

    it('wraps the block in a container with data-block-id', () => {
      const { container } = renderBlock()
      expect(container.querySelector(`[data-block-id="${BLOCK_ID}"]`)).toBeInTheDocument()
    })

    it('renders column headers: Target, Primary Ab, IF Dilution, Notes', () => {
      renderBlock()
      expect(screen.getByText('Target')).toBeInTheDocument()
      expect(screen.getByText('Primary Ab')).toBeInTheDocument()
      expect(screen.getByText('IF Dilution')).toBeInTheDocument()
      expect(screen.getByText('Notes')).toBeInTheDocument()
    })
  })

  // ── Panel name from snapshot ──────────────────────────────────────────────
  describe('panel name — different content values', () => {
    it('renders custom panel name from block content', () => {
      renderBlock({ name: 'Custom Neuronal Panel' })
      expect(screen.getByRole('heading', { name: 'Custom Neuronal Panel' })).toBeInTheDocument()
    })
  })

  // ── View mode controls ────────────────────────────────────────────────────
  describe('view mode controls', () => {
    it('renders Simple and Spectral buttons', () => {
      renderBlock()
      expect(screen.getByRole('button', { name: 'Simple' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Spectral' })).toBeInTheDocument()
    })

    it('Simple button has active styling when view_mode is simple', () => {
      renderBlock({ view_mode: 'simple' })
      const simpleBtn = screen.getByRole('button', { name: 'Simple' })
      expect(simpleBtn.className).toContain('font-medium')
    })

    it('Spectral button becomes active after clicking it', async () => {
      vi.useFakeTimers()
      renderBlock({ view_mode: 'simple' })
      fireEvent.click(screen.getByRole('button', { name: 'Spectral' }))
      // After click, spectral mode should be active
      expect(screen.getByRole('button', { name: 'Spectral' }).className).toContain('font-medium')
      // Advance timers to prevent any pending timer warnings
      await act(async () => { vi.advanceTimersByTime(2000) })
    })

    it('switching to spectral mode shows the Channel column header', async () => {
      vi.useFakeTimers()
      renderBlock({ view_mode: 'simple' })
      fireEvent.click(screen.getByRole('button', { name: 'Spectral' }))
      expect(screen.getByText('Channel')).toBeInTheDocument()
      await act(async () => { vi.advanceTimersByTime(2000) })
    })

    it('does not show Channel column in simple view mode', () => {
      renderBlock({ view_mode: 'simple' })
      expect(screen.queryByText('Channel')).not.toBeInTheDocument()
    })
  })

  // ── Microscope selector ───────────────────────────────────────────────────
  describe('microscope selector', () => {
    it('renders the microscope dropdown', () => {
      renderBlock()
      expect(screen.getByLabelText(/Microscope/)).toBeInTheDocument()
    })

    it('microscope options come from libraryData.microscopes', () => {
      renderBlock()
      expect(screen.getByRole('option', { name: 'Leica SP8' })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: 'Zeiss LSM 980' })).toBeInTheDocument()
    })

    it('current microscope from snapshot is pre-selected', () => {
      renderBlock()
      const select = screen.getByLabelText(/Microscope/) as HTMLSelectElement
      expect(select.value).toBe(MICRO_ID)
    })

    it('shows "None" option at the top', () => {
      renderBlock()
      expect(screen.getByRole('option', { name: 'None' })).toBeInTheDocument()
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
      expect(screen.queryByText('MAP2')).not.toBeInTheDocument()
      expect(screen.getByText('GFAP')).toBeInTheDocument()
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
      // After removing MAP2 (t1), only GFAP (t2) remains
      expect(body.content.targets).toHaveLength(1)
      expect(body.content.targets[0].antibody_target).toBe('GFAP')
    })

    it('saves panel name change via auto-save', async () => {
      vi.useFakeTimers()
      renderBlock()
      // Click heading to enter edit mode
      fireEvent.click(screen.getByRole('heading', { name: 'Neuronal IF Panel' }))
      // Use getByDisplayValue since multiple textboxes exist (dilution + notes inputs per row)
      const input = screen.getByDisplayValue('Neuronal IF Panel')
      fireEvent.change(input, { target: { value: 'Renamed IF Panel' } })
      fireEvent.keyDown(input, { key: 'Enter' })
      await act(async () => {
        vi.advanceTimersByTime(1600)
      })
      const [, init] = mockFetch.mock.calls[0]
      const body = JSON.parse(init.body)
      expect(body.content.name).toBe('Renamed IF Panel')
    })

    it('saves view_mode change when switching to spectral', async () => {
      vi.useFakeTimers()
      renderBlock({ view_mode: 'simple' })
      fireEvent.click(screen.getByRole('button', { name: 'Spectral' }))
      await act(async () => {
        vi.advanceTimersByTime(1600)
      })
      const [, init] = mockFetch.mock.calls[0]
      const body = JSON.parse(init.body)
      expect(body.content.view_mode).toBe('spectral')
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

  // ── Null microscope ───────────────────────────────────────────────────────
  describe('null microscope in snapshot', () => {
    it('selector shows empty value when snapshot has no microscope', () => {
      renderBlock({ microscope: null })
      const select = screen.getByLabelText(/Microscope/) as HTMLSelectElement
      expect(select.value).toBe('')
    })

    it('still renders target rows even without a microscope', () => {
      renderBlock({ microscope: null })
      expect(screen.getByText('MAP2')).toBeInTheDocument()
    })

    it('renders Simple and Spectral buttons even without a microscope', () => {
      renderBlock({ microscope: null })
      expect(screen.getByRole('button', { name: 'Simple' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Spectral' })).toBeInTheDocument()
    })
  })
})
