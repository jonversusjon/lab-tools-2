import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import InstrumentEditor from '@/components/instruments/InstrumentEditor'

const mockCreateMutation = { mutateAsync: vi.fn(), isPending: false }
const mockUpdateMutation = { mutateAsync: vi.fn(), isPending: false }
const mockDeleteMutation = { mutateAsync: vi.fn(), isPending: false }

const existingInstrument = {
  id: 'inst-1',
  name: 'BD FACSAria III',
  is_favorite: false,
  location: null,
  lasers: [
    {
      id: 'l1',
      instrument_id: 'inst-1',
      wavelength_nm: 488,
      name: 'Blue',
      detectors: [
        { id: 'd1', laser_id: 'l1', filter_midpoint: 530, filter_width: 30, name: null },
        { id: 'd2', laser_id: 'l1', filter_midpoint: 582, filter_width: 15, name: null },
      ],
    },
    {
      id: 'l2',
      instrument_id: 'inst-1',
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

describe('Instrument Workflow Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('create new instrument: add 2 lasers with detectors → save', async () => {
    mockExistingData = undefined
    mockCreateMutation.mutateAsync.mockResolvedValue({ id: 'new-inst' })

    renderEditor('/instruments/new')

    // Set instrument name
    const nameInput = screen.getByPlaceholderText('e.g. BD FACSAria III')
    fireEvent.change(nameInput, { target: { value: 'My New Cytometer' } })

    // Add first laser
    fireEvent.click(screen.getByText('+ Add Laser'))

    // Fill laser name and wavelength
    const laserNameInputs = screen.getAllByPlaceholderText('Laser name')
    fireEvent.change(laserNameInputs[0], { target: { value: 'Blue' } })
    const wavelengthInputs = screen.getAllByPlaceholderText('Wavelength')
    fireEvent.change(wavelengthInputs[0], { target: { value: '488' } })

    // Add detector to first laser
    fireEvent.click(screen.getByText('+ Add Detector'))
    const midpointInputs = screen.getAllByPlaceholderText('Midpoint')
    fireEvent.change(midpointInputs[0], { target: { value: '530' } })
    const widthInputs = screen.getAllByPlaceholderText('Width')
    fireEvent.change(widthInputs[0], { target: { value: '30' } })

    // Verify the form has the data
    expect(screen.getByDisplayValue('My New Cytometer')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Blue')).toBeInTheDocument()
    expect(screen.getByDisplayValue('488')).toBeInTheDocument()
    expect(screen.getByDisplayValue('530')).toBeInTheDocument()
    expect(screen.getByDisplayValue('30')).toBeInTheDocument()
  })

  it('edit existing instrument: data loads, all lasers and detectors visible', () => {
    mockExistingData = existingInstrument
    renderEditor('/instruments/inst-1')

    expect(screen.getByText('Edit Instrument')).toBeInTheDocument()
    expect(screen.getByDisplayValue('BD FACSAria III')).toBeInTheDocument()

    // 2 lasers
    expect(screen.getByDisplayValue('Blue')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Red')).toBeInTheDocument()

    // 3 detectors total
    expect(screen.getByDisplayValue('530')).toBeInTheDocument()
    expect(screen.getByDisplayValue('582')).toBeInTheDocument()
    expect(screen.getByDisplayValue('670')).toBeInTheDocument()

    // Bandpass ranges shown
    const ranges = screen.getAllByTestId('bandpass-range')
    const rangeTexts = ranges.map((el) => el.textContent)
    expect(rangeTexts).toContain('515\u2013545 nm')
    expect(rangeTexts).toContain('575\u2013589 nm')
    expect(rangeTexts).toContain('655\u2013685 nm')
  })

  it('remove laser removes its section and detectors', () => {
    mockExistingData = existingInstrument
    renderEditor('/instruments/inst-1')

    // Should have 2 lasers initially
    expect(screen.getByDisplayValue('Blue')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Red')).toBeInTheDocument()

    // Remove the second laser (Red) using aria-label
    const removeLaserBtns = screen.getAllByLabelText('Remove laser')
    fireEvent.click(removeLaserBtns[removeLaserBtns.length - 1])

    // Red laser and its detector should be gone
    expect(screen.queryByDisplayValue('Red')).not.toBeInTheDocument()
    expect(screen.queryByDisplayValue('670')).not.toBeInTheDocument()

    // Blue laser still present
    expect(screen.getByDisplayValue('Blue')).toBeInTheDocument()
  })
})
