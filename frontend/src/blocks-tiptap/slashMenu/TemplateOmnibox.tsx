import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { QueryClient } from '@tanstack/react-query'
import type { Editor, Range } from '@tiptap/core'
import type { TemplateProvider } from './templateProviders'

export interface TemplateOmniboxProps {
  provider: TemplateProvider
  editor: Editor
  range: Range
  queryClient: QueryClient
  onClose: () => void
}

export interface TemplateOmniboxRef {
  onKeyDown: (event: KeyboardEvent) => boolean
}

const TemplateOmnibox = forwardRef<TemplateOmniboxRef, TemplateOmniboxProps>(
  ({ provider, editor, range, queryClient, onClose }, ref) => {
    const allItems = provider.readList(queryClient)
    const loading = provider.isListLoading(queryClient)
    const [query, setQuery] = useState('')
    const [selectedIndex, setSelectedIndex] = useState(0)
    const [inserting, setInserting] = useState(false)
    const inputRef = useRef<HTMLInputElement>(null)

    const items = useMemo(() => {
      const q = query.trim().toLowerCase()
      if (!q) return allItems
      return allItems.filter((it) => it.name.toLowerCase().includes(q))
    }, [allItems, query])

    // Steal focus from the editor so this omnibox owns the keyboard.
    useEffect(() => {
      inputRef.current?.focus()
    }, [])

    // Keep the highlight in range as the filtered list shrinks/grows.
    useEffect(() => {
      setSelectedIndex(0)
    }, [query])

    // The text expanded into the doc on dot-trigger ("/<title>") spans from the
    // original slash position to the live cursor. Removing it restores the line.
    const expandedRange = () => ({
      from: range.from,
      to: editor.state.selection.to,
    })

    const closeAndRestore = () => {
      editor.chain().focus().deleteRange(expandedRange()).run()
      onClose()
    }

    const insertTemplate = async (id: string) => {
      setInserting(true)
      try {
        const node = await provider.buildNodeJSON(id, queryClient)
        editor
          .chain()
          .focus()
          .deleteRange(expandedRange())
          .insertContent(node)
          .run()
        provider.onInserted?.(editor, range)
      } finally {
        setInserting(false)
        onClose()
      }
    }

    const handleKey = (event: KeyboardEvent): boolean => {
      if (event.key === 'Escape') {
        closeAndRestore()
        return true
      }
      if (event.key === 'ArrowDown') {
        if (items.length > 0) setSelectedIndex((i) => (i + 1) % items.length)
        return true
      }
      if (event.key === 'ArrowUp') {
        if (items.length > 0) {
          setSelectedIndex((i) => (i + items.length - 1) % items.length)
        }
        return true
      }
      if (event.key === 'Enter') {
        const item = items[selectedIndex]
        if (item && !inserting) void insertTemplate(item.id)
        return true
      }
      // Other keys (typing into the search box) are not consumed.
      return false
    }

    useImperativeHandle(ref, () => ({ onKeyDown: handleKey }))

    return (
      <div className="max-h-96 w-72 overflow-hidden rounded border border-border bg-elevated shadow-lg">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-xs font-semibold uppercase text-foreground-subtle">
            {provider.slashItemTitle} · Templates
          </span>
          <span className="text-xs text-foreground-subtle">
            {inserting ? 'Inserting…' : 'esc to close'}
          </span>
        </div>

        <div className="px-2 pt-2">
          <input
            ref={inputRef}
            type="text"
            value={query}
            placeholder="Search templates..."
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (handleKey(e.nativeEvent)) e.preventDefault()
            }}
            className="w-full rounded-md border border-border-strong bg-elevated px-2 py-1.5 text-sm text-foreground placeholder-foreground-subtle focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>

        <div className="mt-1 max-h-72 overflow-y-auto py-1">
          {loading && allItems.length === 0 ? (
            <div className="space-y-1 px-3 py-2">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-5 animate-pulse rounded bg-gray-100 dark:bg-gray-700"
                />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="px-3 py-3 text-sm text-foreground-subtle">
              {query ? 'No matching templates' : 'No templates yet'}
            </div>
          ) : (
            items.map((item, index) => (
              <button
                key={item.id}
                type="button"
                disabled={inserting}
                onClick={() => void insertTemplate(item.id)}
                onMouseEnter={() => setSelectedIndex(index)}
                className={
                  'flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm disabled:opacity-60 ' +
                  (index === selectedIndex
                    ? 'bg-blue-50 dark:bg-blue-900/30'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-700')
                }
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-foreground">{item.name}</span>
                  {item.countLabel && (
                    <span className="inline-flex shrink-0 items-center rounded-full bg-surface px-2 py-0.5 text-xs font-medium text-foreground-muted">
                      {item.countLabel}
                    </span>
                  )}
                </span>
                {item.subtitle && (
                  <span className="shrink-0 text-xs text-foreground-subtle">
                    {item.subtitle}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    )
  },
)

TemplateOmnibox.displayName = 'TemplateOmnibox'
export default TemplateOmnibox
