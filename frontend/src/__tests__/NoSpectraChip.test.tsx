import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { ModalProvider, useModal } from '@/components/layout/ModalContext'
import NoSpectraChip from '@/components/spectra/NoSpectraChip'
import type { ModalRequest } from '@/components/layout/ModalContext'

function renderChip(fluorophoreId = 'fl-1') {
  return render(
    <ModalProvider>
      <NoSpectraChip fluorophoreId={fluorophoreId} />
    </ModalProvider>
  )
}

describe('NoSpectraChip', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders the chip with no tooltip by default', () => {
    renderChip()
    expect(screen.getByTestId('no-spectra-chip')).toBeInTheDocument()
    expect(screen.queryByTestId('no-spectra-tooltip')).not.toBeInTheDocument()
  })

  it('shows tooltip after hover delay', () => {
    renderChip()
    fireEvent.mouseEnter(screen.getByTestId('no-spectra-chip').parentElement!)
    expect(screen.queryByTestId('no-spectra-tooltip')).not.toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(200) })
    expect(screen.getByTestId('no-spectra-tooltip')).toBeInTheDocument()
    expect(screen.getByText(/can.t be calculated/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /upload now/i })).toBeInTheDocument()
  })

  it('keeps tooltip open when cursor moves into it', () => {
    renderChip()
    const wrapper = screen.getByTestId('no-spectra-chip').parentElement!
    fireEvent.mouseEnter(wrapper)
    act(() => { vi.advanceTimersByTime(200) })
    const tooltip = screen.getByTestId('no-spectra-tooltip')
    // Cursor leaves chip wrapper, immediately enters tooltip
    fireEvent.mouseLeave(wrapper)
    fireEvent.mouseEnter(tooltip)
    act(() => { vi.advanceTimersByTime(500) })
    expect(screen.getByTestId('no-spectra-tooltip')).toBeInTheDocument()
  })

  it('hides tooltip after leaving both chip and tooltip', () => {
    renderChip()
    const wrapper = screen.getByTestId('no-spectra-chip').parentElement!
    fireEvent.mouseEnter(wrapper)
    act(() => { vi.advanceTimersByTime(200) })
    expect(screen.getByTestId('no-spectra-tooltip')).toBeInTheDocument()
    fireEvent.mouseLeave(wrapper)
    act(() => { vi.advanceTimersByTime(300) })
    expect(screen.queryByTestId('no-spectra-tooltip')).not.toBeInTheDocument()
  })

  it('Upload now button is the click target (not the chip)', () => {
    const opened: ModalRequest[] = []
    function Recorder() {
      const { request } = useModal()
      if (request) opened.push(request)
      return null
    }
    render(
      <ModalProvider>
        <NoSpectraChip fluorophoreId="fl-42" />
        <Recorder />
      </ModalProvider>
    )
    // Clicking the chip itself does nothing (it has no onClick — only the
    // tooltip's Upload now button dispatches).
    fireEvent.click(screen.getByTestId('no-spectra-chip'))
    expect(opened).toHaveLength(0)
    // Hover, then click Upload now → modal opens with prefill.
    fireEvent.mouseEnter(screen.getByTestId('no-spectra-chip').parentElement!)
    act(() => { vi.advanceTimersByTime(200) })
    fireEvent.click(screen.getByRole('button', { name: /upload now/i }))
    expect(opened.length).toBeGreaterThan(0)
    expect(opened[opened.length - 1]).toEqual({ kind: 'fpbase_fetch', fluorophoreId: 'fl-42' })
  })
})
