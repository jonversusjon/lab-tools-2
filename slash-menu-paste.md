# slashMenu source paste — 2026-06-01

## find results for slashMenu
```
frontend/src/blocks-tiptap/slashMenu
```

## listing
```
total 32
drwxr-xr-x  3 jramirez2 jramirez2 4096 May 13 18:41 .
drwxr-xr-x 10 jramirez2 jramirez2 4096 May 14 03:05 ..
-rw-r--r--  1 jramirez2 jramirez2 2050 May 13 18:41 SlashMenuList.tsx
drwxr-xr-x  2 jramirez2 jramirez2 4096 May  4 08:20 __tests__
-rw-r--r--  1 jramirez2 jramirez2 3392 May 13 18:41 index.ts
-rw-r--r--  1 jramirez2 jramirez2 4553 May  4 08:20 items.ts
-rw-r--r--  1 jramirez2 jramirez2 1984 May  4 08:20 positioning.ts
```

## frontend/src/blocks-tiptap/slashMenu/SlashMenuList.tsx
```tsx
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import type { SlashMenuItem } from './items'

export interface SlashMenuListProps {
  items: SlashMenuItem[]
  command: (item: SlashMenuItem) => void
}

export interface SlashMenuListRef {
  onKeyDown: (event: KeyboardEvent) => boolean
}

const SlashMenuList = forwardRef<SlashMenuListRef, SlashMenuListProps>(
  ({ items, command }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0)

    useEffect(() => setSelectedIndex(0), [items])

    useImperativeHandle(ref, () => ({
      onKeyDown: (event: KeyboardEvent) => {
        if (event.key === 'ArrowUp') {
          setSelectedIndex((i) => (i + items.length - 1) % items.length)
          return true
        }
        if (event.key === 'ArrowDown') {
          setSelectedIndex((i) => (i + 1) % items.length)
          return true
        }
        if (event.key === 'Enter') {
          if (items[selectedIndex]) command(items[selectedIndex])
          return true
        }
        return false
      },
    }))

    if (items.length === 0) {
      return (
        <div className="min-w-[12rem] rounded border border-border bg-elevated px-3 py-3 text-sm text-foreground-subtle shadow-lg">
          No matching blocks
        </div>
      )
    }

    return (
      <div className="max-h-96 min-w-[12rem] overflow-y-auto rounded border border-border bg-elevated shadow-lg">
        {items.map((item, index) => (
          <button
            key={item.title}
            type="button"
            onClick={() => command(item)}
            onMouseEnter={() => setSelectedIndex(index)}
            className={
              'w-full px-3 py-1.5 text-left text-sm ' +
              (index === selectedIndex
                ? 'bg-blue-50 dark:bg-blue-900/30'
                : 'hover:bg-gray-50 dark:hover:bg-gray-700')
            }
          >
            {item.title}
          </button>
        ))}
      </div>
    )
  },
)

SlashMenuList.displayName = 'SlashMenuList'
export default SlashMenuList
```

## frontend/src/blocks-tiptap/slashMenu/index.ts
```tsx
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
```

## frontend/src/blocks-tiptap/slashMenu/items.ts
```tsx
import type { Editor, Range } from '@tiptap/core'

export interface SlashMenuItem {
  title: string
  keywords: string[]
  command: (editor: Editor, range: Range) => void
}

function makeColumnLayout(n: number) {
  const widthPct = 100 / n
  return {
    type: 'column_list',
    attrs: { column_count: n },
    content: Array.from({ length: n }, () => ({
      type: 'column',
      attrs: { width_pct: widthPct },
      content: [{ type: 'paragraph' }],
    })),
  }
}

export const SLASH_MENU_ITEMS: SlashMenuItem[] = [
  {
    title: 'Heading 1',
    keywords: ['h1', 'header', 'title'],
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 1 }).run()
    },
  },
  {
    title: 'Heading 2',
    keywords: ['h2', 'header', 'subtitle'],
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 2 }).run()
    },
  },
  {
    title: 'Heading 3',
    keywords: ['h3', 'header', 'section'],
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 3 }).run()
    },
  },
  {
    title: 'Bulleted list',
    keywords: ['bullet', 'list', 'ul'],
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).toggleBulletList().run()
    },
  },
  {
    title: 'Numbered list',
    keywords: ['numbered', 'list', 'ol'],
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).toggleOrderedList().run()
    },
  },
  {
    title: 'Divider',
    keywords: ['divider', 'hr', 'line'],
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).setHorizontalRule().run()
    },
  },
  {
    title: 'Callout',
    keywords: ['callout', 'note', 'info'],
    command: (editor, range) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent({ type: 'callout', attrs: { icon: '💡', color: 'gray', text: '' } })
        .run()
    },
  },
  {
    title: 'Table',
    keywords: ['table', 'grid'],
    command: (editor, range) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
        .run()
    },
  },
  {
    title: '2-column layout',
    keywords: ['columns', 'layout', '2col'],
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).insertContent(makeColumnLayout(2)).run()
    },
  },
  {
    title: '3-column layout',
    keywords: ['columns', 'layout', '3col'],
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).insertContent(makeColumnLayout(3)).run()
    },
  },
  {
    title: '4-column layout',
    keywords: ['columns', 'layout', '4col'],
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).insertContent(makeColumnLayout(4)).run()
    },
  },
  {
    title: 'Flow panel',
    keywords: ['flow', 'panel', 'cytometry'],
    command: (editor, range) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent({
          type: 'flow_panel',
          attrs: {
            source_panel_id: null,
            name: '',
            instrument: null,
            targets: [],
            assignments: [],
            volume_params: {
              num_samples: 1,
              volume_per_sample_ul: 100,
              pipet_error_factor: 1.1,
              dilution_source: 'flow',
            },
          },
        })
        .run()
    },
  },
  {
    title: 'IF panel',
    keywords: ['if', 'panel', 'immunofluorescence'],
    command: (editor, range) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent({
          type: 'if_panel',
          attrs: {
            source_panel_id: null,
            name: '',
            panel_type: 'IF',
            microscope: null,
            view_mode: 'simple',
            targets: [],
            assignments: [],
            volume_params: {
              num_samples: 1,
              volume_per_sample_ul: 200,
              pipet_error_factor: 1.1,
              dilution_source: 'icc_if',
            },
          },
        })
        .run()
    },
  },
]

export function filterItems(query: string): SlashMenuItem[] {
  if (!query) return SLASH_MENU_ITEMS
  const q = query.toLowerCase()
  return SLASH_MENU_ITEMS.filter((item) => {
    const haystack = [item.title, ...item.keywords].join(' ').toLowerCase()
    return haystack.includes(q)
  })
}
```

## frontend/src/blocks-tiptap/slashMenu/positioning.ts
```tsx
/**
 * Position a popup element near a reference rect, handling viewport
 * overflow with vertical flip and horizontal shift. No external deps.
 *
 * Returns { left, top } in document coordinates (including window.scrollX/Y),
 * suitable for absolute positioning on document.body.
 */

export interface PositionOptions {
  refRect: DOMRect
  popup: HTMLElement
  offset?: number          // default 4 — px between reference and popup
  viewportPadding?: number // default 8 — px between popup and viewport edge
}

export interface PositionResult {
  left: number
  top: number
  placement: 'below' | 'above'
}

export function positionPopup({
  refRect,
  popup,
  offset = 4,
  viewportPadding = 8,
}: PositionOptions): PositionResult {
  const popupRect = popup.getBoundingClientRect()
  const popupWidth = popupRect.width
  const popupHeight = popupRect.height

  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight

  // Vertical: prefer below, flip above if it would overflow
  const spaceBelow = viewportHeight - refRect.bottom
  const spaceAbove = refRect.top
  const wantsBelow = spaceBelow >= popupHeight + offset + viewportPadding
  const wantsAbove = spaceAbove >= popupHeight + offset + viewportPadding

  let topInViewport: number
  let placement: 'below' | 'above'
  if (wantsBelow || !wantsAbove) {
    topInViewport = refRect.bottom + offset
    placement = 'below'
  } else {
    topInViewport = refRect.top - popupHeight - offset
    placement = 'above'
  }

  // Horizontal: align left edge with reference, shift left if overflow right
  let leftInViewport = refRect.left
  const rightOverflow = (leftInViewport + popupWidth) - (viewportWidth - viewportPadding)
  if (rightOverflow > 0) {
    leftInViewport -= rightOverflow
  }
  if (leftInViewport < viewportPadding) {
    leftInViewport = viewportPadding
  }

  return {
    left: leftInViewport + window.scrollX,
    top: topInViewport + window.scrollY,
    placement,
  }
}
```

## frontend/src/components/experiments/PanelTemplatePicker.tsx
```tsx
import { useState } from 'react'
import Modal from '@/components/layout/Modal'
import { usePanels } from '@/hooks/usePanels'
import { useIFPanels } from '@/hooks/useIFPanels'
import { useInstruments } from '@/hooks/useInstruments'
import { useMicroscopes } from '@/hooks/useMicroscopes'
import type { Instrument, Microscope } from '@/types'

interface PanelTemplatePickerProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (panelId: string, panelType: 'flow' | 'if') => void
  filterType?: 'flow' | 'if'
}

function buildNameMap(items: { id: string; name: string }[]): Map<string, string> {
  const m = new Map<string, string>()
  for (const item of items) {
    m.set(item.id, item.name)
  }
  return m
}

export default function PanelTemplatePicker({
  isOpen,
  onClose,
  onSelect,
  filterType,
}: PanelTemplatePickerProps) {
  const [search, setSearch] = useState('')

  const { data: flowData } = usePanels(0, 500)
  const { data: ifData } = useIFPanels(0, 500)
  const { data: instrumentData } = useInstruments(0, 500)
  const { data: microscopeData } = useMicroscopes(0, 500)

  const instrumentNames = buildNameMap(
    (instrumentData?.items ?? []) as Instrument[]
  )
  const microscopeNames = buildNameMap(
    (microscopeData?.items ?? []) as Microscope[]
  )

  const q = search.toLowerCase()

  const flowTemplates = (flowData?.items ?? []).filter(
    (p) => !q || p.name.toLowerCase().includes(q)
  )
  const ifTemplates = (ifData?.items ?? []).filter(
    (p) => !q || p.name.toLowerCase().includes(q)
  )

  const showFlow = !filterType || filterType === 'flow'
  const showIF = !filterType || filterType === 'if'

  const handleSelect = (panelId: string, panelType: 'flow' | 'if') => {
    onSelect(panelId, panelType)
    onClose()
    setSearch('')
  }

  const isEmpty =
    (showFlow ? flowTemplates.length === 0 : true) &&
    (showIF ? ifTemplates.length === 0 : true) &&
    !search

  return (
    <Modal isOpen={isOpen} onClose={() => { onClose(); setSearch('') }} title="Add Panel" wide>
      <div className="space-y-4">
        <input
          type="text"
          placeholder="Search templates..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-md border border-border-strong bg-elevated text-foreground px-3 py-2 text-sm placeholder-foreground-subtle focus:outline-none focus:ring-2 focus:ring-accent"
          autoFocus
        />

        {isEmpty && !search && (
          <p className="text-sm text-foreground-subtle text-center py-4">
            No panel templates found. Create one in Panel Templates first.
          </p>
        )}

        {showFlow && (
          <div>
            <div className="text-xs font-semibold uppercase text-foreground-subtle mb-2">
              Flow Panel Templates
            </div>

            {/* Blank flow panel */}
            <button
              onClick={() => handleSelect('blank', 'flow')}
              className="w-full px-3 py-2.5 flex items-center justify-between rounded hover:bg-hover cursor-pointer text-left"
            >
              <div className="flex items-center gap-2">
                <span className="text-base">📋</span>
                <span className="text-sm text-foreground-muted">Blank Flow Panel</span>
              </div>
              <span className="text-xs text-foreground-subtle italic">empty</span>
            </button>

            {flowTemplates.length === 0 && search ? (
              <p className="text-sm text-foreground-subtle px-3 py-2">
                No flow panel templates found
              </p>
            ) : (
              flowTemplates.map((p) => {
                const instrName = p.instrument_id
                  ? (instrumentNames.get(p.instrument_id) ?? 'Unknown instrument')
                  : 'No instrument'
                return (
                  <button
                    key={p.id}
                    onClick={() => handleSelect(p.id, 'flow')}
                    className="w-full px-3 py-2.5 flex items-center justify-between rounded hover:bg-hover cursor-pointer text-left"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-foreground">{p.name}</span>
                      <span className="inline-flex items-center rounded-full bg-surface px-2 py-0.5 text-xs font-medium text-foreground-muted">
                        {p.target_count} target{p.target_count !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <span className="text-xs text-foreground-subtle shrink-0">
                      {instrName}
                    </span>
                  </button>
                )
              })
            )}
          </div>
        )}

        {showIF && (
          <div>
            <div className="text-xs font-semibold uppercase text-foreground-subtle mb-2">
              IF/IHC Panel Templates
            </div>

            {/* Blank IF panel */}
            <button
              onClick={() => handleSelect('blank', 'if')}
              className="w-full px-3 py-2.5 flex items-center justify-between rounded hover:bg-hover cursor-pointer text-left"
            >
              <div className="flex items-center gap-2">
                <span className="text-base">🔬</span>
                <span className="text-sm text-foreground-muted">Blank IF Panel</span>
              </div>
              <span className="text-xs text-foreground-subtle italic">empty</span>
            </button>

            {ifTemplates.length === 0 && search ? (
              <p className="text-sm text-foreground-subtle px-3 py-2">
                No IF/IHC panel templates found
              </p>
            ) : (
              ifTemplates.map((p) => {
                const scopeName = p.microscope_id
                  ? (microscopeNames.get(p.microscope_id) ?? 'Unknown microscope')
                  : 'No microscope'
                return (
                  <button
                    key={p.id}
                    onClick={() => handleSelect(p.id, 'if')}
                    className="w-full px-3 py-2.5 flex items-center justify-between rounded hover:bg-hover cursor-pointer text-left"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-foreground">{p.name}</span>
                      <span className="inline-flex items-center rounded-full bg-surface px-2 py-0.5 text-xs font-medium text-foreground-muted">
                        {p.target_count} target{p.target_count !== 1 ? 's' : ''}
                      </span>
                      <span
                        className={
                          'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ' +
                          (p.panel_type === 'IHC'
                            ? 'bg-warning-soft text-warning-soft-foreground'
                            : 'bg-accent-soft text-accent-soft-foreground')
                        }
                      >
                        {p.panel_type}
                      </span>
                    </div>
                    <span className="text-xs text-foreground-subtle shrink-0">
                      {scopeName}
                    </span>
                  </button>
                )
              })
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
```
