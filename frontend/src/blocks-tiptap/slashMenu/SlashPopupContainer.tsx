import { forwardRef, useImperativeHandle, useRef, useState } from 'react'
import type { QueryClient } from '@tanstack/react-query'
import type { Editor, Range } from '@tiptap/core'
import SlashMenuList from './SlashMenuList'
import type { SlashMenuListRef } from './SlashMenuList'
import TemplateOmnibox from './TemplateOmnibox'
import type { TemplateOmniboxRef } from './TemplateOmnibox'
import type { SlashMenuItem } from './items'
import { getProviderForItem } from './templateProviders'
import type { TemplateProvider } from './templateProviders'

export interface SlashPopupContainerProps {
  items: SlashMenuItem[]
  command: (item: SlashMenuItem) => void
  editor: Editor
  range: Range
  queryClient: QueryClient | null
  /** Expand the slash query text in the editor to `/<title>` in place. */
  expandQueryToTitle: (title: string) => void
  /** Tell the renderer to stop tearing the popup down (we own it now). */
  onActivateOmnibox: () => void
  /** Renderer-owned teardown: destroy the popup and the React renderer. */
  onClose: () => void
}

export interface SlashPopupContainerRef {
  onKeyDown: (event: KeyboardEvent) => boolean
}

/**
 * Top-level component rendered into the slash popup. Owns the `list | omnibox`
 * mode and routes keys to whichever inner component is active, swapping the
 * inner component without recreating the popup div.
 */
const SlashPopupContainer = forwardRef<SlashPopupContainerRef, SlashPopupContainerProps>(
  (
    {
      items,
      command,
      editor,
      range,
      queryClient,
      expandQueryToTitle,
      onActivateOmnibox,
      onClose,
    },
    ref,
  ) => {
    const [mode, setMode] = useState<'list' | 'omnibox'>('list')
    const [provider, setProvider] = useState<TemplateProvider | null>(null)
    const listRef = useRef<SlashMenuListRef>(null)
    const omniboxRef = useRef<TemplateOmniboxRef>(null)

    const handleDotTrigger = (item: SlashMenuItem) => {
      if (!queryClient) return
      const resolved = getProviderForItem(item.title)
      if (!resolved) return
      // Guard the renderer's teardown BEFORE mutating the doc: expanding the
      // query text deactivates the Suggestion plugin (titles contain spaces),
      // which fires onExit — we must keep the popup alive across that.
      onActivateOmnibox()
      expandQueryToTitle(item.title)
      setProvider(resolved)
      setMode('omnibox')
    }

    useImperativeHandle(
      ref,
      () => ({
        onKeyDown: (event: KeyboardEvent) => {
          if (mode === 'omnibox') {
            return omniboxRef.current?.onKeyDown(event) ?? false
          }
          return listRef.current?.onKeyDown(event) ?? false
        },
      }),
      [mode],
    )

    if (mode === 'omnibox' && provider && queryClient) {
      return (
        <TemplateOmnibox
          ref={omniboxRef}
          provider={provider}
          editor={editor}
          range={range}
          queryClient={queryClient}
          onClose={onClose}
        />
      )
    }

    return (
      <SlashMenuList
        ref={listRef}
        items={items}
        command={command}
        onDotTrigger={handleDotTrigger}
      />
    )
  },
)

SlashPopupContainer.displayName = 'SlashPopupContainer'
export default SlashPopupContainer
