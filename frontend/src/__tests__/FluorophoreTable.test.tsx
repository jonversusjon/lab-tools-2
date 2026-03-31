import { describe, it, expect, vi } from 'vitest'
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
]

vi.mock('@/hooks/useFluorophores', () => ({
  useFluorophores: () => ({
    data: { items: mockFluorophores, total: 3, skip: 0, limit: 500 },
    isLoading: false,
    error: null,
  }),
  useFluorophoreSpectra: () => ({ data: null, isLoading: false }),
  useInstrumentCompatibility: () => ({ data: null, isLoading: false }),
  useBatchSpectra: () => ({ data: null }),
  useFetchFromFpbase: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
    error: null,
  }),
  useToggleFluorophoreFavorite: () => ({ mutate: vi.fn() }),
  useRecentFluorophores: () => ({ data: [] }),
}))

import FluorophoreTable from '@/components/fluorophores/FluorophoreTable'

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient()
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  )
}

describe('FluorophoreTable', () => {
  it('renders table rows from mock fluorophore list', () => {
    render(<FluorophoreTable />, { wrapper })
    expect(screen.getByText('FITC')).toBeInTheDocument()
    expect(screen.getByText('PE')).toBeInTheDocument()
    expect(screen.getByText('APC')).toBeInTheDocument()
  })

  it('shows search and filter controls', () => {
    render(<FluorophoreTable />, { wrapper })
    expect(screen.getByPlaceholderText(/Search by name/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'protein' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'dye' })).toBeInTheDocument()
  })

  it('selecting checkboxes opens overlay sidebar', () => {
    render(<FluorophoreTable />, { wrapper })
    expect(screen.queryByText('Spectra Overlay')).not.toBeInTheDocument()

    const overlayCheckboxes = screen.getAllByTitle('Add to spectra overlay')
    fireEvent.click(overlayCheckboxes[0])

    // Sidebar appears after first selection
    expect(screen.getByText('Spectra Overlay')).toBeInTheDocument()
    expect(screen.getByText('Select 1 more to compare.')).toBeInTheDocument()

    fireEvent.click(overlayCheckboxes[1])

    // Sidebar still visible, prompt gone
    expect(screen.getByText('Spectra Overlay')).toBeInTheDocument()
    expect(screen.queryByText(/Select .* more to compare/)).not.toBeInTheDocument()
  })
})
