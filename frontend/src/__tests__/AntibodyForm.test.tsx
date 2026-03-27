import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const mockCreate = vi.fn()
const mockUpdate = vi.fn()

vi.mock('@/hooks/useAntibodies', () => ({
  useCreateAntibody: () => ({ mutate: mockCreate }),
  useUpdateAntibody: () => ({ mutate: mockUpdate }),
}))

import AntibodyForm from '@/components/antibodies/AntibodyForm'
import type { Antibody, Fluorophore } from '@/types'

const fluorophores: Fluorophore[] = [
  { id: 'fl-1', name: 'FITC', ex_max_nm: 494, em_max_nm: 519, source: 'FPbase', fluor_type: 'dye', ext_coeff: null, qy: null, lifetime_ns: null, oligomerization: null, switch_type: null, has_spectra: true },
  { id: 'fl-2', name: 'PE', ex_max_nm: 565, em_max_nm: 578, source: 'FPbase', fluor_type: 'dye', ext_coeff: null, qy: null, lifetime_ns: null, oligomerization: null, switch_type: null, has_spectra: true },
]

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient()
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

describe('AntibodyForm', () => {
  beforeEach(() => {
    mockCreate.mockClear()
    mockUpdate.mockClear()
  })

  it('renders empty form for new antibody', () => {
    render(
      <AntibodyForm antibody={null} fluorophores={fluorophores} onClose={vi.fn()} />,
      { wrapper }
    )
    expect(screen.getByText('New Antibody')).toBeInTheDocument()
    expect(screen.getByText('Create')).toBeInTheDocument()
  })

  it('renders pre-populated form for editing', () => {
    const ab: Antibody = {
      id: 'ab-1',
      target: 'CD3',
      clone: 'OKT3',
      host: 'mouse',
      isotype: 'IgG1',
      fluorophore_id: 'fl-1',
      fluorophore_name: 'FITC',
      vendor: 'BioLegend',
      catalog_number: '300401',
    }
    render(
      <AntibodyForm antibody={ab} fluorophores={fluorophores} onClose={vi.fn()} />,
      { wrapper }
    )
    expect(screen.getByText('Edit Antibody')).toBeInTheDocument()
    expect(screen.getByDisplayValue('CD3')).toBeInTheDocument()
    expect(screen.getByDisplayValue('OKT3')).toBeInTheDocument()
    // Fluorophore dropdown should have FITC selected
    const select = screen.getByDisplayValue('FITC')
    expect(select).toBeInTheDocument()
  })

  it('submit with empty target shows validation error', () => {
    render(
      <AntibodyForm antibody={null} fluorophores={fluorophores} onClose={vi.fn()} />,
      { wrapper }
    )
    fireEvent.click(screen.getByText('Create'))
    expect(screen.getByText('Target is required.')).toBeInTheDocument()
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('submit with valid data calls create handler', () => {
    render(
      <AntibodyForm antibody={null} fluorophores={fluorophores} onClose={vi.fn()} />,
      { wrapper }
    )
    fireEvent.change(screen.getByLabelText(/Target/), { target: { value: 'CD45' } })
    fireEvent.click(screen.getByText('Create'))
    expect(mockCreate).toHaveBeenCalledTimes(1)
    expect(mockCreate.mock.calls[0][0]).toMatchObject({ target: 'CD45' })
  })
})
