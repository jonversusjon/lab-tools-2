import { Extension } from '@tiptap/core'
import type { Editor, Range } from '@tiptap/core'
import type { QueryClient } from '@tanstack/react-query'
import Suggestion from '@tiptap/suggestion'
import type { SuggestionProps, SuggestionKeyDownProps } from '@tiptap/suggestion'
import { ReactRenderer } from '@tiptap/react'
import SlashMenuList from './SlashMenuList'
import { filterItems, type SlashMenuItem } from './items'
import type { SlashMenuListProps, SlashMenuListRef } from './SlashMenuList'
import { positionPopup } from './positioning'
import { getProviderForItem } from './templateProviders'

export interface SlashMenuOptions {
  /**
   * Injected per-editor so the suggestion plugin can prefetch template lists
   * and (via the popup) build template node JSON. Null when no client is
   * provided — prefetch and template insertion are simply skipped.
   */
  queryClient: QueryClient | null
}

/**
 * Fire-and-forget prefetch of every slash item that has a registered template
 * provider. Runs once when the slash menu opens.
 */
function prefetchProviders(items: SlashMenuItem[], queryClient: QueryClient | null) {
  if (!queryClient) return
  for (const item of items) {
    const provider = getProviderForItem(item.title)
    if (provider) {
      void provider.prefetchList(queryClient)
    }
  }
}

function createRenderer(queryClient: QueryClient | null) {
  return () => {
    let component: ReactRenderer<SlashMenuListRef, SlashMenuListProps> | null = null
    let popup: HTMLElement | null = null

    return {
      onStart: (props: SuggestionProps<SlashMenuItem, SlashMenuItem>) => {
        prefetchProviders(props.items, queryClient)

        component = new ReactRenderer<SlashMenuListRef, SlashMenuListProps>(SlashMenuList, {
          props: props as unknown as Record<string, unknown>,
          editor: props.editor,
        })

        if (!props.clientRect) return
        const rect = props.clientRect()
        if (!rect) return

        popup = document.createElement('div')
        popup.style.position = 'absolute'
        popup.style.zIndex = '50'
        popup.style.visibility = 'hidden'
        popup.appendChild(component.element)
        document.body.appendChild(popup)

        // Append first so popup has dimensions, then position
        const { left, top } = positionPopup({ refRect: rect, popup })
        popup.style.left = String(left) + 'px'
        popup.style.top = String(top) + 'px'
        popup.style.visibility = ''
      },

      onUpdate: (props: SuggestionProps<SlashMenuItem, SlashMenuItem>) => {
        component?.updateProps(props as unknown as Record<string, unknown>)

        if (!props.clientRect || !popup) return
        const rect = props.clientRect()
        if (!rect) return
        const { left, top } = positionPopup({ refRect: rect, popup })
        popup.style.left = String(left) + 'px'
        popup.style.top = String(top) + 'px'
      },

      onKeyDown: (props: SuggestionKeyDownProps) => {
        if (props.event.key === 'Escape') {
          popup?.remove()
          popup = null
          component?.destroy()
          component = null
          return true
        }
        return component?.ref?.onKeyDown(props.event) ?? false
      },

      onExit: () => {
        popup?.remove()
        popup = null
        component?.destroy()
        component = null
      },
    }
  }
}

export const SlashMenu = Extension.create<SlashMenuOptions>({
  name: 'slashMenu',

  addOptions() {
    return {
      queryClient: null,
    }
  },

  addProseMirrorPlugins() {
    return [
      Suggestion<SlashMenuItem, SlashMenuItem>({
        editor: this.editor,
        char: '/',
        startOfLine: false,
        items: ({ query }: { query: string }): SlashMenuItem[] => filterItems(query),
        command: ({
          editor,
          range,
          props,
        }: {
          editor: Editor
          range: Range
          props: SlashMenuItem
        }) => {
          props.command(editor, range)
        },
        render: createRenderer(this.options.queryClient),
      }),
    ]
  },
})
