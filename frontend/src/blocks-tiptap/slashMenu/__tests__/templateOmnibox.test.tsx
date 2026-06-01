import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { QueryClient } from '@tanstack/react-query'
import type { Editor, Range } from '@tiptap/core'
import TemplateOmnibox from '../TemplateOmnibox'
import type { TemplateListItem, TemplateProvider } from '../templateProviders'

afterEach(cleanup)

const RANGE: Range = { from: 0, to: 4 }
const QC = {} as unknown as QueryClient

function makeEditor() {
  const run = vi.fn()
  const chain = {
    focus: () => chain,
    deleteRange: () => chain,
    insertContent: () => chain,
    run,
  }
  const editor = {
    chain: () => chain,
    state: { selection: { to: 4 } },
  } as unknown as Editor
  return { editor, run }
}

function makeProvider(overrides: Partial<TemplateProvider> = {}): TemplateProvider {
  const items: TemplateListItem[] = [
    { id: 'p1', name: 'T Cell', countLabel: '3 targets', subtitle: 'Aria' },
    { id: 'p2', name: 'B Cell', countLabel: '2 targets', subtitle: 'Aria' },
  ]
  return {
    slashItemTitle: 'Flow panel',
    listQueryKey: ['panels', { skip: 0, limit: 500 }],
    prefetchList: vi.fn().mockResolvedValue(undefined),
    readList: () => items,
    isListLoading: () => false,
    buildNodeJSON: vi.fn().mockResolvedValue({ type: 'flow_panel', attrs: {} }),
    ...overrides,
  }
}

describe('TemplateOmnibox', () => {
  it('renders the cached list from readList', () => {
    const { editor } = makeEditor()
    render(
      <TemplateOmnibox
        provider={makeProvider()}
        editor={editor}
        range={RANGE}
        queryClient={QC}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByText('T Cell')).toBeTruthy()
    expect(screen.getByText('B Cell')).toBeTruthy()
  })

  it('filters the list client-side from the search input', () => {
    const { editor } = makeEditor()
    render(
      <TemplateOmnibox
        provider={makeProvider()}
        editor={editor}
        range={RANGE}
        queryClient={QC}
        onClose={vi.fn()}
      />,
    )
    const input = screen.getByPlaceholderText('Search templates...')
    fireEvent.change(input, { target: { value: 'B' } })
    expect(screen.queryByText('T Cell')).toBeNull()
    expect(screen.getByText('B Cell')).toBeTruthy()
  })

  it('ArrowDown then Enter builds the right template and inserts it', async () => {
    const { editor, run } = makeEditor()
    const provider = makeProvider()
    const onClose = vi.fn()
    render(
      <TemplateOmnibox
        provider={provider}
        editor={editor}
        range={RANGE}
        queryClient={QC}
        onClose={onClose}
      />,
    )
    const input = screen.getByPlaceholderText('Search templates...')
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() =>
      expect(provider.buildNodeJSON).toHaveBeenCalledWith('p2', QC),
    )
    expect(run).toHaveBeenCalled()
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('Escape closes the omnibox', () => {
    const { editor } = makeEditor()
    const onClose = vi.fn()
    render(
      <TemplateOmnibox
        provider={makeProvider()}
        editor={editor}
        range={RANGE}
        queryClient={QC}
        onClose={onClose}
      />,
    )
    const input = screen.getByPlaceholderText('Search templates...')
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('renders a loading skeleton while the list query is in flight', () => {
    const { editor } = makeEditor()
    const provider = makeProvider({ readList: () => [], isListLoading: () => true })
    const { container } = render(
      <TemplateOmnibox
        provider={provider}
        editor={editor}
        range={RANGE}
        queryClient={QC}
        onClose={vi.fn()}
      />,
    )
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
  })
})
