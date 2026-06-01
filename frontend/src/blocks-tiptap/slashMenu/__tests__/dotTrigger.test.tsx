import { createRef } from 'react'
import { act, render, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import type { Editor, Range } from '@tiptap/core'
import SlashPopupContainer from '../SlashPopupContainer'
import type { SlashPopupContainerRef } from '../SlashPopupContainer'
import type { SlashMenuItem } from '../items'

afterEach(cleanup)

function item(title: string): SlashMenuItem {
  return { title, keywords: [], command: vi.fn() }
}

const RANGE: Range = { from: 0, to: 3 }

function renderContainer(items: SlashMenuItem[]) {
  const ref = createRef<SlashPopupContainerRef>()
  const expandQueryToTitle = vi.fn()
  const onActivateOmnibox = vi.fn()
  const onClose = vi.fn()
  const queryClient = new QueryClient()

  render(
    <SlashPopupContainer
      ref={ref}
      items={items}
      command={vi.fn()}
      editor={{} as Editor}
      range={RANGE}
      queryClient={queryClient}
      expandQueryToTitle={expandQueryToTitle}
      onActivateOmnibox={onActivateOmnibox}
      onClose={onClose}
    />,
  )
  return { ref, expandQueryToTitle, onActivateOmnibox, onClose }
}

function pressDot(ref: ReturnType<typeof createRef<SlashPopupContainerRef>>) {
  let consumed = false
  act(() => {
    consumed = ref.current!.onKeyDown(new KeyboardEvent('keydown', { key: '.' }))
  })
  return consumed
}

describe('slash menu dot trigger', () => {
  it('swaps to omnibox with the flow provider when Flow panel is highlighted', () => {
    const { ref, expandQueryToTitle, onActivateOmnibox } = renderContainer([item('Flow panel')])
    const consumed = pressDot(ref)

    expect(consumed).toBe(true)
    expect(expandQueryToTitle).toHaveBeenCalledWith('Flow panel')
    expect(onActivateOmnibox).toHaveBeenCalledTimes(1)
    expect(document.body.textContent).toContain('Flow panel · Templates')
  })

  it('swaps to omnibox with the IF provider when IF panel is highlighted', () => {
    const { ref, expandQueryToTitle, onActivateOmnibox } = renderContainer([item('IF panel')])
    const consumed = pressDot(ref)

    expect(consumed).toBe(true)
    expect(expandQueryToTitle).toHaveBeenCalledWith('IF panel')
    expect(onActivateOmnibox).toHaveBeenCalledTimes(1)
    expect(document.body.textContent).toContain('IF panel · Templates')
  })

  it('does nothing for a non-templated item but still swallows the dot', () => {
    const { ref, expandQueryToTitle, onActivateOmnibox } = renderContainer([item('Heading 1')])
    const consumed = pressDot(ref)

    expect(consumed).toBe(true) // swallowed — dot never reaches the editor
    expect(expandQueryToTitle).not.toHaveBeenCalled()
    expect(onActivateOmnibox).not.toHaveBeenCalled()
    expect(document.body.textContent).not.toContain('Templates')
  })
})
