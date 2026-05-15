import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import IFPanelDesignerView, {
  type IFPanelDesignerViewHandlers,
  type IFPanelDesignerViewConfig,
} from '../IFPanelDesignerView'
import type { IFPanelDesignerState } from '@/hooks/useIFPanelDesigner'
import type { IFPanel, IFPanelTarget } from '@/types'

const noopHandlers: IFPanelDesignerViewHandlers = {
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
}

const baseConfig: IFPanelDesignerViewConfig = {
  showBackButton: false,
  showMicroscopeSelector: true,
  showDelete: false,
  showViewModeToggle: true,
}

function makePanel(overrides: Partial<IFPanel> = {}): IFPanel {
  return {
    id: 'panel-1',
    name: 'Test Panel',
    panel_type: 'IF',
    microscope_id: null,
    view_mode: 'spectral',
    created_at: null,
    updated_at: null,
    targets: [],
    assignments: [],
    ...overrides,
  }
}

function makeTarget(overrides: Partial<IFPanelTarget> = {}): IFPanelTarget {
  return {
    id: 'target-1',
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
    ...overrides,
  }
}

function makeState(overrides: Partial<IFPanelDesignerState> = {}): IFPanelDesignerState {
  return {
    panel: makePanel(),
    microscope: null,
    viewMode: 'spectral',
    targets: [],
    assignments: [],
    isDirty: false,
    past: [],
    future: [],
    ...overrides,
  }
}

describe('IFPanelDesignerView spectral mode without microscope (#6)', () => {
  it('renders explicit empty-state banner when spectral mode has no microscope and at least one target', () => {
    const state = makeState({ targets: [makeTarget()] })

    render(
      <IFPanelDesignerView
        state={state}
        dispatch={vi.fn()}
        handlers={noopHandlers}
        config={baseConfig}
        antibodies={[]}
        dyeLabels={[]}
        fluorophores={[]}
        secondaries={[]}
        conjugateChemistries={[]}
        microscopes={[{ id: 'm1', name: 'Test Scope', is_favorite: false, location: null, lasers: [] }]}
      />,
    )

    const banner = screen.getByTestId('if-no-microscope-banner')
    expect(banner).toBeInTheDocument()
    expect(banner.textContent).toContain('Channel selection requires a microscope')
    const button = screen.getByRole('button', { name: /choose microscope/i })
    expect(button).toBeInTheDocument()

    // Per-row "Select a microscope above" text should NOT be repeated
    expect(screen.queryByText(/select a microscope above/i)).not.toBeInTheDocument()
  })

  it('does NOT render the banner in simple mode', () => {
    const state = makeState({ viewMode: 'simple', targets: [makeTarget()] })

    render(
      <IFPanelDesignerView
        state={state}
        dispatch={vi.fn()}
        handlers={noopHandlers}
        config={baseConfig}
        antibodies={[]}
        dyeLabels={[]}
        fluorophores={[]}
        secondaries={[]}
        conjugateChemistries={[]}
      />,
    )

    expect(screen.queryByTestId('if-no-microscope-banner')).not.toBeInTheDocument()
  })

  it('does NOT render the banner when a microscope is selected', () => {
    const microscope = {
      id: 'm1',
      name: 'Test Scope',
      is_favorite: false,
      location: null,
      lasers: [],
    }
    const state = makeState({
      panel: makePanel({ microscope_id: 'm1' }),
      microscope,
      targets: [makeTarget()],
    })

    render(
      <IFPanelDesignerView
        state={state}
        dispatch={vi.fn()}
        handlers={noopHandlers}
        config={baseConfig}
        antibodies={[]}
        dyeLabels={[]}
        fluorophores={[]}
        secondaries={[]}
        conjugateChemistries={[]}
        microscopes={[microscope]}
      />,
    )

    expect(screen.queryByTestId('if-no-microscope-banner')).not.toBeInTheDocument()
  })

  it('"Choose microscope" button focuses the microscope picker', () => {
    const state = makeState({ targets: [makeTarget()] })

    render(
      <IFPanelDesignerView
        state={state}
        dispatch={vi.fn()}
        handlers={noopHandlers}
        config={baseConfig}
        antibodies={[]}
        dyeLabels={[]}
        fluorophores={[]}
        secondaries={[]}
        conjugateChemistries={[]}
        microscopes={[{ id: 'm1', name: 'Test Scope', is_favorite: false, location: null, lasers: [] }]}
      />,
    )

    const button = screen.getByRole('button', { name: /choose microscope/i })
    fireEvent.click(button)

    const select = document.getElementById('microscope-select') as HTMLSelectElement
    expect(select).toBeInTheDocument()
    expect(document.activeElement).toBe(select)
  })
})
