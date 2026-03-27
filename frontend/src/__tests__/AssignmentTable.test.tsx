import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Panel } from '@/types'

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
        { id: 'd2', laser_id: 'l1', filter_midpoint: 695, filter_width: 40, name: null },
      ],
    },
  ],
}

const mockAntibodies = [
  { id: 'ab1', target: 'CD3', clone: 'OKT3', host: 'mouse', isotype: 'IgG1', fluorophore_id: null, fluorophore_name: null, vendor: null, catalog_number: null },
  { id: 'ab2', target: 'CD4', clone: null, host: null, isotype: null, fluorophore_id: null, fluorophore_name: null, vendor: null, catalog_number: null },
]

const mockFluorophores = [
  { id: 'fl-fitc', name: 'FITC', ex_max_nm: 494, em_max_nm: 519, source: 'FPbase', fluor_type: null, ext_coeff: null, qy: null, lifetime_ns: null, oligomerization: null, switch_type: null, has_spectra: false },
]

const mockAddTargetMutateAsync = vi.fn()
const mockRemoveTargetMutateAsync = vi.fn()
const mockAddAssignmentMutateAsync = vi.fn()
const mockRemoveAssignmentMutateAsync = vi.fn()
const mockUpdateMutate = vi.fn()

let currentPanel: Panel

vi.mock('@/hooks/usePanels', () => ({
  usePanel: () => ({
    data: currentPanel,
    refetch: vi.fn(),
  }),
  usePanels: () => ({ data: { items: [], total: 0, skip: 0, limit: 500 }, isLoading: false, error: null }),
  useCreatePanel: () => ({ mutate: vi.fn() }),
  useDeletePanel: () => ({ mutate: vi.fn() }),
  useUpdatePanel: () => ({ mutate: mockUpdateMutate }),
  useAddTarget: () => ({ mutateAsync: mockAddTargetMutateAsync }),
  useRemoveTarget: () => ({ mutateAsync: mockRemoveTargetMutateAsync }),
  useAddAssignment: () => ({ mutateAsync: mockAddAssignmentMutateAsync }),
  useRemoveAssignment: () => ({ mutateAsync: mockRemoveAssignmentMutateAsync }),
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
    data: { items: mockAntibodies, total: 2, skip: 0, limit: 500 },
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

function renderDesigner(panelOverride: Panel) {
  currentPanel = panelOverride
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

describe('AssignmentTable', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('clicking an unassigned cell opens the picker', () => {
    const panel: Panel = {
      id: 'p1',
      name: 'Test',
      instrument_id: 'inst-1',
      created_at: null,
      updated_at: null,
      targets: [{ id: 't1', panel_id: 'p1', antibody_id: 'ab1', sort_order: 0 }],
      assignments: [],
    }
    renderDesigner(panel)
    const cell = screen.getByTestId('cell-ab1-d1')
    fireEvent.click(cell)
    // Picker should open — look for "No compatible fluorophores" or a fluorophore name
    // Since we have no spectra data and FITC fallback: ex 494 within ±40 of 488 → yes; em 519 within 530±30 (500-560) → yes
    expect(screen.getByText('FITC')).toBeInTheDocument()
  })

  it('assigned cell shows fluorophore name with colored background', () => {
    const panel: Panel = {
      id: 'p1',
      name: 'Test',
      instrument_id: 'inst-1',
      created_at: null,
      updated_at: null,
      targets: [{ id: 't1', panel_id: 'p1', antibody_id: 'ab1', sort_order: 0 }],
      assignments: [
        { id: 'a1', panel_id: 'p1', antibody_id: 'ab1', fluorophore_id: 'fl-fitc', detector_id: 'd1', notes: null },
      ],
    }
    renderDesigner(panel)
    const cell = screen.getByTestId('cell-ab1-d1')
    expect(cell.textContent).toContain('FITC')
    expect(cell.dataset.state).toBe('assigned')
  })

  it('occupied detector column disables cells for other targets', () => {
    const panel: Panel = {
      id: 'p1',
      name: 'Test',
      instrument_id: 'inst-1',
      created_at: null,
      updated_at: null,
      targets: [
        { id: 't1', panel_id: 'p1', antibody_id: 'ab1', sort_order: 0 },
        { id: 't2', panel_id: 'p1', antibody_id: 'ab2', sort_order: 1 },
      ],
      assignments: [
        { id: 'a1', panel_id: 'p1', antibody_id: 'ab1', fluorophore_id: 'fl-fitc', detector_id: 'd1', notes: null },
      ],
    }
    renderDesigner(panel)
    // CD4's cell in d1 should be occupied (not clickable)
    const occupiedCell = screen.getByTestId('cell-ab2-d1')
    expect(occupiedCell.dataset.state).toBe('occupied')
  })

  it('assigned row has tint', () => {
    const panel: Panel = {
      id: 'p1',
      name: 'Test',
      instrument_id: 'inst-1',
      created_at: null,
      updated_at: null,
      targets: [{ id: 't1', panel_id: 'p1', antibody_id: 'ab1', sort_order: 0 }],
      assignments: [
        { id: 'a1', panel_id: 'p1', antibody_id: 'ab1', fluorophore_id: 'fl-fitc', detector_id: 'd1', notes: null },
      ],
    }
    renderDesigner(panel)
    const row = screen.getByText('CD3').closest('tr')
    expect(row?.dataset.assigned).toBe('true')
  })

  it('occupied column header shows indicator', () => {
    const panel: Panel = {
      id: 'p1',
      name: 'Test',
      instrument_id: 'inst-1',
      created_at: null,
      updated_at: null,
      targets: [{ id: 't1', panel_id: 'p1', antibody_id: 'ab1', sort_order: 0 }],
      assignments: [
        { id: 'a1', panel_id: 'p1', antibody_id: 'ab1', fluorophore_id: 'fl-fitc', detector_id: 'd1', notes: null },
      ],
    }
    renderDesigner(panel)
    // 530/30 header should have a colored dot indicator
    const header530 = screen.getByText('530/30')
    const dot = header530.parentElement?.querySelector('span.rounded-full')
    expect(dot).toBeTruthy()
  })

  it('null instrument state shows no detector columns, just targets', () => {
    const panel: Panel = {
      id: 'p1',
      name: 'Test',
      instrument_id: null,
      created_at: null,
      updated_at: null,
      targets: [{ id: 't1', panel_id: 'p1', antibody_id: 'ab1', sort_order: 0 }],
      assignments: [],
    }
    renderDesigner(panel)
    expect(screen.getByText(/Select an instrument to begin designing/)).toBeInTheDocument()
    expect(screen.getByText('CD3')).toBeInTheDocument()
    expect(screen.queryByText('530/30')).not.toBeInTheDocument()
  })
})
