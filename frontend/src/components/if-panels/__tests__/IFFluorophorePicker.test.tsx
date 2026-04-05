import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import IFFluorophorePicker from '../IFFluorophorePicker'
import type { Fluorophore } from '@/types'

const testFluorophores: Fluorophore[] = [
  {
    id: 'af488',
    name: 'Alexa Fluor 488',
    fluor_type: 'dye',
    source: 'FPbase',
    ex_max_nm: 490,
    em_max_nm: 525,
    ext_coeff: null,
    qy: null,
    lifetime_ns: null,
    oligomerization: null,
    switch_type: null,
    has_spectra: false,
    is_favorite: false,
  },
  {
    id: 'af594',
    name: 'Alexa Fluor 594',
    fluor_type: 'dye',
    source: 'FPbase',
    ex_max_nm: 590,
    em_max_nm: 617,
    ext_coeff: null,
    qy: null,
    lifetime_ns: null,
    oligomerization: null,
    switch_type: null,
    has_spectra: false,
    is_favorite: false,
  },
  {
    id: 'dapi',
    name: 'DAPI',
    fluor_type: 'dye',
    source: 'FPbase',
    ex_max_nm: 360,
    em_max_nm: 460,
    ext_coeff: null,
    qy: null,
    lifetime_ns: null,
    oligomerization: null,
    switch_type: null,
    has_spectra: false,
    is_favorite: false,
  },
]

function renderPicker(props: Partial<Parameters<typeof IFFluorophorePicker>[0]> = {}) {
  const defaults = {
    fluorophores: testFluorophores,
    currentFluorophoreId: null,
    assignedFluorophoreIds: new Set<string>(),
    onSelect: vi.fn(),
    onClear: vi.fn(),
  }
  return render(<IFFluorophorePicker {...defaults} {...props} />)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('IFFluorophorePicker', () => {
  it('renders placeholder when no fluorophore is selected', () => {
    renderPicker()
    expect(screen.getByText('Select...')).toBeInTheDocument()
  })

  it('renders fluorophore name when one is selected', () => {
    renderPicker({ currentFluorophoreId: 'af488' })
    expect(screen.getByText('Alexa Fluor 488')).toBeInTheDocument()
    expect(screen.queryByText('Select...')).not.toBeInTheDocument()
  })

  it('opens dropdown on trigger click', () => {
    renderPicker()
    const trigger = screen.getByRole('button')
    fireEvent.click(trigger)
    expect(screen.getByPlaceholderText('Search fluorophores...')).toBeInTheDocument()
  })

  it('filters fluorophores by search text', () => {
    renderPicker()
    fireEvent.click(screen.getByRole('button'))

    const input = screen.getByPlaceholderText('Search fluorophores...')
    fireEvent.change(input, { target: { value: '488' } })

    expect(screen.getByText('Alexa Fluor 488')).toBeInTheDocument()
    // DAPI should not appear
    expect(screen.queryByText('DAPI')).not.toBeInTheDocument()
  })

  it('calls onSelect when a fluorophore is clicked', () => {
    const onSelect = vi.fn()
    renderPicker({ onSelect })
    fireEvent.click(screen.getByRole('button'))

    // Click Alexa Fluor 488 in the dropdown list
    const items = screen.getAllByRole('button')
    const af488Button = items.find((b) => b.textContent?.includes('Alexa Fluor 488'))
    expect(af488Button).toBeDefined()
    fireEvent.mouseDown(af488Button!)

    expect(onSelect).toHaveBeenCalledWith('af488')
  })

  it('calls onClear when clear button is clicked', () => {
    const onClear = vi.fn()
    renderPicker({ currentFluorophoreId: 'af488', onClear })
    fireEvent.click(screen.getByRole('button'))

    const clearButton = screen.getByText('Clear selection')
    fireEvent.mouseDown(clearButton)

    expect(onClear).toHaveBeenCalled()
  })

  it('shows "(in use)" for assigned fluorophores (excluding current)', () => {
    renderPicker({
      currentFluorophoreId: 'dapi',
      assignedFluorophoreIds: new Set(['af488', 'dapi']),
    })
    fireEvent.click(screen.getByRole('button'))

    // af488 is assigned but not current → should show "(in use)"
    expect(screen.getByText('(in use)')).toBeInTheDocument()
  })

  it('does not show "(in use)" for the current fluorophore', () => {
    renderPicker({
      currentFluorophoreId: 'af488',
      assignedFluorophoreIds: new Set(['af488']),
    })
    fireEvent.click(screen.getByRole('button'))

    // af488 is current — should not be marked in use
    expect(screen.queryByText('(in use)')).not.toBeInTheDocument()
  })

  it('closes dropdown on Escape key', () => {
    renderPicker()
    fireEvent.click(screen.getByRole('button'))

    const input = screen.getByPlaceholderText('Search fluorophores...')
    expect(input).toBeInTheDocument()

    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByPlaceholderText('Search fluorophores...')).not.toBeInTheDocument()
  })
})
