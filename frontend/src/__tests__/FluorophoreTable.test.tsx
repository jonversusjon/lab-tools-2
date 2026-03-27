import { describe, it, expect, vi } from 'vitest'
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
]

vi.mock('@/hooks/useFluorophores', () => ({
  useFluorophores: () => ({
    data: { items: mockFluorophores, total: 3, skip: 0, limit: 500 },
    isLoading: false,
    error: null,
  }),
  useFluorophoreSpectra: () => ({ data: null }),
  useBatchSpectra: () => ({ data: null }),
  useFetchFromFpbase: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
    error: null,
  }),
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

  it('clicking column header sorts the table', () => {
    render(<FluorophoreTable />, { wrapper })
    // Default sort by name ascending: APC, FITC, PE
    const cells = screen.getAllByRole('cell')
    const nameTexts = cells
      .filter((_, i) => i % 5 === 1) // name is second column
      .map((c) => c.textContent)
    expect(nameTexts).toEqual(['APC', 'FITC', 'PE'])

    // Click name header to reverse
    fireEvent.click(screen.getByText(/^Name/))
    const cellsAfter = screen.getAllByRole('cell')
    const nameTextsAfter = cellsAfter
      .filter((_, i) => i % 5 === 1)
      .map((c) => c.textContent)
    expect(nameTextsAfter).toEqual(['PE', 'FITC', 'APC'])
  })

  it('selecting checkboxes shows View Overlay button', () => {
    render(<FluorophoreTable />, { wrapper })
    expect(screen.queryByText(/View Overlay/)).not.toBeInTheDocument()

    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[0])
    fireEvent.click(checkboxes[1])

    expect(screen.getByText(/View Overlay/)).toBeInTheDocument()
  })
})
