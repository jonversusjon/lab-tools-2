import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import LocationInput from '@/components/shared/LocationInput'
import {
  useListEntries,
  useCreateListEntry,
} from '@/hooks/useListEntries'
import type { ListEntry } from '@/types'

vi.mock('@/hooks/useListEntries', () => ({
  useListEntries: vi.fn(),
  useCreateListEntry: vi.fn(),
}))

vi.mock('@/components/layout/Toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

const mockedUseListEntries = vi.mocked(useListEntries)
const mockedUseCreateListEntry = vi.mocked(useCreateListEntry)

function buildEntries(values: string[]): ListEntry[] {
  return values.map((value, idx) => ({
    id: 'id-' + String(idx),
    list_type: 'locations',
    value,
    sort_order: idx,
  }))
}

interface CreateMutMock {
  mutateAsync: ReturnType<typeof vi.fn>
  isPending: boolean
}

function setupMocks(opts: {
  entries: string[]
  mutateAsync?: CreateMutMock['mutateAsync']
}) {
  mockedUseListEntries.mockReturnValue({
    data: buildEntries(opts.entries),
    isLoading: false,
    error: null,
  } as unknown as ReturnType<typeof useListEntries>)

  const mutateAsync =
    opts.mutateAsync ?? vi.fn().mockResolvedValue({ id: 'new', value: 'new' })
  mockedUseCreateListEntry.mockReturnValue({
    mutateAsync,
    isPending: false,
  } as unknown as ReturnType<typeof useCreateListEntry>)
  return { mutateAsync }
}

describe('LocationInput', () => {
  beforeEach(() => {
    mockedUseListEntries.mockReset()
    mockedUseCreateListEntry.mockReset()
  })

  it('renders the current value in the input', () => {
    setupMocks({ entries: ['Lab A', 'Lab B'] })
    render(<LocationInput value="Lab A" onChange={vi.fn()} />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    expect(input.value).toBe('Lab A')
  })

  it('shows matching suggestions when typing', () => {
    setupMocks({ entries: ['Tissue Culture Room', 'Imaging Core', 'Cold Room'] })
    render(<LocationInput value="" onChange={vi.fn()} />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'room' } })
    expect(screen.getByText('Tissue Culture Room')).toBeInTheDocument()
    expect(screen.getByText('Cold Room')).toBeInTheDocument()
    expect(screen.queryByText('Imaging Core')).not.toBeInTheDocument()
  })

  it('selecting a suggestion calls onChange with that value', () => {
    setupMocks({ entries: ['Lab A', 'Lab B'] })
    const onChange = vi.fn()
    render(<LocationInput value="" onChange={onChange} />)
    const input = screen.getByRole('textbox')
    fireEvent.focus(input)
    fireEvent.click(screen.getByText('Lab B'))
    expect(onChange).toHaveBeenCalledWith('Lab B')
  })

  it('shows "Add new" affordance for novel values', () => {
    setupMocks({ entries: ['Lab A'] })
    render(<LocationInput value="" onChange={vi.fn()} />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'Cold Room' } })
    expect(screen.getByText(/Add new location/i)).toBeInTheDocument()
  })

  it('does not show "Add new" when typed value matches an existing entry', () => {
    setupMocks({ entries: ['Lab A'] })
    render(<LocationInput value="" onChange={vi.fn()} />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'Lab A' } })
    expect(screen.queryByText(/Add new location/i)).not.toBeInTheDocument()
  })

  it('clicking "Add new" creates entry and calls onChange', async () => {
    const { mutateAsync } = setupMocks({ entries: [] })
    const onChange = vi.fn()
    render(<LocationInput value="" onChange={onChange} />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'New Lab' } })
    fireEvent.click(screen.getByText(/Add new location/i))
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith('New Lab'))
    expect(onChange).toHaveBeenCalledWith('New Lab')
  })

  it('Enter on a novel value triggers creation', async () => {
    const { mutateAsync } = setupMocks({ entries: ['Lab A'] })
    const onChange = vi.fn()
    render(<LocationInput value="" onChange={onChange} />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'Cold Room' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith('Cold Room'))
    expect(onChange).toHaveBeenCalledWith('Cold Room')
  })

  it('Enter on an exact existing match selects without creation', async () => {
    const { mutateAsync } = setupMocks({ entries: ['Lab A', 'Lab B'] })
    const onChange = vi.fn()
    render(<LocationInput value="" onChange={onChange} />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'Lab A' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith('Lab A')
    expect(mutateAsync).not.toHaveBeenCalled()
  })
})
