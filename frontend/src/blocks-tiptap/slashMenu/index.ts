import { Extension } from '@tiptap/core'
import type { Editor, Range } from '@tiptap/core'
import Suggestion from '@tiptap/suggestion'
import type { SuggestionProps, SuggestionKeyDownProps } from '@tiptap/suggestion'
import { ReactRenderer } from '@tiptap/react'
import SlashMenuList from './SlashMenuList'
import { filterItems, type SlashMenuItem } from './items'
import type { SlashMenuListProps, SlashMenuListRef } from './SlashMenuList'
import { positionPopup } from './positioning'

export const SlashMenu = Extension.create({
  name: 'slashMenu',

  addOptions() {
    return {
      suggestion: {
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
        render: () => {
          let component: ReactRenderer<SlashMenuListRef, SlashMenuListProps> | null = null
          let popup: HTMLElement | null = null

          return {
            onStart: (props: SuggestionProps<SlashMenuItem, SlashMenuItem>) => {
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
        },
      },
    }
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
      }),
    ]
  },
})
