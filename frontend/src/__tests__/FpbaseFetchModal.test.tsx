import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import FpbaseFetchModal from '@/components/fluorophores/FpbaseFetchModal'

// Mock the hooks
const mockCatalogData = [
  { name: 'EGFP', id: 'fp1' },
  { name: 'mCherry', id: 'fp2' },
  { name: 'Alexa Fluor 488', id: 'fp3' },
  { name: 'Alexa Fluor 647', id: 'fp4' },
  { name: 'FITC', id: 'fp5' },
]

const mockFluorophoresData = {
  items: [{ id: 'local1', name: 'EGFP', excitation_max_nm: 488, emission_max_nm: 509, source: 'fpbase' }],
  total: 1,
  skip: 0,
  limit: 500,
}

let mockCatalogReturn: Record<string, unknown> = {}
let mockFluorophoresReturn: Record<string, unknown> = {}
const mockMutateAsync = vi.fn()

vi.mock('@/hooks/useFluorophores', () => ({
  useFpbaseCatalog: () => mockCatalogReturn,
  useFluorophores: () => mockFluorophoresReturn,
  useBatchFetchFpbase: () => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
  }),
}))

function renderModal(onClose = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <FpbaseFetchModal onClose={onClose} />
    </QueryClientProvider>
  )
}

describe('FpbaseFetchModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCatalogReturn = { data: mockCatalogData, isLoading: false, isError: false }
    mockFluorophoresReturn = { data: mockFluorophoresData }
  })

  it('shows loading state while catalog loads', () => {
    mockCatalogReturn = { data: undefined, isLoading: true, isError: false }
    renderModal()
    expect(screen.getByText('Loading catalog...')).toBeInTheDocument()
  })

  it('shows catalog items after loading', () => {
    renderModal()
    expect(screen.getByText('EGFP')).toBeInTheDocument()
    expect(screen.getByText('mCherry')).toBeInTheDocument()
    expect(screen.getByText('Alexa Fluor 488')).toBeInTheDocument()
  })

  it('filters items with fuzzy search', () => {
    renderModal()
    const input = screen.getByPlaceholderText('Search FPbase fluorophores...')
    fireEvent.change(input, { target: { value: 'alexa' } })
    expect(screen.getByText('Alexa Fluor 488')).toBeInTheDocument()
    expect(screen.getByText('Alexa Fluor 647')).toBeInTheDocument()
    expect(screen.queryByText('EGFP')).not.toBeInTheDocument()
    expect(screen.queryByText('mCherry')).not.toBeInTheDocument()
  })

  it('shows already-imported checkmark for EGFP', () => {
    renderModal()
    // EGFP is in our local fluorophores
    const importedMarker = screen.getByText('\u2713 imported')
    expect(importedMarker).toBeInTheDocument()
  })

  it('multi-select adds chips and updates fetch button count', () => {
    renderModal()
    fireEvent.click(screen.getByText('mCherry'))
    fireEvent.click(screen.getByText('FITC'))

    // Should show chip elements
    const chips = screen.getAllByText(/\u00d7/)
    expect(chips.length).toBeGreaterThanOrEqual(2)

    // Fetch button should show count
    expect(screen.getByText('Fetch (2)')).toBeInTheDocument()
  })

  it('deselecting removes chip', () => {
    renderModal()
    fireEvent.click(screen.getByText('mCherry'))
    expect(screen.getByText('Fetch (1)')).toBeInTheDocument()

    // Click the list item (button) to deselect — use getAllByText since chip also has the name
    const mCherryElements = screen.getAllByText('mCherry')
    const listButton = mCherryElements.find((el) => el.closest('button.flex'))
    fireEvent.click(listButton!)
    expect(screen.queryByText('Fetch (1)')).not.toBeInTheDocument()
  })

  it('triggers batch fetch on Fetch button click', async () => {
    mockMutateAsync.mockResolvedValue({
      fetched: [{ id: 'new1', name: 'mCherry', excitation_max_nm: 587, emission_max_nm: 610, source: 'fpbase' }],
      errors: [],
    })

    renderModal()
    fireEvent.click(screen.getByText('mCherry'))
    fireEvent.click(screen.getByText('Fetch (1)'))

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith(['mCherry'])
    })

    await waitFor(() => {
      expect(screen.getByText(/Successfully imported/)).toBeInTheDocument()
    })
  })

  it('shows errors for failed fetches', async () => {
    mockMutateAsync.mockResolvedValue({
      fetched: [],
      errors: [{ name: 'BadDye', detail: 'Not found on FPbase' }],
    })

    renderModal()
    fireEvent.click(screen.getByText('mCherry'))
    fireEvent.click(screen.getByText('Fetch (1)'))

    await waitFor(() => {
      expect(screen.getByText(/Failed/)).toBeInTheDocument()
      expect(screen.getByText(/BadDye/)).toBeInTheDocument()
    })
  })

  it('fetch button is disabled when nothing is selected', () => {
    renderModal()
    const fetchBtn = screen.getByText('Fetch')
    expect(fetchBtn).toBeDisabled()
  })
})
