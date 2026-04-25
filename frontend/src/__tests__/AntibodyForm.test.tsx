import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// ---- module-level stubs -----------------------------------------------
// useCreateAntibody / useUpdateAntibody are vi.fn() so individual tests can
// override their return value with mockReturnValue without needing dynamic imports.

const mockCreate = vi.fn()
const mockUpdate = vi.fn()

// Default hook returns: no error, not pending.
const mockUseCreate = vi.fn(() => ({ mutate: mockCreate, error: null as Error | null, isPending: false }))
const mockUseUpdate = vi.fn(() => ({ mutate: mockUpdate, error: null as Error | null, isPending: false }))

vi.mock('@/hooks/useAntibodies', () => ({
  useCreateAntibody: () => mockUseCreate(),
  useUpdateAntibody: () => mockUseUpdate(),
}))

import AntibodyForm from '@/components/antibodies/AntibodyForm'
import type { Antibody, Fluorophore } from '@/types'

const fluorophores: Fluorophore[] = [
  { id: 'fl-1', name: 'FITC', ex_max_nm: 494, em_max_nm: 519, source: 'FPbase', fluor_type: 'dye', ext_coeff: null, qy: null, lifetime_ns: null, oligomerization: null, switch_type: null, has_spectra: true, is_favorite: false },
  { id: 'fl-2', name: 'PE', ex_max_nm: 565, em_max_nm: 578, source: 'FPbase', fluor_type: 'dye', ext_coeff: null, qy: null, lifetime_ns: null, oligomerization: null, switch_type: null, has_spectra: true, is_favorite: false },
]

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient()
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

describe('AntibodyForm', () => {
  beforeEach(() => {
    mockCreate.mockClear()
    mockUpdate.mockClear()
    // Reset hooks to default (no error, not pending)
    mockUseCreate.mockReturnValue({ mutate: mockCreate, error: null, isPending: false })
    mockUseUpdate.mockReturnValue({ mutate: mockUpdate, error: null, isPending: false })
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
    const ab = {
      id: 'ab-1',
      target: 'CD3',
      clone: 'OKT3',
      host: 'mouse',
      isotype: 'IgG1',
      fluorophore_id: 'fl-1',
      fluorophore_name: 'FITC',
      vendor: 'BioLegend',
      catalog_number: '300401',
    } as Antibody
    render(
      <AntibodyForm antibody={ab} fluorophores={fluorophores} onClose={vi.fn()} />,
      { wrapper }
    )
    expect(screen.getByText('Edit Antibody')).toBeInTheDocument()
    expect(screen.getByDisplayValue('CD3')).toBeInTheDocument()
    expect(screen.getByDisplayValue('OKT3')).toBeInTheDocument()
    // Fluorophore chip should show FITC selected
    expect(screen.getByText('FITC')).toBeInTheDocument()
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

  // ---------------------------------------------------------------------------
  // Error-banner rendering
  // ---------------------------------------------------------------------------

  it('shows the error banner when useCreateAntibody returns an error', () => {
    // Simulate a settled mutation with a server-side error (e.g. 409 duplicate)
    mockUseCreate.mockReturnValue({
      mutate: mockCreate,
      error: new Error('An antibody with the same name and catalog number already exists.'),
      isPending: false,
    })
    render(
      <AntibodyForm antibody={null} fluorophores={fluorophores} onClose={vi.fn()} />,
      { wrapper }
    )
    expect(
      screen.getByText('An antibody with the same name and catalog number already exists.')
    ).toBeInTheDocument()
  })

  // ---------------------------------------------------------------------------
  // isPending disables the submit button
  // ---------------------------------------------------------------------------

  it('Create button is disabled while isPending is true', () => {
    mockUseCreate.mockReturnValue({ mutate: mockCreate, error: null, isPending: true })
    render(
      <AntibodyForm antibody={null} fluorophores={fluorophores} onClose={vi.fn()} />,
      { wrapper }
    )
    expect(screen.getByText('Create')).toBeDisabled()
  })
})
