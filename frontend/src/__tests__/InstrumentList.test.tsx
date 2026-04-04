import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import InstrumentList from '@/components/instruments/InstrumentList'

vi.mock('@/hooks/useInstruments', () => ({
  useInstruments: () => ({
    data: {
      items: [
        {
          id: '1',
          name: 'BD FACSAria III',
          is_favorite: false,
          location: null,
          lasers: [
            {
              id: 'l1',
              instrument_id: '1',
              wavelength_nm: 488,
              name: 'Blue',
              detectors: [
                { id: 'd1', laser_id: 'l1', filter_midpoint: 530, filter_width: 30, name: null },
                { id: 'd2', laser_id: 'l1', filter_midpoint: 695, filter_width: 40, name: null },
              ],
            },
            {
              id: 'l2',
              instrument_id: '1',
              wavelength_nm: 637,
              name: 'Red',
              detectors: [
                { id: 'd3', laser_id: 'l2', filter_midpoint: 670, filter_width: 30, name: null },
              ],
            },
          ],
        },
      ],
      total: 1,
      skip: 0,
      limit: 100,
    },
    isLoading: false,
    error: null,
  }),
  useCreateInstrument: () => ({ mutate: vi.fn() }),
  useUpdateInstrument: () => ({ mutate: vi.fn() }),
  useDeleteInstrument: () => ({ mutate: vi.fn() }),
  useImportInstrument: () => ({ mutate: vi.fn() }),
  useToggleInstrumentFavorite: () => ({ mutate: vi.fn() }),
}))

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient()
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  )
}

describe('InstrumentList', () => {
  it('renders list of instruments from mock data', () => {
    render(<InstrumentList />, { wrapper })
    expect(screen.getByText('BD FACSAria III')).toBeInTheDocument()
  })

  it('shows laser and detector counts', () => {
    render(<InstrumentList />, { wrapper })
    // 2 lasers, 3 detectors total
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('shows New Instrument button', () => {
    render(<InstrumentList />, { wrapper })
    expect(screen.getByText('New Instrument')).toBeInTheDocument()
  })
})
