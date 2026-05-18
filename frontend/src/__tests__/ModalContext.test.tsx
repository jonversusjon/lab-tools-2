import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ModalProvider, useModal } from '@/components/layout/ModalContext'
import ModalRoot from '@/components/layout/ModalRoot'

vi.mock('@/hooks/useFluorophores', () => ({
  useFpbaseCatalog: () => ({ data: [], isLoading: false, isError: false }),
  useFluorophores: () => ({ data: { items: [], total: 0, skip: 0, limit: 0 } }),
  useBatchFetchFpbase: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

function Opener() {
  const { open } = useModal()
  return (
    <button onClick={() => open({ kind: 'fpbase_fetch' })}>open fpbase</button>
  )
}

function OpenerWithPrefill() {
  const { open } = useModal()
  return (
    <button onClick={() => open({ kind: 'fpbase_fetch', fluorophoreId: 'abc' })}>
      open prefilled
    </button>
  )
}

function renderWithProviders(child: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <ModalProvider>
        {child}
        <ModalRoot />
      </ModalProvider>
    </QueryClientProvider>
  )
}

describe('ModalContext', () => {
  it('renders nothing when no request is open', () => {
    renderWithProviders(<Opener />)
    expect(screen.queryByText('Fetch from FPbase')).not.toBeInTheDocument()
  })

  it('opens FpbaseFetchModal when fpbase_fetch is requested', () => {
    renderWithProviders(<Opener />)
    fireEvent.click(screen.getByText('open fpbase'))
    expect(screen.getByText('Fetch from FPbase')).toBeInTheDocument()
  })

  it('passes prefillFluorophoreId through to the modal', () => {
    renderWithProviders(<OpenerWithPrefill />)
    fireEvent.click(screen.getByText('open prefilled'))
    expect(screen.getByText('Fetch from FPbase')).toBeInTheDocument()
  })

  it('closes the modal on close()', () => {
    renderWithProviders(<Opener />)
    fireEvent.click(screen.getByText('open fpbase'))
    expect(screen.getByText('Fetch from FPbase')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Cancel'))
    expect(screen.queryByText('Fetch from FPbase')).not.toBeInTheDocument()
  })
})
