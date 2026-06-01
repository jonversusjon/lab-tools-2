import { Extension } from '@tiptap/core'
import type { Editor, Range } from '@tiptap/core'
import type { QueryClient } from '@tanstack/react-query'
import Suggestion from '@tiptap/suggestion'
import type { SuggestionProps, SuggestionKeyDownProps } from '@tiptap/suggestion'
import { ReactRenderer } from '@tiptap/react'
import SlashPopupContainer from './SlashPopupContainer'
import { filterItems, type SlashMenuItem } from './items'
import type {
  SlashPopupContainerProps,
  SlashPopupContainerRef,
} from './SlashPopupContainer'
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
    let component: ReactRenderer<SlashPopupContainerRef, SlashPopupContainerProps> | null =
      null
    let popup: HTMLElement | null = null
    let currentProps: SuggestionProps<SlashMenuItem, SlashMenuItem> | null = null
    // While the omnibox owns the popup, the Suggestion plugin has deactivated
    // (the expanded "/<title>" query no longer matches) and onExit fires — the
    // omnibox, not the suggestion, is now responsible for teardown.
    let omniboxActive = false

    const destroy = () => {
      popup?.remove()
      popup = null
      component?.destroy()
      component = null
      omniboxActive = false
    }

    // Replace the slash query text with "/<title>" in place, leaving the cursor
    // at the end. Reads the latest range/editor from currentProps.
    const expandQueryToTitle = (title: string) => {
      if (!currentProps) return
      const { editor, range } = currentProps
      editor.chain().focus().insertContentAt(range, '/' + title).run()
    }

    const buildProps = (
      props: SuggestionProps<SlashMenuItem, SlashMenuItem>,
    ): Record<string, unknown> => ({
      items: props.items,
      command: props.command,
      editor: props.editor,
      range: props.range,
      queryClient,
      expandQueryToTitle,
      onActivateOmnibox: () => {
        omniboxActive = true
      },
      onClose: destroy,
    })

    return {
      onStart: (props: SuggestionProps<SlashMenuItem, SlashMenuItem>) => {
        currentProps = props
        prefetchProviders(props.items, queryClient)

        component = new ReactRenderer<SlashPopupContainerRef, SlashPopupContainerProps>(
          SlashPopupContainer,
          {
            props: buildProps(props),
            editor: props.editor,
          },
        )

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
        currentProps = props
        component?.updateProps(buildProps(props))

        if (!props.clientRect || !popup) return
        const rect = props.clientRect()
        if (!rect) return
        const { left, top } = positionPopup({ refRect: rect, popup })
        popup.style.left = String(left) + 'px'
        popup.style.top = String(top) + 'px'
      },

      onKeyDown: (props: SuggestionKeyDownProps) => {
        if (props.event.key === 'Escape') {
          destroy()
          return true
        }
        return component?.ref?.onKeyDown(props.event) ?? false
      },

      onExit: () => {
        // Keep the popup alive when the omnibox has taken over.
        if (omniboxActive) return
        destroy()
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
