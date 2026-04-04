import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import InstrumentEditor from '@/components/instruments/InstrumentEditor'

const mockCreateMutation = { mutateAsync: vi.fn(), isPending: false }
const mockUpdateMutation = { mutateAsync: vi.fn(), isPending: false }
const mockDeleteMutation = { mutateAsync: vi.fn(), isPending: false }

const existingInstrument = {
  id: '1',
  name: 'Test Cytometer',
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
}

let mockExistingData: typeof existingInstrument | undefined

vi.mock('@/hooks/useInstruments', () => ({
  useInstrument: () => ({
    data: mockExistingData,
    isLoading: false,
  }),
  useCreateInstrument: () => mockCreateMutation,
  useUpdateInstrument: () => mockUpdateMutation,
  useDeleteInstrument: () => mockDeleteMutation,
}))

function renderEditor(path: string) {
  const qc = new QueryClient()
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/instruments/new" element={<InstrumentEditor />} />
          <Route path="/instruments/:id" element={<InstrumentEditor />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('InstrumentEditor', () => {
  it('renders empty state for new instrument', () => {
    mockExistingData = undefined
    renderEditor('/instruments/new')
    expect(screen.getByText('New Instrument')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('e.g. BD FACSAria III')).toHaveValue('')
    expect(screen.getByText('+ Add Laser')).toBeInTheDocument()
  })

  it('renders with existing instrument data', () => {
    mockExistingData = existingInstrument
    renderEditor('/instruments/1')
    expect(screen.getByText('Edit Instrument')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Test Cytometer')).toBeInTheDocument()
    // 2 laser sections
    expect(screen.getByDisplayValue('Blue')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Red')).toBeInTheDocument()
    // 3 detector rows total (check midpoint values)
    expect(screen.getByDisplayValue('530')).toBeInTheDocument()
    expect(screen.getByDisplayValue('695')).toBeInTheDocument()
    expect(screen.getByDisplayValue('670')).toBeInTheDocument()
  })

  it('adding a laser adds a new section', () => {
    mockExistingData = undefined
    renderEditor('/instruments/new')
    fireEvent.click(screen.getByText('+ Add Laser'))
    // Should now show a laser section with "Remove" button
    expect(screen.getByText('+ Add Detector')).toBeInTheDocument()
  })

  it('adding a detector adds a new row', () => {
    mockExistingData = undefined
    renderEditor('/instruments/new')
    fireEvent.click(screen.getByText('+ Add Laser'))
    fireEvent.click(screen.getByText('+ Add Detector'))
    // Should show a midpoint input placeholder
    expect(screen.getAllByPlaceholderText('Midpoint').length).toBe(1)
  })

  it('removing a detector removes the row', () => {
    mockExistingData = undefined
    renderEditor('/instruments/new')
    fireEvent.click(screen.getByText('+ Add Laser'))
    fireEvent.click(screen.getByText('+ Add Detector'))
    expect(screen.getAllByPlaceholderText('Midpoint').length).toBe(1)
    fireEvent.click(screen.getByLabelText('Remove detector'))
    expect(screen.queryByPlaceholderText('Midpoint')).not.toBeInTheDocument()
  })

  it('bandpass helper text computes correctly', () => {
    mockExistingData = existingInstrument
    renderEditor('/instruments/1')
    // 530/30 → 515–545 nm
    const ranges = screen.getAllByTestId('bandpass-range')
    const rangeTexts = ranges.map((el) => el.textContent)
    expect(rangeTexts).toContain('515\u2013545 nm')
  })
})
