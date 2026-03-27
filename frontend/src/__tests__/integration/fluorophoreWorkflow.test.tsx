import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('react-chartjs-2', () => ({
  Line: () => <canvas data-testid="chart" />,
}))
vi.mock('chartjs-plugin-annotation', () => ({ default: {} }))

const mockFluorophores = [
  { id: '1', name: 'FITC', excitation_max_nm: 494, emission_max_nm: 519, source: 'seed' },
  { id: '2', name: 'PE', excitation_max_nm: 565, emission_max_nm: 578, source: 'seed' },
  { id: '3', name: 'APC', excitation_max_nm: 650, emission_max_nm: 660, source: 'seed' },
  { id: '4', name: 'BV421', excitation_max_nm: 405, emission_max_nm: 421, source: 'seed' },
]

const mockSpectraData = {
  id: '1',
  name: 'FITC',
  spectra: {
    excitation: [[400, 0.1], [450, 0.5], [494, 1.0], [520, 0.2]],
    emission: [[500, 0.1], [519, 1.0], [550, 0.5], [600, 0.1]],
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
  }),
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

  it('seed fluorophores render in sortable table', () => {
    renderTable()

    expect(screen.getByText('FITC')).toBeInTheDocument()
    expect(screen.getByText('PE')).toBeInTheDocument()
    expect(screen.getByText('APC')).toBeInTheDocument()
    expect(screen.getByText('BV421')).toBeInTheDocument()

    // All show source column
    const seedCells = screen.getAllByText('seed')
    expect(seedCells.length).toBe(4)
  })

  it('sorting by emission max orders fluorophores correctly', () => {
    renderTable()

    // Click emission column header
    fireEvent.click(screen.getByText(/Em Max/))

    const cells = screen.getAllByRole('cell')
    // Emission max values (column index 3 of 5): 421, 519, 578, 660
    const emValues = cells
      .filter((_, i) => i % 5 === 3)
      .map((c) => c.textContent)
    expect(emValues).toEqual(['421', '519', '578', '660'])
  })

  it('check 3 fluorophores → overlay button appears → click shows overlay', () => {
    renderTable()

    // Initially no overlay button
    expect(screen.queryByText(/View Overlay/)).not.toBeInTheDocument()

    // Check 3 fluorophores
    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[0]) // FITC (alphabetical: APC first after sort)
    fireEvent.click(checkboxes[1])
    fireEvent.click(checkboxes[2])

    // Overlay button appears
    const overlayBtn = screen.getByText(/View Overlay/)
    expect(overlayBtn).toBeInTheDocument()

    // Click it
    fireEvent.click(overlayBtn)

    // Overlay panel appears
    expect(screen.getByText(/Spectra Overlay/)).toBeInTheDocument()
  })

  it('clicking fluorophore name shows single spectra viewer', () => {
    mockSelectedSpectra = mockSpectraData
    renderTable()

    // Click FITC name
    fireEvent.click(screen.getByText('FITC'))

    // Spectra viewer section appears with chart
    expect(screen.getByText('FITC — Spectra')).toBeInTheDocument()
    expect(screen.getByTestId('chart')).toBeInTheDocument()
  })

  it('clicking same fluorophore again deselects it', () => {
    mockSelectedSpectra = mockSpectraData
    renderTable()

    // Click FITC to select
    fireEvent.click(screen.getByText('FITC'))
    expect(screen.getByText('FITC — Spectra')).toBeInTheDocument()

    // Click FITC again to deselect
    fireEvent.click(screen.getByText('FITC'))
    expect(screen.queryByText('FITC — Spectra')).not.toBeInTheDocument()
  })

  it('Fetch from FPbase button is present', () => {
    renderTable()
    expect(screen.getByText('Fetch from FPbase')).toBeInTheDocument()
  })
})
