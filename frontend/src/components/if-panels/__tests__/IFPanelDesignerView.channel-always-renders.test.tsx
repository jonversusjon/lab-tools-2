import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import IFPanelDesignerView, {
  type IFPanelDesignerViewHandlers,
  type IFPanelDesignerViewConfig,
} from '../IFPanelDesignerView'
import type { IFPanelDesignerState } from '@/hooks/useIFPanelDesigner'
import type {
  DyeLabel,
  IFPanel,
  IFPanelTarget,
  Microscope,
  MicroscopeFilter,
  MicroscopeLaser,
} from '@/types'

function makeHandlers(
  overrides: Partial<IFPanelDesignerViewHandlers> = {},
): IFPanelDesignerViewHandlers {
  return {
    onAddTarget: vi.fn(async () => undefined),
    onRemoveTarget: vi.fn(async () => undefined),
    onReplaceTargetAntibody: vi.fn(async () => undefined),
    onReorderTargets: vi.fn(),
    onAssignFluorophore: vi.fn(async () => undefined),
    onClearFluorophore: vi.fn(async () => undefined),
    onSelectSecondary: vi.fn(async () => undefined),
    onSelectFluorophoreFromSecondary: vi.fn(async () => undefined),
    onClearSecondary: vi.fn(async () => undefined),
    onUpdateChannel: vi.fn(async () => undefined),
    onSaveDilution: vi.fn(),
    onSaveName: vi.fn(),
    onViewModeToggle: vi.fn(),
    onMicroscopeChange: vi.fn(),
    ...overrides,
  }
}

const baseConfig: IFPanelDesignerViewConfig = {
  showBackButton: false,
  showMicroscopeSelector: true,
  showDelete: false,
  showViewModeToggle: true,
}

function makeFilter(overrides: Partial<MicroscopeFilter> = {}): MicroscopeFilter {
  return {
    id: 'filt-447',
    name: '447/60',
    filter_midpoint: 447,
    filter_width: 60,
    laser_id: 'laser-377',
    ...overrides,
  }
}

function makeLaser(overrides: Partial<MicroscopeLaser> = {}): MicroscopeLaser {
  return {
    id: 'laser-377',
    microscope_id: 'm1',
    wavelength_nm: 377,
    name: 'UV',
    excitation_type: 'arc',
    ex_filter_width: 60,
    filters: [makeFilter()],
    ...overrides,
  }
}

function makeMicroscope(overrides: Partial<Microscope> = {}): Microscope {
  return {
    id: 'm1',
    name: 'ImageXpress',
    is_favorite: false,
    location: null,
    lasers: [makeLaser()],
    ...overrides,
  }
}

function makeDyeLabel(overrides: Partial<DyeLabel> = {}): DyeLabel {
  return {
    id: 'dl-dapi',
    name: 'DAPI',
    label_target: 'DNA',
    category: null,
    fluorophore_id: 'dapi-default',
    fluorophore_name: 'DAPI',
    vendor: null,
    catalog_number: null,
    lot_number: null,
    flow_dilution: null,
    icc_if_dilution: null,
    flow_dilution_factor: null,
    icc_if_dilution_factor: null,
    notes: null,
    is_favorite: false,
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

function makePanel(overrides: Partial<IFPanel> = {}): IFPanel {
  return {
    id: 'panel-1',
    name: 'Test Panel',
    panel_type: 'IF',
    microscope_id: 'm1',
    view_mode: 'spectral',
    created_at: null,
    updated_at: null,
    targets: [],
    assignments: [],
    ...overrides,
  }
}

function makeDyeTarget(overrides: Partial<IFPanelTarget> = {}): IFPanelTarget {
  return {
    id: 'target-dapi',
    panel_id: 'panel-1',
    antibody_id: null,
    dye_label_id: 'dl-dapi',
    dye_label_name: 'DAPI',
    dye_label_target: 'DNA',
    dye_label_fluorophore_id: 'dapi-default',
    dye_label_fluorophore_name: 'DAPI',
    staining_mode: 'direct',
    secondary_antibody_id: null,
    sort_order: 0,
    antibody_name: null,
    antibody_target: null,
    secondary_antibody_name: null,
    secondary_fluorophore_id: null,
    secondary_fluorophore_name: null,
    dilution_override: null,
    antibody_icc_if_dilution: null,
    ...overrides,
  }
}

function makeState(overrides: Partial<IFPanelDesignerState> = {}): IFPanelDesignerState {
  return {
    panel: makePanel(),
    microscope: makeMicroscope(),
    viewMode: 'spectral',
    targets: [],
    assignments: [],
    isDirty: false,
    past: [],
    future: [],
    ...overrides,
  }
}

describe('IFPanelDesignerView channel cell (#4 — any-order entry)', () => {
  it('renders interactive dropdown with all microscope filters when no assignment exists yet', () => {
    // Scenario: DAPI added to a panel with a microscope, but the auto-
    // assignment hasn't materialized (e.g. just after a microscope swap
    // that wiped assignments). The dropdown must still be available and
    // populated — no em-dash collapse.
    const target = makeDyeTarget()
    const state = makeState({ targets: [target], assignments: [] })

    render(
      <IFPanelDesignerView
        state={state}
        dispatch={vi.fn()}
        handlers={makeHandlers()}
        config={baseConfig}
        antibodies={[]}
        dyeLabels={[makeDyeLabel()]}
        fluorophores={[]}
        secondaries={[]}
        conjugateChemistries={[]}
        microscopes={[makeMicroscope()]}
      />,
    )

    // The select is rendered (not collapsed to em-dash) — exactly one
    // <select> in the row's channel cell, with the microscope's filter
    // as an option.
    const selects = screen.getAllByRole('combobox')
    const channelSelect = selects.find((el) =>
      within(el).queryByRole('option', { name: /447\/60/i }),
    ) as HTMLSelectElement | undefined
    expect(channelSelect).toBeTruthy()
    expect(channelSelect!).not.toBeDisabled()
  })

  it('selecting a filter fires onUpdateChannel with the derived fluorophore_id and no oldAssignment', async () => {
    const target = makeDyeTarget()
    const state = makeState({ targets: [target], assignments: [] })
    const onUpdateChannel = vi.fn(async () => undefined)

    render(
      <IFPanelDesignerView
        state={state}
        dispatch={vi.fn()}
        handlers={makeHandlers({ onUpdateChannel })}
        config={baseConfig}
        antibodies={[]}
        dyeLabels={[makeDyeLabel()]}
        fluorophores={[]}
        secondaries={[]}
        conjugateChemistries={[]}
        microscopes={[makeMicroscope()]}
      />,
    )

    const selects = screen.getAllByRole('combobox')
    const channelSelect = selects.find((el) =>
      within(el).queryByRole('option', { name: /447\/60/i }),
    ) as HTMLSelectElement
    fireEvent.change(channelSelect, { target: { value: 'filt-447' } })

    expect(onUpdateChannel).toHaveBeenCalledTimes(1)
    // (rowId, isDyeLabel, oldAssignment, newFilterId, fluorophoreId)
    expect(onUpdateChannel).toHaveBeenCalledWith(
      'dl-dapi',
      true,
      null,
      'filt-447',
      'dapi-default',
    )
  })

  it('disables the dropdown with a placeholder when no fluorophore is determinable', () => {
    // Unconjugated antibody target, no assignment yet, no pre-conjugated
    // fluorophore on the antibody. The widget renders (per any-order
    // principle) but is disabled and announces the missing dependency.
    const target: IFPanelTarget = {
      id: 'target-ab',
      panel_id: 'panel-1',
      antibody_id: 'ab-1',
      dye_label_id: null,
      dye_label_name: null,
      dye_label_target: null,
      dye_label_fluorophore_id: null,
      dye_label_fluorophore_name: null,
      staining_mode: 'direct',
      secondary_antibody_id: null,
      sort_order: 0,
      antibody_name: 'CD3',
      antibody_target: 'CD3',
      secondary_antibody_name: null,
      secondary_fluorophore_id: null,
      secondary_fluorophore_name: null,
      dilution_override: null,
      antibody_icc_if_dilution: null,
    }
    const state = makeState({ targets: [target], assignments: [] })

    render(
      <IFPanelDesignerView
        state={state}
        dispatch={vi.fn()}
        handlers={makeHandlers()}
        config={baseConfig}
        antibodies={[
          {
            id: 'ab-1',
            name: 'CD3',
            target: 'CD3',
            clone: null,
            host: null,
            isotype: null,
            fluorophore_id: null,
            conjugate: null,
            vendor: null,
            catalog_number: null,
            confirmed_in_stock: false,
            date_received: null,
            flow_dilution: null,
            icc_if_dilution: null,
            wb_dilution: null,
            flow_dilution_factor: null,
            icc_if_dilution_factor: null,
            wb_dilution_factor: null,
            reacts_with: null,
            storage_temp: null,
            validation_notes: null,
            notes: null,
            website: null,
            physical_location: null,
            fluorophore_name: null,
            is_favorite: false,
            tags: [],
            created_at: null,
            updated_at: null,
          },
        ]}
        dyeLabels={[]}
        fluorophores={[]}
        secondaries={[]}
        conjugateChemistries={[]}
        microscopes={[makeMicroscope()]}
      />,
    )

    const selects = screen.getAllByRole('combobox')
    const channelSelect = selects.find((el) =>
      within(el).queryByRole('option', { name: /pick fluorophore first/i }),
    ) as HTMLSelectElement | undefined
    expect(channelSelect).toBeTruthy()
    expect(channelSelect!).toBeDisabled()
  })
})
