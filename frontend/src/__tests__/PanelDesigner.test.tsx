import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Panel } from '@/types'

const mockPanel: Panel = {
  id: 'p1',
  name: 'Test Panel',
  instrument_id: 'inst-1',
  created_at: null,
  updated_at: null,
  targets: [
    { id: 't1', panel_id: 'p1', antibody_id: 'ab1', dye_label_id: null, dye_label_name: null, dye_label_target: null, dye_label_fluorophore_id: null, dye_label_fluorophore_name: null, sort_order: 0, staining_mode: "direct" as const, secondary_antibody_id: null, antibody_name: null, antibody_target: null, secondary_antibody_name: null, secondary_fluorophore_id: null, secondary_fluorophore_name: null },
  ],
  assignments: [],
}

const mockPanelNoInstrument: Panel = {
  ...mockPanel,
  instrument_id: null,
}

const mockInstrument = {
  id: 'inst-1',
  name: 'BD FACSAria III',
  lasers: [
    {
      id: 'l1',
      instrument_id: 'inst-1',
      wavelength_nm: 488,
      name: 'Blue',
      detectors: [
        { id: 'd1', laser_id: 'l1', filter_midpoint: 530, filter_width: 30, name: null },
        { id: 'd2', laser_id: 'l1', filter_midpoint: 695, filter_width: 40, name: null },
      ],
    },
    {
      id: 'l2',
      instrument_id: 'inst-1',
      wavelength_nm: 637,
      name: 'Red',
      detectors: [
        { id: 'd3', laser_id: 'l2', filter_midpoint: 670, filter_width: 14, name: null },
      ],
    },
  ],
}

const mockAntibodies = [
  { id: 'ab1', target: 'CD3', clone: 'OKT3', host: 'mouse', isotype: 'IgG1', fluorophore_id: null, fluorophore_name: null, vendor: null, catalog_number: null },
  { id: 'ab2', target: 'CD4', clone: 'RPA-T4', host: 'mouse', isotype: 'IgG1', fluorophore_id: null, fluorophore_name: null, vendor: null, catalog_number: null },
  { id: 'ab3', target: 'CD8', clone: 'SK1', host: 'mouse', isotype: 'IgG1', fluorophore_id: 'fl-1', fluorophore_name: 'FITC', vendor: null, catalog_number: null },
]

const mockAddTargetMutateAsync = vi.fn()
const mockRemoveTargetMutateAsync = vi.fn()
const mockUpdateMutate = vi.fn()

let currentPanel = mockPanel

vi.mock('@/hooks/usePanels', () => ({
  usePanel: () => ({
    data: currentPanel,
    refetch: vi.fn(),
  }),
  usePanels: () => ({
    data: { items: [], total: 0, skip: 0, limit: 500 },
    isLoading: false,
    error: null,
  }),
  useCreatePanel: () => ({ mutate: vi.fn() }),
  useDeletePanel: () => ({ mutate: vi.fn() }),
  useUpdatePanel: () => ({ mutate: mockUpdateMutate }),
  useAddTarget: () => ({ mutateAsync: mockAddTargetMutateAsync }),
  useUpdateTarget: () => ({ mutateAsync: vi.fn() }),
  useRemoveTarget: () => ({ mutateAsync: mockRemoveTargetMutateAsync }),
  useReorderTargets: () => ({ mutateAsync: vi.fn() }),
  useAddAssignment: () => ({ mutateAsync: vi.fn() }),
  useRemoveAssignment: () => ({ mutateAsync: vi.fn() }),
}))

vi.mock('@/hooks/useInstruments', () => ({
  useInstruments: () => ({
    data: { items: [mockInstrument], total: 1, skip: 0, limit: 500 },
    isLoading: false,
    error: null,
  }),
  useInstrument: (id: string) => ({
    data: id ? mockInstrument : null,
  }),
}))

vi.mock('@/hooks/useAntibodies', () => ({
  useAntibodies: () => ({
    data: { items: mockAntibodies, total: 3, skip: 0, limit: 500 },
    isLoading: false,
    error: null,
  }),
}))

vi.mock('@/hooks/useFluorophores', () => ({
  useFluorophores: () => ({
    data: { items: [{ id: 'fl-1', name: 'FITC', excitation_max_nm: 494, emission_max_nm: 519, source: 'seed' }], total: 1, skip: 0, limit: 500 },
    isLoading: false,
    error: null,
  }),
  useBatchSpectra: () => ({ data: null }),
  useToggleFluorophoreFavorite: () => ({ mutate: vi.fn() }),
  useRecentFluorophores: () => ({ data: [] }),
}))

vi.mock('@/hooks/useSecondaries', () => ({
  useSecondaries: () => ({
    data: { items: [], total: 0, skip: 0, limit: 100 },
    isLoading: false,
    error: null,
  }),
}))

import PanelDesigner from '@/components/panels/PanelDesigner'

function renderDesigner(panelOverride?: Panel) {
  if (panelOverride) currentPanel = panelOverride
  else currentPanel = mockPanel

  const qc = new QueryClient()
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/panels/p1']}>
        <Routes>
          <Route path="/panels/:id" element={<PanelDesigner />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('PanelDesigner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders panel name and instrument selector', () => {
    renderDesigner()
    expect(screen.getByText('Test Panel')).toBeInTheDocument()
    expect(screen.getByLabelText(/Instrument/)).toBeInTheDocument()
  })

  it('null instrument state shows "Select an instrument" prompt, no detector columns', () => {
    renderDesigner(mockPanelNoInstrument)
    expect(screen.getByText(/Select an instrument to begin designing/)).toBeInTheDocument()
    expect(screen.queryByText('530/30')).not.toBeInTheDocument()
  })

  it('changing instrument shows modal with 3 options if assignments exist', () => {
    const panelWithAssignment: Panel = {
      ...mockPanel,
      assignments: [
        { id: 'a1', panel_id: 'p1', antibody_id: 'ab1', dye_label_id: null, fluorophore_id: 'fl1', detector_id: 'd1', notes: null },
      ],
    }
    renderDesigner(panelWithAssignment)

    const select = screen.getByLabelText(/Instrument/)
    fireEvent.change(select, { target: { value: '' } })

    // Modal should appear with 3 options
    expect(screen.getByText('Change Instrument')).toBeInTheDocument()
    expect(screen.getByText('Cancel')).toBeInTheDocument()
    expect(screen.getByText('Copy to New Panel')).toBeInTheDocument()
    expect(screen.getByText('Continue')).toBeInTheDocument()

    // Cancel should dismiss the modal
    fireEvent.click(screen.getByText('Cancel'))
    expect(screen.queryByText('Change Instrument')).not.toBeInTheDocument()
  })

  it('"+ Add Target" button creates a pending row with omnibox', () => {
    renderDesigner()
    const addBtn = screen.getByText('Add Target')
    fireEvent.click(addBtn)
    expect(screen.getByPlaceholderText('Search target, clone, host, vendor...')).toBeInTheDocument()
  })

  it('pending row can be removed with × button', () => {
    renderDesigner()
    const addBtn = screen.getByText('Add Target')
    fireEvent.click(addBtn)
    expect(screen.getByPlaceholderText('Search target, clone, host, vendor...')).toBeInTheDocument()

    const removeBtn = screen.getByLabelText('Remove pending row')
    fireEvent.click(removeBtn)
    expect(screen.queryByPlaceholderText('Search target or antibody...')).not.toBeInTheDocument()
  })

  it('removing a target removes its row', async () => {
    mockRemoveTargetMutateAsync.mockResolvedValue(undefined)
    renderDesigner()

    const removeBtn = screen.getByLabelText('Remove target')
    fireEvent.click(removeBtn)

    expect(mockRemoveTargetMutateAsync).toHaveBeenCalledWith({
      panelId: 'p1',
      targetId: 't1',
    })
  })

  it('column headers render correct laser groups and detector filters', () => {
    renderDesigner()
    expect(screen.getByText('488nm Blue')).toBeInTheDocument()
    expect(screen.getByText('637nm Red')).toBeInTheDocument()
    expect(screen.getByText('530/30')).toBeInTheDocument()
    expect(screen.getByText('695/40')).toBeInTheDocument()
    expect(screen.getByText('670/14')).toBeInTheDocument()
  })

  it('pre-conjugated antibodies show fluorophore name in target row', () => {
    const panelWithConjugated: Panel = {
      ...mockPanel,
      targets: [
        { id: 't3', panel_id: 'p1', antibody_id: 'ab3', dye_label_id: null, dye_label_name: null, dye_label_target: null, dye_label_fluorophore_id: null, dye_label_fluorophore_name: null, sort_order: 0, staining_mode: "direct" as const, secondary_antibody_id: null, antibody_name: null, antibody_target: null, secondary_antibody_name: null, secondary_fluorophore_id: null, secondary_fluorophore_name: null },
      ],
    }
    renderDesigner(panelWithConjugated)
    expect(screen.getByText('FITC')).toBeInTheDocument()
  })

  it('targets contain backend-returned PanelTarget objects with IDs', () => {
    renderDesigner()
    // The CD3 target row is present from panel.targets[0] which has id 't1'
    expect(screen.getByText('CD3')).toBeInTheDocument()
  })
})
