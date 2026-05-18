import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import IFPanelDesignerView, {
  type IFPanelDesignerViewHandlers,
  type IFPanelDesignerViewConfig,
} from '../IFPanelDesignerView'
import { ModalProvider } from '@/components/layout/ModalContext'
import type { IFPanelDesignerState } from '@/hooks/useIFPanelDesigner'
import type {
  Fluorophore,
  IFPanel,
  IFPanelAssignment,
  IFPanelTarget,
  Microscope,
} from '@/types'

function makeHandlers(): IFPanelDesignerViewHandlers {
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
  }
}

const config: IFPanelDesignerViewConfig = {
  showBackButton: false,
  showMicroscopeSelector: true,
  showDelete: false,
  showViewModeToggle: true,
}

const microscope: Microscope = {
  id: 'm1',
  name: 'Test Scope',
  is_favorite: false,
  location: null,
  lasers: [
    {
      id: 'laser-1',
      microscope_id: 'm1',
      wavelength_nm: 488,
      name: 'Blue',
      excitation_type: 'laser',
      ex_filter_width: null,
      filters: [
        {
          id: 'filt-1',
          name: '530/30',
          filter_midpoint: 530,
          filter_width: 30,
          laser_id: 'laser-1',
        },
      ],
    },
  ],
}

const fluorophoreNoSpectra: Fluorophore = {
  id: 'fl-no-spectra',
  name: 'NoSpectraDye',
  fluor_type: null,
  source: 'seed',
  ex_max_nm: 494,
  em_max_nm: 519,
  ext_coeff: null,
  qy: null,
  lifetime_ns: null,
  oligomerization: null,
  switch_type: null,
  has_spectra: false,
  is_favorite: false,
}

const dyeTarget: IFPanelTarget = {
  id: 'target-1',
  panel_id: 'panel-1',
  antibody_id: null,
  dye_label_id: 'dl-1',
  dye_label_name: 'DyeLabel',
  dye_label_target: 'DNA',
  dye_label_fluorophore_id: 'fl-no-spectra',
  dye_label_fluorophore_name: 'NoSpectraDye',
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
}

const assignment: IFPanelAssignment = {
  id: 'a1',
  panel_id: 'panel-1',
  antibody_id: null,
  dye_label_id: 'dl-1',
  fluorophore_id: 'fl-no-spectra',
  filter_id: 'filt-1',
  notes: null,
}

const panel: IFPanel = {
  id: 'panel-1',
  name: 'Test',
  panel_type: 'IF',
  microscope_id: 'm1',
  view_mode: 'spectral',
  created_at: null,
  updated_at: null,
  targets: [],
  assignments: [],
}

const state: IFPanelDesignerState = {
  panel,
  microscope,
  viewMode: 'spectral',
  targets: [dyeTarget],
  assignments: [assignment],
  isDirty: false,
  past: [],
  future: [],
}

describe('IFPanelDesignerView — no-spectra chip parity', () => {
  it('renders NoSpectraChip in the Ex/Det chip cells when the assigned fluorophore lacks spectra', () => {
    render(
      <ModalProvider>
        <IFPanelDesignerView
          state={state}
          dispatch={vi.fn()}
          handlers={makeHandlers()}
          config={config}
          antibodies={[]}
          dyeLabels={[
            {
              id: 'dl-1',
              name: 'DyeLabel',
              label_target: 'DNA',
              category: null,
              fluorophore_id: 'fl-no-spectra',
              fluorophore_name: 'NoSpectraDye',
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
            },
          ]}
          fluorophores={[fluorophoreNoSpectra]}
          secondaries={[]}
          conjugateChemistries={[]}
          microscopes={[microscope]}
          spectraCache={{}}
        />
      </ModalProvider>,
    )
    // Two chip cells (Ex and Det) each render a NoSpectraChip.
    const chips = screen.getAllByTestId('no-spectra-chip')
    expect(chips.length).toBe(2)
  })
})
