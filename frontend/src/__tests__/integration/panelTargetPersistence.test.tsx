import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
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
  name: 'Test Cytometer',
  lasers: [
    {
      id: 'l1',
      instrument_id: 'inst-1',
      wavelength_nm: 488,
      name: 'Blue',
      detectors: [
        { id: 'd1', laser_id: 'l1', filter_midpoint: 530, filter_width: 30, name: null },
      ],
    },
  ],
}

const mockAntibodies = [
  { id: 'ab1', target: 'CD3', clone: 'OKT3', host: 'mouse', isotype: 'IgG1', fluorophore_id: null, fluorophore_name: null, vendor: null, catalog_number: null },
  { id: 'ab2', target: 'CD4', clone: 'RPA-T4', host: 'mouse', isotype: 'IgG1', fluorophore_id: null, fluorophore_name: null, vendor: null, catalog_number: null },
  { id: 'ab3', target: 'CD8', clone: 'SK1', host: 'mouse', isotype: 'IgG1', fluorophore_id: null, fluorophore_name: null, vendor: null, catalog_number: null },
]

const mockFluorophores = [
  { id: 'fl-1', name: 'FITC', excitation_max_nm: 494, emission_max_nm: 519, source: 'seed' },
]

let currentPanel: Panel

const mockRefetch = vi.fn()
const mockAddTargetMutateAsync = vi.fn()
const mockRemoveTargetMutateAsync = vi.fn()
const mockUpdateMutate = vi.fn()

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
  useRemoveTarget: () => ({ mutateAsync: mockRemoveTargetMutateAsync }),
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
    data: id === 'inst-1' ? mockInstrument : null,
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
    data: { items: mockFluorophores, total: 1, skip: 0, limit: 500 },
    isLoading: false,
    error: null,
  }),
  useBatchSpectra: () => ({ data: null }),
}))

import PanelDesigner from '@/components/panels/PanelDesigner'

function renderDesigner() {
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

describe('Panel Target Persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('targets from backend are rendered on mount (simulating page reload)', () => {
    // Simulate: panel already has 3 targets saved to backend
    currentPanel = {
      id: 'p1',
      name: 'Persistence Panel',
      instrument_id: 'inst-1',
      created_at: null,
      updated_at: null,
      targets: [
        { id: 't1', panel_id: 'p1', antibody_id: 'ab1', sort_order: 0 },
        { id: 't2', panel_id: 'p1', antibody_id: 'ab2', sort_order: 1 },
        { id: 't3', panel_id: 'p1', antibody_id: 'ab3', sort_order: 2 },
      ],
      assignments: [],
    }

    renderDesigner()

    // All 3 targets should be present
    expect(screen.getByText('CD3')).toBeInTheDocument()
    expect(screen.getByText('CD4')).toBeInTheDocument()
    expect(screen.getByText('CD8')).toBeInTheDocument()
  })

  it('remount preserves targets (simulating navigation away and back)', () => {
    currentPanel = {
      id: 'p1',
      name: 'Persistence Panel',
      instrument_id: 'inst-1',
      created_at: null,
      updated_at: null,
      targets: [
        { id: 't1', panel_id: 'p1', antibody_id: 'ab1', sort_order: 0 },
        { id: 't2', panel_id: 'p1', antibody_id: 'ab2', sort_order: 1 },
      ],
      assignments: [],
    }

    const { unmount } = renderDesigner()
    expect(screen.getByText('CD3')).toBeInTheDocument()
    expect(screen.getByText('CD4')).toBeInTheDocument()

    // Unmount and remount (simulating navigation)
    unmount()

    renderDesigner()
    expect(screen.getByText('CD3')).toBeInTheDocument()
    expect(screen.getByText('CD4')).toBeInTheDocument()
  })

  it('target with assignment: both rendered from backend state', () => {
    currentPanel = {
      id: 'p1',
      name: 'Persistence Panel',
      instrument_id: 'inst-1',
      created_at: null,
      updated_at: null,
      targets: [
        { id: 't1', panel_id: 'p1', antibody_id: 'ab1', sort_order: 0 },
      ],
      assignments: [
        { id: 'a1', panel_id: 'p1', antibody_id: 'ab1', fluorophore_id: 'fl-1', detector_id: 'd1', notes: null },
      ],
    }

    renderDesigner()

    // Target present
    expect(screen.getByText('CD3')).toBeInTheDocument()
    // Assignment fluorophore shown in detector cell (may also appear in spillover matrix)
    const fitcElements = screen.getAllByText('FITC')
    expect(fitcElements.length).toBeGreaterThanOrEqual(1)
  })

  it('null instrument state: targets render but no detector columns', () => {
    currentPanel = {
      id: 'p1',
      name: 'No Instrument Panel',
      instrument_id: null,
      created_at: null,
      updated_at: null,
      targets: [
        { id: 't1', panel_id: 'p1', antibody_id: 'ab1', sort_order: 0 },
      ],
      assignments: [],
    }

    renderDesigner()

    // Prompt shown
    expect(screen.getByText(/Select an instrument to begin designing/)).toBeInTheDocument()
    // No detector columns
    expect(screen.queryByText('530/30')).not.toBeInTheDocument()
  })
})
