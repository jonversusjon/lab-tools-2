/**
 * Co-located instance-mode compatibility tests for PanelDesignerView.
 *
 * These 5 tests verify the architectural contract Phase 7b establishes:
 * PanelDesignerView can be driven by usePanelDesignerInstance (the pattern
 * Phase 7c's Tiptap NodeView will use) with no-op handlers, and optional
 * handlers can be safely omitted without crashing.
 *
 * Full rendering / interaction coverage lives in src/__tests__/PanelDesignerView.test.tsx.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { renderHook } from '@testing-library/react'
import PanelDesignerView from '@/components/panels/PanelDesignerView'
import type { PanelDesignerViewHandlers, PanelDesignerViewConfig } from '@/components/panels/PanelDesignerView'
import { usePanelDesignerInstance } from '@/hooks/usePanelDesigner'
import type { PanelDesignerState } from '@/hooks/usePanelDesigner'
import type { Panel, Instrument, Antibody, Fluorophore, FluorophoreWithSpectra } from '@/types'

vi.mock('react-chartjs-2', () => ({
  Line: () => <canvas data-testid="chart" />,
}))
vi.mock('chartjs-plugin-annotation', () => ({ default: {} }))

// ── Fixtures ──────────────────────────────────────────────────────────────────

const INST_ID = 'inst-1'
const AB1_ID = 'ab1'
const AB2_ID = 'ab2'

const mockInstrument: Instrument = {
  id: INST_ID, name: 'BD FACSAria III', is_favorite: false, location: null,
  lasers: [
    {
      id: 'l1', instrument_id: INST_ID, wavelength_nm: 488, name: 'Blue',
      detectors: [
        { id: 'd1', laser_id: 'l1', filter_midpoint: 530, filter_width: 30, name: null },
      ],
    },
  ],
}

const mockPanel: Panel = {
  id: 'p1', name: 'Instance Panel', instrument_id: INST_ID,
  created_at: null, updated_at: null, targets: [], assignments: [],
}

function makeAb(id: string, target: string): Antibody {
  return {
    id, target, name: null, clone: null, host: null, isotype: null,
    fluorophore_id: null, conjugate: null, fluorophore_name: null,
    vendor: null, catalog_number: null, confirmed_in_stock: false,
    date_received: null, flow_dilution: null, icc_if_dilution: null,
    wb_dilution: null, flow_dilution_factor: null, icc_if_dilution_factor: null,
    wb_dilution_factor: null, reacts_with: null, storage_temp: null,
    validation_notes: null, notes: null, website: null, physical_location: null,
    is_favorite: false, tags: [], created_at: null, updated_at: null,
  }
}

const mockAntibodies: Antibody[] = [
  makeAb(AB1_ID, 'CD3'),
  makeAb(AB2_ID, 'CD4'),
]

const mockFluorophores: Fluorophore[] = [
  {
    id: 'fl-1', name: 'FITC', fluor_type: null, source: 'seed',
    ex_max_nm: 494, em_max_nm: 519, ext_coeff: null, qy: null, lifetime_ns: null,
    oligomerization: null, switch_type: null, has_spectra: false, is_favorite: false,
  },
]

const mockFluorophoresWithSpectra: FluorophoreWithSpectra[] = mockFluorophores.map((f) => ({ ...f, spectra: null }))

function makeTarget(id: string, antibodyId: string, sortOrder = 0) {
  return {
    id, panel_id: 'p1', antibody_id: antibodyId,
    dye_label_id: null, dye_label_name: null, dye_label_target: null,
    dye_label_fluorophore_id: null, dye_label_fluorophore_name: null,
    staining_mode: 'direct' as const, secondary_antibody_id: null, sort_order: sortOrder,
    antibody_name: null, antibody_target: null,
    secondary_antibody_name: null, secondary_fluorophore_id: null, secondary_fluorophore_name: null,
  }
}

function makeConfig(overrides: Partial<PanelDesignerViewConfig> = {}): PanelDesignerViewConfig {
  return {
    showBackButton: false,
    showInstrumentSelector: true,
    instruments: [mockInstrument],
    showAutoAssign: true,
    showDelete: false,
    ...overrides,
  }
}

/**
 * Minimal no-op handlers — all required methods are vi.fn() stubs, all optional
 * methods are absent. This simulates what Phase 7c's FlowPanelView will pass:
 * handlers wired to local reducer updates only, not backend mutations.
 */
function makeNoOpHandlers(overrides: Partial<PanelDesignerViewHandlers> = {}): PanelDesignerViewHandlers {
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
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    canUndo: false,
    canRedo: false,
    autoAssign: false,
    minThreshold: 0.2,
    // Optional handlers intentionally omitted — instance mode doesn't need them.
    ...overrides,
  }
}

function makeInitialState(overrides: Partial<PanelDesignerState> = {}): PanelDesignerState {
  return {
    panel: mockPanel, instrument: mockInstrument,
    targets: [], assignments: [], isDirty: false, past: [], future: [],
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('PanelDesignerView — instance-mode compatibility', () => {
  beforeEach(() => vi.clearAllMocks())

  // ── Test 1 ────────────────────────────────────────────────────────────────
  it('smoke: renders without crashing when driven by usePanelDesignerInstance with no-op handlers', () => {
    // Phase 7c will call usePanelDesignerInstance(initialState, onChange) and pass
    // state + dispatch directly to PanelDesignerView. Verify that works end-to-end.
    const onChange = vi.fn()
    const { result } = renderHook(() =>
      usePanelDesignerInstance(makeInitialState(), onChange)
    )

    render(
      <PanelDesignerView
        state={result.current.state}
        dispatch={result.current.dispatch}
        handlers={makeNoOpHandlers()}
        config={makeConfig()}
        antibodies={mockAntibodies}
        dyeLabels={[]}
        allFluorophores={mockFluorophores}
        secondaries={[]}
        conjugateChemistries={[]}
        spectraCache={null}
        fluorophoresWithSpectra={mockFluorophoresWithSpectra}
        allFluorophoresForScoring={mockFluorophoresWithSpectra}
      />
    )

    expect(screen.getByRole('heading', { name: 'Instance Panel' })).toBeInTheDocument()
  })

  // ── Test 2 ────────────────────────────────────────────────────────────────
  it('rendered UI reflects the state passed in: 2 targets → 2 rows', () => {
    // Verifies the View is a pure function of its props: inject state with 2
    // targets and the grid renders exactly 2 target rows.
    const state = makeInitialState({
      targets: [makeTarget('t1', AB1_ID, 0), makeTarget('t2', AB2_ID, 1)],
    })

    render(
      <PanelDesignerView
        state={state}
        dispatch={vi.fn()}
        handlers={makeNoOpHandlers()}
        config={makeConfig()}
        antibodies={mockAntibodies}
        dyeLabels={[]}
        allFluorophores={mockFluorophores}
        secondaries={[]}
        conjugateChemistries={[]}
        spectraCache={null}
        fluorophoresWithSpectra={mockFluorophoresWithSpectra}
        allFluorophoresForScoring={mockFluorophoresWithSpectra}
      />
    )

    // Each target row has exactly one select checkbox
    expect(screen.getAllByLabelText('Select row')).toHaveLength(2)
  })

  // ── Test 3 ────────────────────────────────────────────────────────────────
  it('handler callback fires when user clicks remove target', async () => {
    // Verifies the actions contract: user gesture → View calls the correct handler
    // with the expected arguments. Phase 7c wires this to a reducer dispatch.
    const onRemoveTarget = vi.fn().mockResolvedValue(undefined)
    const state = makeInitialState({
      targets: [makeTarget('t1', AB1_ID)],
    })

    render(
      <PanelDesignerView
        state={state}
        dispatch={vi.fn()}
        handlers={makeNoOpHandlers({ onRemoveTarget })}
        config={makeConfig()}
        antibodies={mockAntibodies}
        dyeLabels={[]}
        allFluorophores={mockFluorophores}
        secondaries={[]}
        conjugateChemistries={[]}
        spectraCache={null}
        fluorophoresWithSpectra={mockFluorophoresWithSpectra}
        allFluorophoresForScoring={mockFluorophoresWithSpectra}
      />
    )

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Select row'))
      fireEvent.click(screen.getByLabelText('Delete selected'))
    })

    expect(onRemoveTarget).toHaveBeenCalledOnce()
    expect(onRemoveTarget).toHaveBeenCalledWith('t1', AB1_ID)
  })

  // ── Test 4 ────────────────────────────────────────────────────────────────
  it('omitting optional handler (onAutoAssignToggle) does not throw when the toggle is clicked', () => {
    // Optional handlers must be safe to omit — instance mode will not supply
    // template-specific callbacks like onAutoAssignToggle. The View must guard
    // optional method calls with ?. to avoid TypeError at runtime.
    const state = makeInitialState()
    // onAutoAssignToggle intentionally absent from handlers
    const handlers = makeNoOpHandlers({ onAutoAssignToggle: undefined })

    render(
      <PanelDesignerView
        state={state}
        dispatch={vi.fn()}
        handlers={handlers}
        config={makeConfig()}
        antibodies={[]}
        dyeLabels={[]}
        allFluorophores={[]}
        secondaries={[]}
        conjugateChemistries={[]}
        spectraCache={null}
        fluorophoresWithSpectra={[]}
        allFluorophoresForScoring={[]}
      />
    )

    // Should not throw even though onAutoAssignToggle is undefined
    expect(() => {
      fireEvent.click(screen.getByRole('switch'))
    }).not.toThrow()
  })

  // ── Test 5 ────────────────────────────────────────────────────────────────
  it('no template-only UI diverges when used in instance context (no mode prop needed)', () => {
    // PanelDesignerView has no `mode` prop. Template vs. instance differences are
    // handled entirely through the handlers prop: template mode supplies mutation-backed
    // handlers; instance mode supplies reducer-only handlers. The rendered HTML is
    // identical for the same state — no "Save status" indicator or other template-only
    // chrome exists in the View. This test verifies that the View renders the panel
    // name and no template-specific UI even when called with no-op handlers.
    const state = makeInitialState()

    render(
      <PanelDesignerView
        state={state}
        dispatch={vi.fn()}
        handlers={makeNoOpHandlers()}
        config={makeConfig({ showBackButton: false })}
        antibodies={[]}
        dyeLabels={[]}
        allFluorophores={[]}
        secondaries={[]}
        conjugateChemistries={[]}
        spectraCache={null}
        fluorophoresWithSpectra={[]}
        allFluorophoresForScoring={[]}
      />
    )

    // Panel name renders normally regardless of which handler set is injected
    expect(screen.getByRole('heading', { name: 'Instance Panel' })).toBeInTheDocument()
    // No "Save" or "Saved" status badge (which would indicate template-only chrome)
    expect(screen.queryByText(/saved/i)).not.toBeInTheDocument()
  })
})
