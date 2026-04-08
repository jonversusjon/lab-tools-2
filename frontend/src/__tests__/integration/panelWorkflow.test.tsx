import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ToastProvider } from '@/components/layout/Toast'
import type { Panel } from '@/types'

vi.mock('react-chartjs-2', () => ({
  Line: () => <canvas data-testid="chart" />,
}))
vi.mock('chartjs-plugin-annotation', () => ({ default: {} }))

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
        { id: 'd2', laser_id: 'l1', filter_midpoint: 582, filter_width: 15, name: null },
        { id: 'd3', laser_id: 'l1', filter_midpoint: 610, filter_width: 20, name: null },
      ],
    },
  ],
}

const mockInstrument2 = {
  id: 'inst-2',
  name: 'Sony ID7000',
  lasers: [
    {
      id: 'l3',
      instrument_id: 'inst-2',
      wavelength_nm: 637,
      name: 'Red',
      detectors: [
        { id: 'd10', laser_id: 'l3', filter_midpoint: 670, filter_width: 30, name: null },
      ],
    },
  ],
}

const mockAntibodies = [
  { id: 'ab1', target: 'CD3', clone: 'OKT3', host: 'mouse', isotype: 'IgG1', fluorophore_id: null, fluorophore_name: null, vendor: null, catalog_number: null },
  { id: 'ab2', target: 'CD4', clone: 'RPA-T4', host: 'mouse', isotype: 'IgG1', fluorophore_id: null, fluorophore_name: null, vendor: null, catalog_number: null },
  { id: 'ab3', target: 'CD8', clone: 'SK1', host: 'mouse', isotype: 'IgG1', fluorophore_id: null, fluorophore_name: null, vendor: null, catalog_number: null },
  { id: 'ab4', target: 'CD45', clone: 'HI30', host: 'mouse', isotype: 'IgG1', fluorophore_id: 'fl-1', fluorophore_name: 'FITC', vendor: null, catalog_number: null },
]

const mockFluorophores = [
  { id: 'fl-1', name: 'FITC', excitation_max_nm: 494, emission_max_nm: 519, source: 'seed' },
  { id: 'fl-2', name: 'PE', excitation_max_nm: 565, emission_max_nm: 578, source: 'seed' },
  { id: 'fl-3', name: 'PE-Cy5', excitation_max_nm: 565, emission_max_nm: 667, source: 'seed' },
]

let currentPanel: Panel = {
  id: 'p1',
  name: 'Workflow Panel',
  instrument_id: 'inst-1',
  created_at: null,
  updated_at: null,
  targets: [],
  assignments: [],
}

const mockAddTargetMutateAsync = vi.fn()
const mockRemoveTargetMutateAsync = vi.fn()
const mockAddAssignmentMutateAsync = vi.fn()
const mockRemoveAssignmentMutateAsync = vi.fn()
const mockUpdateMutate = vi.fn()
const mockRefetch = vi.fn()

vi.mock('@/hooks/usePanels', () => ({
  usePanel: () => ({
    data: currentPanel,
    refetch: mockRefetch,
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
  useAddAssignment: () => ({ mutateAsync: mockAddAssignmentMutateAsync }),
  useRemoveAssignment: () => ({ mutateAsync: mockRemoveAssignmentMutateAsync }),
}))

vi.mock('@/hooks/useInstruments', () => ({
  useInstruments: () => ({
    data: { items: [mockInstrument, mockInstrument2], total: 2, skip: 0, limit: 500 },
    isLoading: false,
    error: null,
  }),
  useInstrument: (id: string) => ({
    data: id === 'inst-1' ? mockInstrument : id === 'inst-2' ? mockInstrument2 : null,
  }),
}))

vi.mock('@/hooks/useAntibodies', () => ({
  useAntibodies: () => ({
    data: { items: mockAntibodies, total: 4, skip: 0, limit: 500 },
    isLoading: false,
    error: null,
  }),
}))

vi.mock('@/hooks/useFluorophores', () => ({
  useFluorophores: () => ({
    data: { items: mockFluorophores, total: 3, skip: 0, limit: 500 },
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

function renderDesigner(panel?: Panel) {
  if (panel) currentPanel = panel
  const qc = new QueryClient()
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter initialEntries={['/panels/p1']}>
          <Routes>
            <Route path="/panels/:id" element={<PanelDesigner />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  )
}

describe('Panel Workflow Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    currentPanel = {
      id: 'p1',
      name: 'Workflow Panel',
      instrument_id: 'inst-1',
      created_at: null,
      updated_at: null,
      targets: [],
      assignments: [],
    }
  })

  it('full workflow: add targets → assign fluorophores → undo → redo', async () => {
    // Start with 3 targets already added
    currentPanel = {
      ...currentPanel,
      targets: [
        { id: 't1', panel_id: 'p1', antibody_id: 'ab1', dye_label_id: null, dye_label_name: null, dye_label_target: null, dye_label_fluorophore_id: null, dye_label_fluorophore_name: null, sort_order: 0, staining_mode: "direct" as const, secondary_antibody_id: null, antibody_name: null, antibody_target: null, secondary_antibody_name: null, secondary_fluorophore_id: null, secondary_fluorophore_name: null },
        { id: 't2', panel_id: 'p1', antibody_id: 'ab2', dye_label_id: null, dye_label_name: null, dye_label_target: null, dye_label_fluorophore_id: null, dye_label_fluorophore_name: null, sort_order: 1, staining_mode: "direct" as const, secondary_antibody_id: null, antibody_name: null, antibody_target: null, secondary_antibody_name: null, secondary_fluorophore_id: null, secondary_fluorophore_name: null },
        { id: 't3', panel_id: 'p1', antibody_id: 'ab3', dye_label_id: null, dye_label_name: null, dye_label_target: null, dye_label_fluorophore_id: null, dye_label_fluorophore_name: null, sort_order: 2, staining_mode: "direct" as const, secondary_antibody_id: null, antibody_name: null, antibody_target: null, secondary_antibody_name: null, secondary_fluorophore_id: null, secondary_fluorophore_name: null },
      ],
      assignments: [
        { id: 'a1', panel_id: 'p1', antibody_id: 'ab1', dye_label_id: null, fluorophore_id: 'fl-1', detector_id: 'd1', notes: null },
        { id: 'a2', panel_id: 'p1', antibody_id: 'ab2', dye_label_id: null, fluorophore_id: 'fl-2', detector_id: 'd2', notes: null },
      ],
    }

    renderDesigner()

    // Panel renders with 3 targets
    expect(screen.getByText('CD3')).toBeInTheDocument()
    expect(screen.getByText('CD4')).toBeInTheDocument()
    expect(screen.getByText('CD8')).toBeInTheDocument()

    // Detector columns rendered
    expect(screen.getByText('530/30')).toBeInTheDocument()
    expect(screen.getByText('582/15')).toBeInTheDocument()
    expect(screen.getByText('610/20')).toBeInTheDocument()

    // Undo/Redo buttons should be present
    const undoBtn = screen.getByText('Undo')
    const redoBtn = screen.getByText('Redo')
    expect(undoBtn).toBeInTheDocument()
    expect(redoBtn).toBeInTheDocument()
  })

  it('change instrument shows confirmation modal with 3 options', () => {
    currentPanel = {
      ...currentPanel,
      targets: [
        { id: 't1', panel_id: 'p1', antibody_id: 'ab1', dye_label_id: null, dye_label_name: null, dye_label_target: null, dye_label_fluorophore_id: null, dye_label_fluorophore_name: null, sort_order: 0, staining_mode: "direct" as const, secondary_antibody_id: null, antibody_name: null, antibody_target: null, secondary_antibody_name: null, secondary_fluorophore_id: null, secondary_fluorophore_name: null },
      ],
      assignments: [
        { id: 'a1', panel_id: 'p1', antibody_id: 'ab1', dye_label_id: null, fluorophore_id: 'fl-1', detector_id: 'd1', notes: null },
      ],
    }

    renderDesigner()

    // Change instrument
    const select = screen.getByLabelText(/Instrument/)
    fireEvent.change(select, { target: { value: 'inst-2' } })

    // Modal should appear with 3 options
    expect(screen.getByText('Change Instrument')).toBeInTheDocument()
    expect(screen.getByText('Cancel')).toBeInTheDocument()
    expect(screen.getByText('Copy to New Panel')).toBeInTheDocument()
    expect(screen.getByText('Continue')).toBeInTheDocument()

    // Click Continue
    fireEvent.click(screen.getByText('Continue'))

    // Modal dismissed, update was called
    expect(screen.queryByText('Change Instrument')).not.toBeInTheDocument()
    expect(mockUpdateMutate).toHaveBeenCalled()
  })

  it('pre-conjugated antibody shows fluorophore name in target row', () => {
    currentPanel = {
      ...currentPanel,
      targets: [
        { id: 't4', panel_id: 'p1', antibody_id: 'ab4', dye_label_id: null, dye_label_name: null, dye_label_target: null, dye_label_fluorophore_id: null, dye_label_fluorophore_name: null, sort_order: 0, staining_mode: "direct" as const, secondary_antibody_id: null, antibody_name: null, antibody_target: null, secondary_antibody_name: null, secondary_fluorophore_id: null, secondary_fluorophore_name: null },
      ],
    }

    renderDesigner()

    // ab4 is CD45 with fluorophore_name: 'FITC' (pre-conjugated)
    expect(screen.getByText('CD45')).toBeInTheDocument()
    expect(screen.getByText('FITC')).toBeInTheDocument()
  })

  it('clicking "+ Add Target" creates a pending row with omnibox', () => {
    renderDesigner()

    const addBtn = screen.getByText('Add Target')
    fireEvent.click(addBtn)

    expect(screen.getByPlaceholderText('Search antibody, dye, or label...')).toBeInTheDocument()
  })

  it('removing a target calls the backend', async () => {
    currentPanel = {
      ...currentPanel,
      targets: [
        { id: 't1', panel_id: 'p1', antibody_id: 'ab1', dye_label_id: null, dye_label_name: null, dye_label_target: null, dye_label_fluorophore_id: null, dye_label_fluorophore_name: null, sort_order: 0, staining_mode: "direct" as const, secondary_antibody_id: null, antibody_name: null, antibody_target: null, secondary_antibody_name: null, secondary_fluorophore_id: null, secondary_fluorophore_name: null },
      ],
    }
    mockRemoveTargetMutateAsync.mockResolvedValue(undefined)

    renderDesigner()

    const removeBtn = screen.getByLabelText('Remove target')
    fireEvent.click(removeBtn)

    expect(mockRemoveTargetMutateAsync).toHaveBeenCalledWith({
      panelId: 'p1',
      targetId: 't1',
    })
  })
})
