import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import PanelDesignerView from '@/components/panels/PanelDesignerView'
import type { PanelDesignerViewHandlers, PanelDesignerViewConfig } from '@/components/panels/PanelDesignerView'
import type { PanelDesignerState } from '@/hooks/usePanelDesigner'
import type { Panel, Instrument, Antibody, Fluorophore, FluorophoreWithSpectra } from '@/types'

vi.mock('react-chartjs-2', () => ({
  Line: () => <canvas data-testid="chart" />,
}))
vi.mock('chartjs-plugin-annotation', () => ({ default: {} }))

// ── Fixture IDs ──────────────────────────────────────────────────────────────
const INST_ID  = 'inst-1'
const INST2_ID = 'inst-2'
const AB1_ID   = 'ab1'   // CD3 unconjugated
const AB2_ID   = 'ab2'   // CD4 unconjugated
const AB3_ID   = 'ab3'   // CD8 pre-conjugated FITC
const FL1_ID   = 'fl-1'  // FITC
const DET_D1   = 'd1'    // 530/30 — 488 nm Blue
const DET_D2   = 'd2'    // 695/40 — 488 nm Blue
const DET_D3   = 'd3'    // 670/14 — 637 nm Red

// ── Mock instruments ─────────────────────────────────────────────────────────
const mockInstrument: Instrument = {
  id: INST_ID, name: 'BD FACSAria III', is_favorite: false, location: null,
  lasers: [
    {
      id: 'l2', instrument_id: INST_ID, wavelength_nm: 637, name: 'Red',
      detectors: [
        { id: DET_D3, laser_id: 'l2', filter_midpoint: 670, filter_width: 14, name: null },
      ],
    },
    {
      id: 'l1', instrument_id: INST_ID, wavelength_nm: 488, name: 'Blue',
      detectors: [
        { id: DET_D1, laser_id: 'l1', filter_midpoint: 530, filter_width: 30, name: null },
        { id: DET_D2, laser_id: 'l1', filter_midpoint: 695, filter_width: 40, name: null },
      ],
    },
  ],
}

const mockInstrument2: Instrument = {
  id: INST2_ID, name: 'Sony ID7000', is_favorite: false, location: null, lasers: [],
}

// ── Mock panel ───────────────────────────────────────────────────────────────
const mockPanel: Panel = {
  id: 'p1', name: 'Test Panel', instrument_id: INST_ID,
  created_at: null, updated_at: null, targets: [], assignments: [],
}

// ── Mock antibodies ──────────────────────────────────────────────────────────
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

const mockAntibodies: Antibody[] = [
  makeAb(AB1_ID, 'CD3', { host: 'Mouse', isotype: 'IgG1' }),
  makeAb(AB2_ID, 'CD4', { host: 'Mouse', isotype: 'IgG1' }),
  makeAb(AB3_ID, 'CD8', { host: 'Mouse', fluorophore_id: FL1_ID, fluorophore_name: 'FITC' }),
]

// ── Mock fluorophores ────────────────────────────────────────────────────────
const mockFluorophores: Fluorophore[] = [
  {
    id: FL1_ID, name: 'FITC', fluor_type: null, source: 'seed',
    ex_max_nm: 494, em_max_nm: 519, ext_coeff: null, qy: null, lifetime_ns: null,
    oligomerization: null, switch_type: null, has_spectra: false, is_favorite: false,
  },
]
const mockFluorophoresWithSpectra: FluorophoreWithSpectra[] = mockFluorophores.map((f) => ({ ...f, spectra: null }))

// ── Row / assignment factories ────────────────────────────────────────────────
function makeTarget(id: string, antibodyId: string | null, sortOrder = 0) {
  return {
    id, panel_id: 'p1', antibody_id: antibodyId,
    dye_label_id: null, dye_label_name: null, dye_label_target: null,
    dye_label_fluorophore_id: null, dye_label_fluorophore_name: null,
    staining_mode: 'direct' as const, secondary_antibody_id: null, sort_order: sortOrder,
    antibody_name: null, antibody_target: null,
    secondary_antibody_name: null, secondary_fluorophore_id: null, secondary_fluorophore_name: null,
  }
}

function makeAssignment(id: string, antibodyId: string, fluorophoreId: string, detectorId: string) {
  return {
    id, panel_id: 'p1', antibody_id: antibodyId, dye_label_id: null,
    fluorophore_id: fluorophoreId, detector_id: detectorId, notes: null,
  }
}

// ── Props factories ───────────────────────────────────────────────────────────
function makeState(overrides: Partial<PanelDesignerState> = {}): PanelDesignerState {
  return {
    panel: mockPanel, instrument: mockInstrument,
    targets: [], assignments: [], isDirty: false, past: [], future: [],
    ...overrides,
  }
}

function makeHandlers(overrides: Partial<PanelDesignerViewHandlers> = {}): PanelDesignerViewHandlers {
  return {
    onAddTarget: vi.fn().mockResolvedValue(null),
    onRemoveTarget: vi.fn().mockResolvedValue(undefined),
    onReplaceTargetAntibody: vi.fn().mockResolvedValue(undefined),
    onReorderTargets: vi.fn(),
    onSetSecondary: vi.fn().mockResolvedValue(undefined),
    onClearSecondary: vi.fn().mockResolvedValue(undefined),
    onDirectAssign: vi.fn().mockResolvedValue(undefined),
    onUnassign: vi.fn().mockResolvedValue(undefined),
    onPickerSelectFluorophore: vi.fn().mockResolvedValue(undefined),
    onPickerSelectSecondary: vi.fn().mockResolvedValue(undefined),
    onPickerClear: vi.fn().mockResolvedValue(undefined),
    onSaveName: vi.fn(),
    onInstrumentChange: vi.fn(),
    onInstrumentChangeCopy: vi.fn(),
    copyInProgress: false,
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    canUndo: false,
    canRedo: false,
    autoAssign: true,
    minThreshold: 0.2,
    onAutoAssignToggle: vi.fn(),
    onThresholdChange: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  }
}

function makeConfig(overrides: Partial<PanelDesignerViewConfig> = {}): PanelDesignerViewConfig {
  return {
    showBackButton: false,
    showInstrumentSelector: true,
    instruments: [mockInstrument, mockInstrument2],
    showAutoAssign: true,
    showDelete: false,
    ...overrides,
  }
}

function renderView(
  stateOverrides: Partial<PanelDesignerState> = {},
  handlerOverrides: Partial<PanelDesignerViewHandlers> = {},
  configOverrides: Partial<PanelDesignerViewConfig> = {}
) {
  const dispatch = vi.fn()
  const state = makeState(stateOverrides)
  const handlers = makeHandlers(handlerOverrides)
  const config = makeConfig(configOverrides)
  render(
    <PanelDesignerView
      state={state} dispatch={dispatch} handlers={handlers} config={config}
      antibodies={mockAntibodies} dyeLabels={[]} allFluorophores={mockFluorophores}
      secondaries={[]} conjugateChemistries={[]} spectraCache={null}
      fluorophoresWithSpectra={mockFluorophoresWithSpectra}
      allFluorophoresForScoring={mockFluorophoresWithSpectra}
    />
  )
  return { dispatch, handlers, state, config }
}

// ═════════════════════════════════════════════════════════════════════════════
describe('PanelDesignerView', () => {
  beforeEach(() => vi.clearAllMocks())

  // ── Loading state ──────────────────────────────────────────────────────────
  describe('loading state', () => {
    it('shows loading message when panel is null', () => {
      renderView({ panel: null })
      expect(screen.getByText('Loading panel...')).toBeInTheDocument()
    })
  })

  // ── Panel name ─────────────────────────────────────────────────────────────
  describe('panel name', () => {
    it('displays the panel name as a heading on load', () => {
      renderView()
      expect(screen.getByRole('heading', { name: 'Test Panel' })).toBeInTheDocument()
    })

    it('clicking the name heading enters edit mode (shows input)', () => {
      renderView()
      fireEvent.click(screen.getByRole('heading', { name: 'Test Panel' }))
      const input = screen.getByRole('textbox') as HTMLInputElement
      expect(input).toBeInTheDocument()
      expect(input.value).toBe('Test Panel')
    })

    it('pressing Enter in the name input saves the new name', () => {
      const onSaveName = vi.fn()
      renderView({}, { onSaveName })
      fireEvent.click(screen.getByRole('heading', { name: 'Test Panel' }))
      const input = screen.getByRole('textbox')
      fireEvent.change(input, { target: { value: 'Updated Panel' } })
      fireEvent.keyDown(input, { key: 'Enter' })
      expect(onSaveName).toHaveBeenCalledWith('Updated Panel')
    })

    it('pressing Escape cancels the edit and restores the original name', () => {
      const onSaveName = vi.fn()
      renderView({}, { onSaveName })
      fireEvent.click(screen.getByRole('heading', { name: 'Test Panel' }))
      const input = screen.getByRole('textbox')
      fireEvent.change(input, { target: { value: 'Changed' } })
      fireEvent.keyDown(input, { key: 'Escape' })
      expect(onSaveName).not.toHaveBeenCalled()
      expect(screen.getByRole('heading', { name: 'Test Panel' })).toBeInTheDocument()
    })

    it('blurring the name input saves when the value changed', () => {
      const onSaveName = vi.fn()
      renderView({}, { onSaveName })
      fireEvent.click(screen.getByRole('heading', { name: 'Test Panel' }))
      const input = screen.getByRole('textbox')
      fireEvent.change(input, { target: { value: 'Blurred Name' } })
      fireEvent.blur(input)
      expect(onSaveName).toHaveBeenCalledWith('Blurred Name')
    })

    it('blurring without changing the value does NOT call onSaveName', () => {
      const onSaveName = vi.fn()
      renderView({}, { onSaveName })
      fireEvent.click(screen.getByRole('heading', { name: 'Test Panel' }))
      fireEvent.blur(screen.getByRole('textbox'))
      expect(onSaveName).not.toHaveBeenCalled()
    })

    it('trims leading/trailing whitespace before saving', () => {
      const onSaveName = vi.fn()
      renderView({}, { onSaveName })
      fireEvent.click(screen.getByRole('heading', { name: 'Test Panel' }))
      const input = screen.getByRole('textbox')
      fireEvent.change(input, { target: { value: '  Trimmed  ' } })
      fireEvent.keyDown(input, { key: 'Enter' })
      expect(onSaveName).toHaveBeenCalledWith('Trimmed')
    })
  })

  // ── Undo / Redo ────────────────────────────────────────────────────────────
  describe('Undo / Redo buttons', () => {
    it('Undo button is disabled on load when canUndo=false', () => {
      renderView({}, { canUndo: false })
      expect(screen.getByText('Undo')).toBeDisabled()
    })

    it('Undo button is enabled when canUndo=true', () => {
      renderView({}, { canUndo: true })
      expect(screen.getByText('Undo')).not.toBeDisabled()
    })

    it('clicking Undo calls onUndo', () => {
      const onUndo = vi.fn()
      renderView({}, { canUndo: true, onUndo })
      fireEvent.click(screen.getByText('Undo'))
      expect(onUndo).toHaveBeenCalledOnce()
    })

    it('Redo button is disabled on load when canRedo=false', () => {
      renderView({}, { canRedo: false })
      expect(screen.getByText('Redo')).toBeDisabled()
    })

    it('Redo button is enabled when canRedo=true', () => {
      renderView({}, { canRedo: true })
      expect(screen.getByText('Redo')).not.toBeDisabled()
    })

    it('clicking Redo calls onRedo', () => {
      const onRedo = vi.fn()
      renderView({}, { canRedo: true, onRedo })
      fireEvent.click(screen.getByText('Redo'))
      expect(onRedo).toHaveBeenCalledOnce()
    })

    it('Ctrl+Z keyboard shortcut triggers onUndo', () => {
      const onUndo = vi.fn()
      renderView({}, { canUndo: true, onUndo })
      fireEvent.keyDown(document, { key: 'z', ctrlKey: true })
      expect(onUndo).toHaveBeenCalledOnce()
    })

    it('Ctrl+Shift+Z keyboard shortcut triggers onRedo', () => {
      const onRedo = vi.fn()
      renderView({}, { canRedo: true, onRedo })
      fireEvent.keyDown(document, { key: 'z', ctrlKey: true, shiftKey: true })
      expect(onRedo).toHaveBeenCalledOnce()
    })

    it('Ctrl+Y keyboard shortcut also triggers onRedo', () => {
      const onRedo = vi.fn()
      renderView({}, { canRedo: true, onRedo })
      fireEvent.keyDown(document, { key: 'y', ctrlKey: true })
      expect(onRedo).toHaveBeenCalledOnce()
    })
  })

  // ── Instrument selector ────────────────────────────────────────────────────
  describe('instrument selector', () => {
    it('renders the instrument dropdown with a label on load', () => {
      renderView()
      expect(screen.getByLabelText(/Instrument/)).toBeInTheDocument()
    })

    it('current instrument is pre-selected in the dropdown', () => {
      renderView()
      const select = screen.getByLabelText(/Instrument/) as HTMLSelectElement
      expect(select.value).toBe(INST_ID)
    })

    it('all available instruments appear as options', () => {
      renderView()
      expect(screen.getByRole('option', { name: 'BD FACSAria III' })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: 'Sony ID7000' })).toBeInTheDocument()
    })

    it('changing the instrument with no assignments calls onInstrumentChange directly', () => {
      const onInstrumentChange = vi.fn()
      renderView({ assignments: [] }, { onInstrumentChange })
      fireEvent.change(screen.getByLabelText(/Instrument/), { target: { value: INST2_ID } })
      expect(onInstrumentChange).toHaveBeenCalledWith(INST2_ID)
    })

    it('changing the instrument when assignments exist shows the confirmation modal', () => {
      const assignment = makeAssignment('a1', AB1_ID, FL1_ID, DET_D1)
      renderView({ assignments: [assignment] })
      fireEvent.change(screen.getByLabelText(/Instrument/), { target: { value: INST2_ID } })
      expect(screen.getByText('Change Instrument')).toBeInTheDocument()
    })

    it('does NOT call onInstrumentChange when selecting the same instrument already set', () => {
      const onInstrumentChange = vi.fn()
      renderView({}, { onInstrumentChange })
      fireEvent.change(screen.getByLabelText(/Instrument/), { target: { value: INST_ID } })
      expect(onInstrumentChange).not.toHaveBeenCalled()
    })

    it('shows "Select an instrument" prompt when instrument is null', () => {
      renderView({ instrument: null, panel: { ...mockPanel, instrument_id: null } })
      expect(screen.getByText(/Select an instrument to begin designing/)).toBeInTheDocument()
    })

    it('instrument selector is hidden when showInstrumentSelector=false', () => {
      renderView({}, {}, { showInstrumentSelector: false })
      expect(screen.queryByLabelText(/Instrument/)).not.toBeInTheDocument()
    })
  })

  // ── Instrument change modal ────────────────────────────────────────────────
  describe('instrument change modal', () => {
    function openModal(
      onInstrumentChange = vi.fn(),
      onInstrumentChangeCopy = vi.fn()
    ) {
      const assignment = makeAssignment('a1', AB1_ID, FL1_ID, DET_D1)
      renderView(
        { assignments: [assignment] },
        { onInstrumentChange, onInstrumentChangeCopy }
      )
      fireEvent.change(screen.getByLabelText(/Instrument/), { target: { value: INST2_ID } })
      expect(screen.getByText('Change Instrument')).toBeInTheDocument()
      return { onInstrumentChange, onInstrumentChangeCopy }
    }

    it('Cancel closes the modal without calling any handler', () => {
      const { onInstrumentChange, onInstrumentChangeCopy } = openModal()
      fireEvent.click(screen.getByText('Cancel'))
      expect(screen.queryByText('Change Instrument')).not.toBeInTheDocument()
      expect(onInstrumentChange).not.toHaveBeenCalled()
      expect(onInstrumentChangeCopy).not.toHaveBeenCalled()
    })

    it('Continue calls onInstrumentChange with the new instrument ID and closes the modal', () => {
      const { onInstrumentChange } = openModal()
      fireEvent.click(screen.getByText('Continue'))
      expect(onInstrumentChange).toHaveBeenCalledWith(INST2_ID)
      expect(screen.queryByText('Change Instrument')).not.toBeInTheDocument()
    })

    it('Copy to New Panel calls onInstrumentChangeCopy with the new instrument ID', () => {
      const { onInstrumentChangeCopy } = openModal()
      fireEvent.click(screen.getByText('Copy to New Panel'))
      expect(onInstrumentChangeCopy).toHaveBeenCalledWith(INST2_ID)
      expect(screen.queryByText('Change Instrument')).not.toBeInTheDocument()
    })

    it('modal explains that assignments will be removed', () => {
      openModal()
      expect(screen.getByText(/remove all current fluorophore assignments/i)).toBeInTheDocument()
    })
  })

  // ── Auto-assign controls ───────────────────────────────────────────────────
  describe('auto-assign toggle and threshold slider', () => {
    it('toggle renders with aria-checked=true when autoAssign=true', () => {
      renderView({}, { autoAssign: true })
      expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true')
    })

    it('toggle renders with aria-checked=false when autoAssign=false', () => {
      renderView({}, { autoAssign: false })
      expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false')
    })

    it('clicking the toggle calls onAutoAssignToggle', () => {
      const onAutoAssignToggle = vi.fn()
      renderView({}, { onAutoAssignToggle })
      fireEvent.click(screen.getByRole('switch'))
      expect(onAutoAssignToggle).toHaveBeenCalledOnce()
    })

    it('threshold slider is disabled when autoAssign=false', () => {
      renderView({}, { autoAssign: false })
      expect(screen.getByRole('slider')).toBeDisabled()
    })

    it('threshold slider is enabled when autoAssign=true', () => {
      renderView({}, { autoAssign: true })
      expect(screen.getByRole('slider')).not.toBeDisabled()
    })

    it('threshold slider value reflects minThreshold as a percentage (0→5, 0.3→30)', () => {
      renderView({}, { minThreshold: 0.3 })
      expect((screen.getByRole('slider') as HTMLInputElement).value).toBe('30')
    })

    it('changing the slider calls onThresholdChange', () => {
      const onThresholdChange = vi.fn()
      renderView({}, { onThresholdChange })
      fireEvent.change(screen.getByRole('slider'), { target: { value: '50' } })
      expect(onThresholdChange).toHaveBeenCalled()
    })

    it('threshold percentage label reflects current minThreshold', () => {
      renderView({}, { minThreshold: 0.25 })
      expect(screen.getByText('25%')).toBeInTheDocument()
    })

    it('auto-assign controls are hidden when showAutoAssign=false', () => {
      renderView({}, {}, { showAutoAssign: false })
      expect(screen.queryByRole('switch')).not.toBeInTheDocument()
      expect(screen.queryByRole('slider')).not.toBeInTheDocument()
    })
  })

  // ── Target table — empty state ─────────────────────────────────────────────
  describe('target table — empty state', () => {
    it('shows the empty state message when no targets and no pending rows', () => {
      renderView({ targets: [] })
      expect(screen.getByText(/No targets added yet/)).toBeInTheDocument()
    })

    it('empty state goes away after clicking "+ Add Target"', () => {
      renderView({ targets: [] })
      fireEvent.click(screen.getByText('Add Target'))
      expect(screen.queryByText(/No targets added yet/)).not.toBeInTheDocument()
    })
  })

  // ── Target rows — on load ──────────────────────────────────────────────────
  describe('target rows — on load', () => {
    it('renders the antibody target name in the row', () => {
      renderView({ targets: [makeTarget('t1', AB1_ID)] })
      expect(screen.getByText('CD3')).toBeInTheDocument()
    })

    it('renders host and isotype together in the Host / Isotype column', () => {
      renderView({ targets: [makeTarget('t1', AB1_ID)] })
      expect(screen.getByText('Mouse IgG1')).toBeInTheDocument()
    })

    it('unconjugated antibody shows secondary omnibox in the Conjugate column', () => {
      // A known unconjugated antibody (no fluorophore_id) triggers the SecondaryOmnibox
      // rather than the "Unconj." fallback (which only shows for unknown antibody IDs)
      renderView({ targets: [makeTarget('t1', AB1_ID)] })
      expect(screen.getByText('Select secondary...')).toBeInTheDocument()
    })

    it('pre-conjugated antibody shows its fluorophore name with a lock icon', () => {
      renderView({ targets: [makeTarget('t1', AB3_ID)] })
      expect(screen.getByText('FITC')).toBeInTheDocument()
    })

    it('renders multiple target rows in order', () => {
      const targets = [makeTarget('t1', AB1_ID, 0), makeTarget('t2', AB2_ID, 1)]
      renderView({ targets })
      const cells = screen.getAllByRole('cell')
      const text = cells.map((c) => c.textContent ?? '')
      const cd3Idx = text.findIndex((t) => t.includes('CD3'))
      const cd4Idx = text.findIndex((t) => t.includes('CD4'))
      expect(cd3Idx).toBeLessThan(cd4Idx)
    })

    it('shows column headers: Target, Host / Isotype, Conjugate', () => {
      renderView()
      expect(screen.getByText('Target')).toBeInTheDocument()
      expect(screen.getByText('Host / Isotype')).toBeInTheDocument()
      expect(screen.getByText('Conjugate')).toBeInTheDocument()
    })
  })

  // ── Remove target ──────────────────────────────────────────────────────────
  describe('remove target', () => {
    it('each target row has a Remove target button', () => {
      renderView({ targets: [makeTarget('t1', AB1_ID)] })
      expect(screen.getByLabelText('Remove target')).toBeInTheDocument()
    })

    it('clicking Remove target calls onRemoveTarget with targetId and antibodyId', () => {
      const onRemoveTarget = vi.fn().mockResolvedValue(undefined)
      renderView({ targets: [makeTarget('t1', AB1_ID)] }, { onRemoveTarget })
      fireEvent.click(screen.getByLabelText('Remove target'))
      expect(onRemoveTarget).toHaveBeenCalledWith('t1', AB1_ID)
    })

    it('multiple targets each get their own Remove button', () => {
      const targets = [makeTarget('t1', AB1_ID, 0), makeTarget('t2', AB2_ID, 1)]
      renderView({ targets })
      expect(screen.getAllByLabelText('Remove target')).toHaveLength(2)
    })
  })

  // ── Add Target flow ────────────────────────────────────────────────────────
  describe('add target flow', () => {
    it('clicking "+ Add Target" shows a pending row with the search omnibox', () => {
      renderView()
      fireEvent.click(screen.getByText('Add Target'))
      expect(screen.getByPlaceholderText('Search antibody, dye, or label...')).toBeInTheDocument()
    })

    it('clicking × on a pending row removes the omnibox', () => {
      renderView()
      fireEvent.click(screen.getByText('Add Target'))
      expect(screen.getByPlaceholderText('Search antibody, dye, or label...')).toBeInTheDocument()
      fireEvent.click(screen.getByLabelText('Remove pending row'))
      expect(screen.queryByPlaceholderText('Search antibody, dye, or label...')).not.toBeInTheDocument()
    })

    it('multiple pending rows can be added independently', () => {
      renderView()
      fireEvent.click(screen.getByText('Add Target'))
      fireEvent.click(screen.getByText('Add Target'))
      expect(screen.getAllByPlaceholderText('Search antibody, dye, or label...')).toHaveLength(2)
    })

    it('removing one pending row leaves the remaining row intact', () => {
      renderView()
      fireEvent.click(screen.getByText('Add Target'))
      fireEvent.click(screen.getByText('Add Target'))
      fireEvent.click(screen.getAllByLabelText('Remove pending row')[0])
      expect(screen.getAllByPlaceholderText('Search antibody, dye, or label...')).toHaveLength(1)
    })
  })

  // ── Detector column headers ────────────────────────────────────────────────
  describe('detector column headers', () => {
    it('sorts laser group headers by wavelength ascending', () => {
      renderView()
      const headers = screen.getAllByRole('columnheader')
      const texts = headers.map(h => h.textContent || '')
      const blueIdx = texts.findIndex(t => t.includes('488nm'))
      const redIdx = texts.findIndex(t => t.includes('637nm'))
      expect(blueIdx).toBeGreaterThan(-1)
      expect(redIdx).toBeGreaterThan(-1)
      expect(blueIdx).toBeLessThan(redIdx)
    })

    it('laser group headers show wavelength and name on load', () => {
      renderView()
      expect(screen.getByText('488nm Blue')).toBeInTheDocument()
      expect(screen.getByText('637nm Red')).toBeInTheDocument()
    })

    it('detector sub-headers show filter midpoint/width on load', () => {
      renderView()
      expect(screen.getByText('530/30')).toBeInTheDocument()
      expect(screen.getByText('695/40')).toBeInTheDocument()
      expect(screen.getByText('670/14')).toBeInTheDocument()
    })

    it('detector headers are absent when no instrument is set', () => {
      renderView({ instrument: null, panel: { ...mockPanel, instrument_id: null } })
      expect(screen.queryByText('530/30')).not.toBeInTheDocument()
    })
  })

  // ── Detector cell states ───────────────────────────────────────────────────
  describe('detector cell states', () => {
    it('assigned cell shows the fluorophore name and data-state="assigned"', () => {
      const target = makeTarget('t1', AB1_ID)
      const assignment = makeAssignment('a1', AB1_ID, FL1_ID, DET_D1)
      renderView({ targets: [target], assignments: [assignment] })
      const cell = screen.getByTestId(`cell-${AB1_ID}-${DET_D1}`)
      expect(cell).toHaveAttribute('data-state', 'assigned')
      expect(cell).toHaveTextContent('FITC')
    })

    it('clicking an assigned cell calls onUnassign with the correct arguments', () => {
      const onUnassign = vi.fn().mockResolvedValue(undefined)
      const target = makeTarget('t1', AB1_ID)
      const assignment = makeAssignment('a1', AB1_ID, FL1_ID, DET_D1)
      renderView({ targets: [target], assignments: [assignment] }, { onUnassign })
      fireEvent.click(screen.getByTestId(`cell-${AB1_ID}-${DET_D1}`))
      expect(onUnassign).toHaveBeenCalledWith(AB1_ID, 'a1', FL1_ID)
    })

    it('awaiting cell shows data-state="awaiting" for unconjugated antibody with no assignment', () => {
      renderView({ targets: [makeTarget('t1', AB1_ID)] }) // CD3 is unconjugated
      expect(screen.getByTestId(`cell-${AB1_ID}-${DET_D1}`)).toHaveAttribute('data-state', 'awaiting')
    })

    it('occupied cell shows data-state="occupied" when detector is taken by another row', () => {
      const target1 = makeTarget('t1', AB1_ID, 0)
      const target2 = makeTarget('t2', AB2_ID, 1)
      const assignment = makeAssignment('a1', AB1_ID, FL1_ID, DET_D1)
      renderView({ targets: [target1, target2], assignments: [assignment] })
      // For CD4's row (AB2_ID), d1 is occupied by CD3
      expect(screen.getByTestId(`cell-${AB2_ID}-${DET_D1}`)).toHaveAttribute('data-state', 'occupied')
    })

    it('row-assigned cell shows data-state="row-assigned" for detectors in the same row already assigned elsewhere', () => {
      const target = makeTarget('t1', AB1_ID)
      const assignment = makeAssignment('a1', AB1_ID, FL1_ID, DET_D1) // CD3 → d1
      renderView({ targets: [target], assignments: [assignment] })
      // d2 and d3 should be "row-assigned" since AB1 is already at d1
      expect(screen.getByTestId(`cell-${AB1_ID}-${DET_D2}`)).toHaveAttribute('data-state', 'row-assigned')
      expect(screen.getByTestId(`cell-${AB1_ID}-${DET_D3}`)).toHaveAttribute('data-state', 'row-assigned')
    })
  })

  // ── Panel Spectra section ──────────────────────────────────────────────────
  describe('Panel Spectra section', () => {
    it('shows the Panel Spectra section header when instrument is set', () => {
      renderView()
      expect(screen.getByText(/Panel Spectra/)).toBeInTheDocument()
    })

    it('shows the ▼ icon (expanded) by default', () => {
      renderView()
      // Button contains the collapse icon
      const btn = screen.getByText(/Panel Spectra/).closest('button')!
      expect(btn.textContent).toContain('\u25BC') // ▼
    })

    it('clicking the toggle button collapses the section (shows ▶)', () => {
      renderView()
      const btn = screen.getByText(/Panel Spectra/).closest('button')!
      fireEvent.click(btn)
      expect(btn.textContent).toContain('\u25B6') // ▶
    })

    it('clicking the toggle button twice re-expands the section (shows ▼)', () => {
      renderView()
      const btn = screen.getByText(/Panel Spectra/).closest('button')!
      fireEvent.click(btn)
      fireEvent.click(btn)
      expect(btn.textContent).toContain('\u25BC') // ▼
    })

    it('Panel Spectra section is absent when no instrument is set', () => {
      renderView({ instrument: null, panel: { ...mockPanel, instrument_id: null } })
      expect(screen.queryByText(/Panel Spectra/)).not.toBeInTheDocument()
    })

    it('fluorophore count label appears in the section header', () => {
      renderView({ targets: [] })
      // 0 active targets → "(0 fluorophores)"
      expect(screen.getByText(/0 fluorophore/)).toBeInTheDocument()
    })
  })
})
