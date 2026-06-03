import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import ExperimentRail from '@/components/experiments/ExperimentRail'

// Mutable holders (vi.mock factories are hoisted; reference via vi.hoisted)
const h = vi.hoisted(() => ({
  active: null as null | { rowId: string; blockType: string; attrs: Record<string, unknown> },
  isOpen: false,
  setOpen: vi.fn(),
}))

vi.mock('@/blocks-tiptap/EditorContext', () => ({
  useEditorInstance: () => null,
}))
vi.mock('@/hooks/useActivePanelBlock', () => ({
  useActivePanelBlock: () => h.active,
}))
vi.mock('@/hooks/useSpectralRailOpen', () => ({
  useSpectralRailOpen: () => ({ isOpen: h.isOpen, setOpen: h.setOpen, isLoading: false }),
}))

// Data hooks used only by the expanded content
vi.mock('@/hooks/useInstruments', () => ({
  useInstruments: () => ({
    data: { items: [{ id: 'inst', name: 'I', is_favorite: false, location: null, lasers: [] }] },
  }),
}))
vi.mock('@/hooks/useAntibodies', () => ({ useAntibodies: () => ({ data: { items: [] } }) }))
vi.mock('@/hooks/useSecondaries', () => ({ useSecondaries: () => ({ data: { items: [] } }) }))
vi.mock('@/hooks/useFluorophores', () => ({
  useFluorophores: () => ({ data: { items: [] } }),
  useBatchSpectra: () => ({ data: {} }),
}))

// Stub the heavy chart components — rail behaviour is what's under test
vi.mock('@/components/panels/PanelSpectraByLaser', () => ({
  default: () => <div data-testid="spectra-chart" />,
}))
vi.mock('@/components/panels/SpilloverHeatmap', () => ({
  default: () => <div data-testid="spillover" />,
}))

function flowPanel(name = 'My Panel') {
  return {
    rowId: 'row-1',
    blockType: 'flow_panel',
    attrs: { name, instrument: { id: 'inst' }, targets: [], assignments: [] },
  }
}

// The rail portals into the Shell's #right-rail-slot; provide it in isolation.
let slot: HTMLElement
beforeEach(() => {
  h.active = null
  h.isOpen = false
  h.setOpen = vi.fn()
  slot = document.createElement('div')
  slot.id = 'right-rail-slot'
  document.body.appendChild(slot)
})

afterEach(() => {
  slot.remove()
})

describe('ExperimentRail', () => {
  it('shows a spectral icon (collapsed) when a flow panel is active', () => {
    h.active = flowPanel()
    h.isOpen = false
    render(<ExperimentRail />)
    expect(screen.getByLabelText('Show panel spectra and spillover')).toBeInTheDocument()
    expect(screen.queryByTestId('spectra-chart')).not.toBeInTheDocument()
  })

  it('clicking the icon requests the rail to open', () => {
    h.active = flowPanel()
    h.isOpen = false
    render(<ExperimentRail />)
    fireEvent.click(screen.getByLabelText('Show panel spectra and spillover'))
    expect(h.setOpen).toHaveBeenCalledWith(true)
  })

  it('collapsed spine shows an expand toggle and a spillover icon, both opening the rail', () => {
    h.active = flowPanel()
    h.isOpen = false
    render(<ExperimentRail />)

    const expand = screen.getByLabelText('Expand spectra rail')
    const spillover = screen.getByLabelText('Show spillover matrix')
    expect(expand).toBeInTheDocument()
    expect(spillover).toBeInTheDocument()

    fireEvent.click(expand)
    fireEvent.click(spillover)
    expect(h.setOpen).toHaveBeenNthCalledWith(1, true)
    expect(h.setOpen).toHaveBeenNthCalledWith(2, true)
  })

  it('open header exposes a collapse toggle that closes the rail', () => {
    h.active = flowPanel('T Cell Panel')
    h.isOpen = true
    render(<ExperimentRail />)
    fireEvent.click(screen.getByLabelText('Collapse spectra rail'))
    expect(h.setOpen).toHaveBeenCalledWith(false)
  })

  it('renders the active panel spectra + spillover when open', () => {
    h.active = flowPanel('T Cell Panel')
    h.isOpen = true
    render(<ExperimentRail />)
    expect(screen.getByText('T Cell Panel')).toBeInTheDocument()
    expect(screen.getByTestId('spectra-chart')).toBeInTheDocument()
    expect(screen.getByTestId('spillover')).toBeInTheDocument()
  })

  it('auto-hides (no icon, no content) when no panel is active', () => {
    h.active = null
    h.isOpen = true
    render(<ExperimentRail />)
    expect(screen.queryByLabelText('Show panel spectra and spillover')).not.toBeInTheDocument()
    expect(screen.queryByTestId('spectra-chart')).not.toBeInTheDocument()
  })

  it('does not show the spectral icon for an IF panel (deferred)', () => {
    h.active = { rowId: 'row-2', blockType: 'if_panel', attrs: { name: 'IF', instrument: null, targets: [], assignments: [] } }
    h.isOpen = true
    render(<ExperimentRail />)
    expect(screen.queryByLabelText('Show panel spectra and spillover')).not.toBeInTheDocument()
    expect(screen.queryByTestId('spectra-chart')).not.toBeInTheDocument()
  })
})
