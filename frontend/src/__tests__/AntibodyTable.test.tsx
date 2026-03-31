import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const mockAntibodies = [
  { id: '1', target: 'CD3', clone: 'OKT3', host: 'mouse', isotype: 'IgG1', fluorophore_id: null, fluorophore_name: null, vendor: 'BioLegend', catalog_number: '300401', tags: [] },
  { id: '2', target: 'CD4', clone: 'RPA-T4', host: 'mouse', isotype: 'IgG1', fluorophore_id: 'fl-1', fluorophore_name: 'FITC', vendor: 'BD', catalog_number: '555346', tags: [] },
  { id: '3', target: 'CD8', clone: 'SK1', host: 'mouse', isotype: 'IgG1', fluorophore_id: null, fluorophore_name: null, vendor: null, catalog_number: null, tags: [] },
]

vi.mock('@/hooks/useTags', () => ({
  useTags: () => ({ data: [] }),
  useCreateTag: () => ({ mutateAsync: vi.fn() }),
  useDeleteTag: () => ({ mutateAsync: vi.fn() }),
}))

vi.mock('@/hooks/useAntibodies', () => ({
  useAntibodies: (params?: { search?: string }) => {
    const q = params?.search?.toLowerCase() ?? ''
    const items = q
      ? mockAntibodies.filter(
          (ab) =>
            ab.target.toLowerCase().includes(q) ||
            (ab.clone ?? '').toLowerCase().includes(q)
        )
      : mockAntibodies
    return { data: { items, total: items.length, skip: 0, limit: 500 }, isLoading: false, error: null }
  },
  useCreateAntibody: () => ({ mutate: vi.fn() }),
  useUpdateAntibody: () => ({ mutate: vi.fn() }),
  useDeleteAntibody: () => ({ mutate: vi.fn() }),
  useToggleAntibodyFavorite: () => ({ mutate: vi.fn() }),
}))

vi.mock('@/hooks/useFluorophores', () => ({
  useFluorophores: () => ({
    data: { items: [{ id: 'fl-1', name: 'FITC', excitation_max_nm: 494, emission_max_nm: 519, source: 'seed' }], total: 1, skip: 0, limit: 500 },
    isLoading: false,
    error: null,
  }),
}))

import AntibodyTable from '@/components/antibodies/AntibodyTable'

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient()
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  )
}

describe('AntibodyTable', () => {
  it('renders rows from mock data', () => {
    render(<AntibodyTable />, { wrapper })
    expect(screen.getByText('CD3')).toBeInTheDocument()
    expect(screen.getByText('CD4')).toBeInTheDocument()
    expect(screen.getByText('CD8')).toBeInTheDocument()
  })

  it('search input filters rows by target name', () => {
    render(<AntibodyTable />, { wrapper })
    const input = screen.getByPlaceholderText(/Search by target/)
    fireEvent.change(input, { target: { value: 'CD3' } })
    expect(screen.getByText('CD3')).toBeInTheDocument()
    expect(screen.queryByText('CD4')).not.toBeInTheDocument()
    expect(screen.queryByText('CD8')).not.toBeInTheDocument()
  })

  it('"New Antibody" button opens modal', () => {
    render(<AntibodyTable />, { wrapper })
    fireEvent.click(screen.getByText('New Antibody'))
    expect(screen.getByText('New Antibody', { selector: 'h2' })).toBeInTheDocument()
  })

  it('pre-conjugated antibody shows fluorophore name in conjugate column', () => {
    render(<AntibodyTable />, { wrapper })
    expect(screen.getByText('FITC')).toBeInTheDocument()
  })

  it('unconjugated antibody shows placeholder in conjugate column', () => {
    render(<AntibodyTable />, { wrapper })
    // CD3 and CD8 are unconjugated; they show '--' in the conjugate column
    const placeholders = screen.getAllByText('--')
    expect(placeholders.length).toBeGreaterThanOrEqual(2)
  })
})
