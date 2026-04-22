/**
 * IFPanelDesignerView tests
 *
 * Tests the IF panel designer view component as a pure presentational component.
 * All state and handlers are provided as props so each control can be tested
 * independently on load and after user interaction.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import IFPanelDesignerView from '@/components/if-panels/IFPanelDesignerView'
import type { IFPanelDesignerViewHandlers, IFPanelDesignerViewConfig } from '@/components/if-panels/IFPanelDesignerView'
import type { IFPanelDesignerState } from '@/hooks/useIFPanelDesigner'
import type {
  IFPanel,
  IFPanelTarget,
  Antibody,
  Fluorophore,
  Microscope,
} from '@/types'

vi.mock('react-chartjs-2', () => ({
  Line: () => <canvas data-testid="chart" />,
}))
vi.mock('chartjs-plugin-annotation', () => ({ default: {} }))

// ── Fixture IDs ───────────────────────────────────────────────────────────────
const PANEL_ID  = 'panel-1'
const AB1_ID    = 'ab-1'
const AB2_ID    = 'ab-2'
const MICRO_ID  = 'micro-1'
const MICRO2_ID = 'micro-2'
const T1_ID     = 't-1'
const T2_ID     = 't-2'

// ── Antibody factory ──────────────────────────────────────────────────────────
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

// ── Library fixtures ──────────────────────────────────────────────────────────
const mockAntibodies: Antibody[] = [
  makeAb(AB1_ID, 'MAP2', { host: 'Chicken' }),
  makeAb(AB2_ID, 'GFAP', { host: 'Mouse' }),
]

const mockFluorophores: Fluorophore[] = [
  {
    id: 'fl-1', name: 'Alexa Fluor 647', fluor_type: null, source: 'seed',
    ex_max_nm: 650, em_max_nm: 668, ext_coeff: null, qy: null, lifetime_ns: null,
    oligomerization: null, switch_type: null, has_spectra: false, is_favorite: false,
  },
]

const mockMicroscope1: Microscope = {
  id: MICRO_ID, name: 'Leica SP8', is_favorite: false, location: null, lasers: [],
}

const mockMicroscope2: Microscope = {
  id: MICRO2_ID, name: 'Zeiss LSM 980', is_favorite: false, location: null, lasers: [],
}

// ── IFPanelTarget factory ─────────────────────────────────────────────────────
function makeTarget(id: string, antibodyId: string, target: string, opts: Partial<IFPanelTarget> = {}): IFPanelTarget {
  return {
    id,
    panel_id: PANEL_ID,
    antibody_id: antibodyId,
    dye_label_id: null,
    dye_label_name: null,
    dye_label_target: null,
    dye_label_fluorophore_id: null,
    dye_label_fluorophore_name: null,
    staining_mode: 'direct',
    secondary_antibody_id: null,
    sort_order: 0,
    antibody_name: null,
    antibody_target: target,
    secondary_antibody_name: null,
    secondary_fluorophore_id: null,
    secondary_fluorophore_name: null,
    dilution_override: null,
    antibody_icc_if_dilution: null,
    ...opts,
  }
}

// ── IFPanel factory ───────────────────────────────────────────────────────────
function makePanel(overrides: Partial<IFPanel> = {}): IFPanel {
  return {
    id: PANEL_ID,
    name: 'Neuronal IF Panel',
    panel_type: 'IF',
    microscope_id: MICRO_ID,
    view_mode: 'simple',
    created_at: null,
    updated_at: null,
    targets: [],
    assignments: [],
    ...overrides,
  }
}

// ── State / handler / config factories ────────────────────────────────────────
function makeState(overrides: Partial<IFPanelDesignerState> = {}): IFPanelDesignerState {
  return {
    panel: makePanel(),
    microscope: mockMicroscope1,
    viewMode: 'simple',
    targets: [],
    assignments: [],
    isDirty: false,
    past: [],
    future: [],
    ...overrides,
  }
}

function makeHandlers(overrides: Partial<IFPanelDesignerViewHandlers> = {}): IFPanelDesignerViewHandlers {
  return {
    onAddTarget: vi.fn().mockResolvedValue(undefined),
    onRemoveTarget: vi.fn().mockResolvedValue(undefined),
    onReplaceTargetAntibody: vi.fn().mockResolvedValue(undefined),
    onReorderTargets: vi.fn(),
    onAssignFluorophore: vi.fn().mockResolvedValue(undefined),
    onClearFluorophore: vi.fn().mockResolvedValue(undefined),
    onSelectSecondary: vi.fn().mockResolvedValue(undefined),
    onSelectFluorophoreFromSecondary: vi.fn().mockResolvedValue(undefined),
    onClearSecondary: vi.fn().mockResolvedValue(undefined),
    onUpdateChannel: vi.fn().mockResolvedValue(undefined),
    onSaveDilution: vi.fn(),
    onSaveName: vi.fn(),
    onViewModeToggle: vi.fn(),
    onMicroscopeChange: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  }
}

function makeConfig(overrides: Partial<IFPanelDesignerViewConfig> = {}): IFPanelDesignerViewConfig {
  return {
    showBackButton: false,
    showMicroscopeSelector: true,
    showDelete: false,
    showViewModeToggle: true,
    ...overrides,
  }
}

// ── Render helper ─────────────────────────────────────────────────────────────
function renderView(
  stateOverrides: Partial<IFPanelDesignerState> = {},
  handlerOverrides: Partial<IFPanelDesignerViewHandlers> = {},
  configOverrides: Partial<IFPanelDesignerViewConfig> = {},
  antibodies: Antibody[] = mockAntibodies,
) {
  const state = makeState(stateOverrides)
  const handlers = makeHandlers(handlerOverrides)
  const config = makeConfig(configOverrides)
  const dispatch = vi.fn()

  const result = render(
    <IFPanelDesignerView
      state={state}
      dispatch={dispatch}
      handlers={handlers}
      config={config}
      antibodies={antibodies}
      dyeLabels={[]}
      fluorophores={mockFluorophores}
      secondaries={[]}
      conjugateChemistries={[]}
      microscopes={[mockMicroscope1, mockMicroscope2]}
    />
  )

  return { ...result, handlers, dispatch }
}

// ════════════════════════════════════════════════════════════════════════════
describe('IFPanelDesignerView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Loading state ─────────────────────────────────────────────────────────
  describe('loading state', () => {
    it('shows loading message when panel is null', () => {
      renderView({ panel: null })
      expect(screen.getByText('Loading panel...')).toBeInTheDocument()
    })

    it('does not render the table when panel is null', () => {
      renderView({ panel: null })
      expect(screen.queryByRole('table')).not.toBeInTheDocument()
    })
  })

  // ── Panel name ────────────────────────────────────────────────────────────
  describe('panel name', () => {
    it('renders the panel name as a heading', () => {
      renderView()
      expect(screen.getByRole('heading', { name: 'Neuronal IF Panel' })).toBeInTheDocument()
    })

    it('clicking the heading enters edit mode with a text input', () => {
      renderView()
      fireEvent.click(screen.getByRole('heading', { name: 'Neuronal IF Panel' }))
      expect(screen.getByRole('textbox')).toBeInTheDocument()
    })

    it('the text input is pre-filled with the panel name', () => {
      renderView()
      fireEvent.click(screen.getByRole('heading', { name: 'Neuronal IF Panel' }))
      const input = screen.getByRole('textbox') as HTMLInputElement
      expect(input.value).toBe('Neuronal IF Panel')
    })

    it('pressing Enter commits the new name and calls onSaveName', () => {
      const onSaveName = vi.fn()
      renderView({}, { onSaveName })
      fireEvent.click(screen.getByRole('heading', { name: 'Neuronal IF Panel' }))
      const input = screen.getByRole('textbox')
      fireEvent.change(input, { target: { value: 'Renamed Panel' } })
      fireEvent.keyDown(input, { key: 'Enter' })
      expect(onSaveName).toHaveBeenCalledWith('Renamed Panel')
    })

    it('pressing Escape reverts the name and exits edit mode', () => {
      renderView()
      fireEvent.click(screen.getByRole('heading', { name: 'Neuronal IF Panel' }))
      const input = screen.getByRole('textbox')
      fireEvent.change(input, { target: { value: 'Changed Name' } })
      fireEvent.keyDown(input, { key: 'Escape' })
      expect(screen.getByRole('heading', { name: 'Neuronal IF Panel' })).toBeInTheDocument()
    })

    it('blurring the input commits the name change', () => {
      const onSaveName = vi.fn()
      renderView({}, { onSaveName })
      fireEvent.click(screen.getByRole('heading', { name: 'Neuronal IF Panel' }))
      const input = screen.getByRole('textbox')
      fireEvent.change(input, { target: { value: 'Blurred Name' } })
      fireEvent.blur(input)
      expect(onSaveName).toHaveBeenCalledWith('Blurred Name')
    })

    it('onSaveName is not called when the name is unchanged', () => {
      const onSaveName = vi.fn()
      renderView({}, { onSaveName })
      fireEvent.click(screen.getByRole('heading', { name: 'Neuronal IF Panel' }))
      const input = screen.getByRole('textbox')
      fireEvent.keyDown(input, { key: 'Enter' })
      expect(onSaveName).not.toHaveBeenCalled()
    })
  })

  // ── No Undo / Redo ────────────────────────────────────────────────────────
  describe('no Undo / Redo buttons', () => {
    it('does not render an Undo button', () => {
      renderView()
      expect(screen.queryByText('Undo')).not.toBeInTheDocument()
    })

    it('does not render a Redo button', () => {
      renderView()
      expect(screen.queryByText('Redo')).not.toBeInTheDocument()
    })
  })

  // ── View mode toggle ──────────────────────────────────────────────────────
  describe('view mode toggle', () => {
    it('renders Simple and Spectral buttons when showViewModeToggle is true', () => {
      renderView({}, {}, { showViewModeToggle: true })
      expect(screen.getByRole('button', { name: 'Simple' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Spectral' })).toBeInTheDocument()
    })

    it('clicking Simple calls onViewModeToggle with "simple"', () => {
      const onViewModeToggle = vi.fn()
      renderView({}, { onViewModeToggle })
      fireEvent.click(screen.getByRole('button', { name: 'Simple' }))
      expect(onViewModeToggle).toHaveBeenCalledWith('simple')
    })

    it('clicking Spectral calls onViewModeToggle with "spectral"', () => {
      const onViewModeToggle = vi.fn()
      renderView({}, { onViewModeToggle })
      fireEvent.click(screen.getByRole('button', { name: 'Spectral' }))
      expect(onViewModeToggle).toHaveBeenCalledWith('spectral')
    })

    it('toggle buttons are hidden when showViewModeToggle is false', () => {
      renderView({}, {}, { showViewModeToggle: false })
      expect(screen.queryByRole('button', { name: 'Simple' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Spectral' })).not.toBeInTheDocument()
    })

    it('Simple button has active styling when viewMode is simple', () => {
      renderView({ viewMode: 'simple' })
      const simpleBtn = screen.getByRole('button', { name: 'Simple' })
      expect(simpleBtn.className).toContain('font-medium')
    })

    it('Spectral button has active styling when viewMode is spectral', () => {
      renderView({ viewMode: 'spectral' })
      const spectralBtn = screen.getByRole('button', { name: 'Spectral' })
      expect(spectralBtn.className).toContain('font-medium')
    })
  })

  // ── Microscope selector ───────────────────────────────────────────────────
  describe('microscope selector', () => {
    it('renders the microscope dropdown label', () => {
      renderView()
      expect(screen.getByLabelText(/Microscope/)).toBeInTheDocument()
    })

    it('options come from the microscopes prop', () => {
      renderView()
      expect(screen.getByRole('option', { name: 'Leica SP8' })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: 'Zeiss LSM 980' })).toBeInTheDocument()
    })

    it('current microscope from panel state is pre-selected', () => {
      renderView({ panel: makePanel({ microscope_id: MICRO_ID }) })
      const select = screen.getByLabelText(/Microscope/) as HTMLSelectElement
      expect(select.value).toBe(MICRO_ID)
    })

    it('changing the select calls onMicroscopeChange with the new ID', () => {
      const onMicroscopeChange = vi.fn()
      renderView({}, { onMicroscopeChange })
      const select = screen.getByLabelText(/Microscope/)
      fireEvent.change(select, { target: { value: MICRO2_ID } })
      expect(onMicroscopeChange).toHaveBeenCalledWith(MICRO2_ID)
    })

    it('shows "None" option at the top of the list', () => {
      renderView()
      expect(screen.getByRole('option', { name: 'None' })).toBeInTheDocument()
    })

    it('selector is hidden when showMicroscopeSelector is false', () => {
      renderView({}, {}, { showMicroscopeSelector: false })
      expect(screen.queryByLabelText(/Microscope/)).not.toBeInTheDocument()
    })
  })

  // ── Empty target state ────────────────────────────────────────────────────
  describe('empty target state', () => {
    it('shows the empty state message when there are no targets', () => {
      renderView({ targets: [] })
      expect(screen.getByText(/No targets added yet/)).toBeInTheDocument()
    })

    it('renders the Add Target button in empty state', () => {
      renderView({ targets: [] })
      expect(screen.getByText('Add Target')).toBeInTheDocument()
    })
  })

  // ── Target rows ───────────────────────────────────────────────────────────
  describe('target rows', () => {
    const targets = [
      makeTarget(T1_ID, AB1_ID, 'MAP2'),
      makeTarget(T2_ID, AB2_ID, 'GFAP'),
    ]

    it('renders antibody_target text for each target', () => {
      renderView({ targets })
      expect(screen.getByText('MAP2')).toBeInTheDocument()
      expect(screen.getByText('GFAP')).toBeInTheDocument()
    })

    it('does not show empty state message when targets are present', () => {
      renderView({ targets })
      expect(screen.queryByText(/No targets added yet/)).not.toBeInTheDocument()
    })

    it('renders a Remove target button for each target row', () => {
      renderView({ targets })
      expect(screen.getAllByLabelText('Remove target')).toHaveLength(2)
    })

    it('clicking Remove target calls onRemoveTarget with targetId and antibodyId', () => {
      const onRemoveTarget = vi.fn().mockResolvedValue(undefined)
      renderView({ targets }, { onRemoveTarget })
      fireEvent.click(screen.getAllByLabelText('Remove target')[0])
      expect(onRemoveTarget).toHaveBeenCalledWith(T1_ID, AB1_ID)
    })

    it('renders a dilution input for each antibody target row', () => {
      renderView({ targets: [makeTarget(T1_ID, AB1_ID, 'MAP2')] })
      // notes input has placeholder "Add note...", dilution does not
      const allTextboxes = screen.getAllByRole('textbox')
      // 1 dilution + 1 notes input per row (plus panel name input when not editing = 0)
      expect(allTextboxes.length).toBeGreaterThanOrEqual(2)
    })

    it('renders a notes input with placeholder "Add note..." for each row', () => {
      renderView({ targets })
      expect(screen.getAllByPlaceholderText('Add note...')).toHaveLength(2)
    })

    it('changing a dilution input updates its local value', () => {
      renderView({ targets: [makeTarget(T1_ID, AB1_ID, 'MAP2', { dilution_override: '100' })] })
      const inputs = screen.getAllByRole('textbox')
      // Find the dilution input (not the notes input)
      const dilutionInput = inputs.find((el) =>
        (el as HTMLInputElement).value === '100'
      ) as HTMLInputElement | undefined
      expect(dilutionInput).toBeDefined()
      if (dilutionInput) {
        fireEvent.change(dilutionInput, { target: { value: '200' } })
        expect(dilutionInput.value).toBe('200')
      }
    })

    it('blurring the dilution input calls onSaveDilution', () => {
      const onSaveDilution = vi.fn()
      renderView({ targets: [makeTarget(T1_ID, AB1_ID, 'MAP2')] }, { onSaveDilution })
      const allTextboxes = screen.getAllByRole('textbox')
      // Find dilution input (the notes placeholder identifies notes input, dilution has no placeholder)
      const notesInput = screen.getByPlaceholderText('Add note...')
      const dilutionInput = allTextboxes.find((el) => el !== notesInput) as HTMLInputElement
      fireEvent.change(dilutionInput, { target: { value: '500' } })
      fireEvent.blur(dilutionInput)
      expect(onSaveDilution).toHaveBeenCalledWith(T1_ID, '500')
    })
  })

  // ── Add target / pending row ──────────────────────────────────────────────
  describe('add target flow', () => {
    it('clicking Add Target shows a pending row with the search omnibox', () => {
      renderView()
      fireEvent.click(screen.getByText('Add Target'))
      expect(screen.getByPlaceholderText('Search antibody, dye, or label...')).toBeInTheDocument()
    })

    it('clicking Remove pending row removes the omnibox', () => {
      renderView()
      fireEvent.click(screen.getByText('Add Target'))
      fireEvent.click(screen.getByLabelText('Remove pending row'))
      expect(screen.queryByPlaceholderText('Search antibody, dye, or label...')).not.toBeInTheDocument()
    })

    it('multiple Add Target clicks create multiple pending rows', () => {
      renderView()
      fireEvent.click(screen.getByText('Add Target'))
      fireEvent.click(screen.getByText('Add Target'))
      expect(screen.getAllByPlaceholderText('Search antibody, dye, or label...')).toHaveLength(2)
    })

    it('each pending row has its own Remove pending row button', () => {
      renderView()
      fireEvent.click(screen.getByText('Add Target'))
      fireEvent.click(screen.getByText('Add Target'))
      expect(screen.getAllByLabelText('Remove pending row')).toHaveLength(2)
    })
  })

  // ── Host species conflict warning ─────────────────────────────────────────
  describe('host species conflict warning', () => {
    it('shows amber warning when two targets share a host species', () => {
      // Both antibodies are Mouse host, unconjugated → strategy='species' → conflict
      const conflictAbs: Antibody[] = [
        makeAb('ab-m1', 'CD3', { host: 'Mouse', fluorophore_id: null, conjugate: null }),
        makeAb('ab-m2', 'CD4', { host: 'Mouse', fluorophore_id: null, conjugate: null }),
      ]
      const conflictTargets: IFPanelTarget[] = [
        makeTarget('t-m1', 'ab-m1', 'CD3'),
        makeTarget('t-m2', 'ab-m2', 'CD4'),
      ]
      renderView({ targets: conflictTargets }, {}, {}, conflictAbs)
      expect(screen.getByText(/Multiple antibodies raised in/)).toBeInTheDocument()
    })

    it('includes the conflicting host name in the warning', () => {
      const conflictAbs: Antibody[] = [
        makeAb('ab-m1', 'CD3', { host: 'Mouse', fluorophore_id: null, conjugate: null }),
        makeAb('ab-m2', 'CD4', { host: 'Mouse', fluorophore_id: null, conjugate: null }),
      ]
      const conflictTargets: IFPanelTarget[] = [
        makeTarget('t-m1', 'ab-m1', 'CD3'),
        makeTarget('t-m2', 'ab-m2', 'CD4'),
      ]
      renderView({ targets: conflictTargets }, {}, {}, conflictAbs)
      // "mouse" appears in both the <p> and the <strong> inside it — use getAllByText
      expect(screen.getAllByText(/mouse/i).length).toBeGreaterThan(0)
    })

    it('does not show the warning when targets have different host species', () => {
      const targets = [
        makeTarget(T1_ID, AB1_ID, 'MAP2'),  // host: Chicken
        makeTarget(T2_ID, AB2_ID, 'GFAP'),  // host: Mouse
      ]
      renderView({ targets })
      expect(screen.queryByText(/Multiple antibodies raised in/)).not.toBeInTheDocument()
    })

    it('does not show the warning with only one target', () => {
      renderView({ targets: [makeTarget(T1_ID, AB1_ID, 'MAP2')] })
      expect(screen.queryByText(/Multiple antibodies raised in/)).not.toBeInTheDocument()
    })
  })

  // ── Delete button ─────────────────────────────────────────────────────────
  describe('delete button', () => {
    it('is not shown when showDelete is false', () => {
      renderView({}, {}, { showDelete: false })
      expect(screen.queryByText('Delete')).not.toBeInTheDocument()
    })

    it('is shown when showDelete is true and onDelete is provided', () => {
      renderView({}, { onDelete: vi.fn() }, { showDelete: true })
      expect(screen.getByText('Delete')).toBeInTheDocument()
    })

    it('clicking Delete shows a confirmation modal', () => {
      renderView({}, { onDelete: vi.fn() }, { showDelete: true })
      fireEvent.click(screen.getByText('Delete'))
      expect(screen.getByText('Delete Panel')).toBeInTheDocument()
    })

    it('confirming the modal calls onDelete', () => {
      const onDelete = vi.fn()
      renderView({}, { onDelete }, { showDelete: true })
      fireEvent.click(screen.getByText('Delete'))
      // The modal has a Delete button too — click it to confirm
      const confirmBtns = screen.getAllByText('Delete')
      // The last one is in the modal footer
      fireEvent.click(confirmBtns[confirmBtns.length - 1])
      expect(onDelete).toHaveBeenCalled()
    })

    it('cancelling the modal does not call onDelete', () => {
      const onDelete = vi.fn()
      renderView({}, { onDelete }, { showDelete: true })
      fireEvent.click(screen.getByText('Delete'))
      fireEvent.click(screen.getByText('Cancel'))
      expect(onDelete).not.toHaveBeenCalled()
    })
  })

  // ── Column headers ────────────────────────────────────────────────────────
  describe('table column headers', () => {
    it('shows Target, Primary Ab, Secondary/Fluorophore, IF Dilution, Notes columns', () => {
      renderView()
      expect(screen.getByText('Target')).toBeInTheDocument()
      expect(screen.getByText('Primary Ab')).toBeInTheDocument()
      expect(screen.getByText('Secondary / Fluorophore')).toBeInTheDocument()
      expect(screen.getByText('IF Dilution')).toBeInTheDocument()
      expect(screen.getByText('Notes')).toBeInTheDocument()
    })

    it('does not show Channel column in simple view mode', () => {
      renderView({ viewMode: 'simple' })
      expect(screen.queryByText('Channel')).not.toBeInTheDocument()
    })

    it('shows Channel column in spectral view mode', () => {
      renderView({ viewMode: 'spectral' })
      expect(screen.getByText('Channel')).toBeInTheDocument()
    })
  })
})
