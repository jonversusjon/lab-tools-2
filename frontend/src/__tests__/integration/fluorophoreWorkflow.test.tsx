import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('react-chartjs-2', () => ({
  Line: () => <canvas data-testid="chart" />,
}))
vi.mock('chartjs-plugin-annotation', () => ({ default: {} }))

const mockFluorophores = [
  { id: '1', name: 'FITC', ex_max_nm: 494, em_max_nm: 519, source: 'FPbase', fluor_type: 'dye', ext_coeff: null, qy: null, lifetime_ns: null, oligomerization: null, switch_type: null, has_spectra: true },
  { id: '2', name: 'PE', ex_max_nm: 565, em_max_nm: 578, source: 'FPbase', fluor_type: 'dye', ext_coeff: null, qy: null, lifetime_ns: null, oligomerization: null, switch_type: null, has_spectra: true },
  { id: '3', name: 'APC', ex_max_nm: 650, em_max_nm: 660, source: 'FPbase', fluor_type: 'dye', ext_coeff: null, qy: null, lifetime_ns: null, oligomerization: null, switch_type: null, has_spectra: true },
  { id: '4', name: 'BV421', ex_max_nm: 405, em_max_nm: 421, source: 'FPbase', fluor_type: 'dye', ext_coeff: null, qy: null, lifetime_ns: null, oligomerization: null, switch_type: null, has_spectra: true },
]

const mockSpectraData = {
  id: '1',
  name: 'FITC',
  spectra: {
    EX: [[400, 0.1], [450, 0.5], [494, 1.0], [520, 0.2]],
    EM: [[500, 0.1], [519, 1.0], [550, 0.5], [600, 0.1]],
  },
}

let mockSelectedSpectra: typeof mockSpectraData | null = null

vi.mock('@/hooks/useFluorophores', () => ({
  useFluorophores: () => ({
    data: { items: mockFluorophores, total: 4, skip: 0, limit: 500 },
    isLoading: false,
    error: null,
  }),
  useFluorophoreSpectra: (id: string) => ({
    data: id ? mockSelectedSpectra : null,
    isLoading: false,
  }),
  useInstrumentCompatibility: () => ({ data: null, isLoading: false }),
  useBatchSpectra: (ids: string[]) => ({
    data: ids && ids.length > 0 ? {} : null,
  }),
  useFetchFromFpbase: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
    error: null,
  }),
}))

import FluorophoreTable from '@/components/fluorophores/FluorophoreTable'

function renderTable() {
  const qc = new QueryClient()
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <FluorophoreTable />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('Fluorophore Workflow Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSelectedSpectra = null
  })

  it('seed fluorophores render in table', () => {
    renderTable()

    expect(screen.getByText('FITC')).toBeInTheDocument()
    expect(screen.getByText('PE')).toBeInTheDocument()
    expect(screen.getByText('APC')).toBeInTheDocument()
    expect(screen.getByText('BV421')).toBeInTheDocument()

    // All show source column as FPbase
    const fpbaseCells = screen.getAllByText('FPbase')
    expect(fpbaseCells.length).toBe(4)
  })

  it('type filter and search controls are present', () => {
    renderTable()

    expect(screen.getByPlaceholderText(/Search by name/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'all' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'protein' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'dye' })).toBeInTheDocument()
  })

  it('check 3 fluorophores → overlay sidebar appears', () => {
    renderTable()

    // Initially no sidebar
    expect(screen.queryByText('Spectra Overlay')).not.toBeInTheDocument()

    const overlayCheckboxes = screen.getAllByTitle('Add to spectra overlay')
    fireEvent.click(overlayCheckboxes[0])
    fireEvent.click(overlayCheckboxes[1])
    fireEvent.click(overlayCheckboxes[2])

    // Sidebar appears; each selected name appears in both the table and the sidebar chip list
    expect(screen.getByText('Spectra Overlay')).toBeInTheDocument()
    expect(screen.getAllByText('FITC').length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByText('PE').length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByText('APC').length).toBeGreaterThanOrEqual(2)
    // Three remove buttons in sidebar
    expect(screen.getAllByRole('button', { name: /Remove/ }).length).toBe(3)
  })

  it('clicking fluorophore row expands detail section', () => {
    mockSelectedSpectra = mockSpectraData
    renderTable()

    // Click FITC row to expand
    fireEvent.click(screen.getByText('FITC'))

    // Detail section with spectra chart appears
    expect(screen.getByTestId('chart')).toBeInTheDocument()
  })

  it('clicking same fluorophore again collapses detail', () => {
    mockSelectedSpectra = mockSpectraData
    renderTable()

    // Click FITC to expand
    fireEvent.click(screen.getByText('FITC'))
    expect(screen.getByTestId('chart')).toBeInTheDocument()

    // Click FITC again to collapse (first occurrence is the table row cell)
    const allFitc = screen.getAllByText('FITC')
    fireEvent.click(allFitc[0])

    // Chart gone
    expect(screen.queryByTestId('chart')).not.toBeInTheDocument()
  })

  it('Fetch from FPbase button is present', () => {
    renderTable()
    expect(screen.getByText('Fetch from FPbase')).toBeInTheDocument()
  })
})
