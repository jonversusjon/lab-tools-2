import {
  forwardRef,
  useEffect,
  useImperativeHandle,
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
    const items = provider.readList(queryClient)
    const [selectedIndex, setSelectedIndex] = useState(0)
    const [inserting, setInserting] = useState(false)
    const inputRef = useRef<HTMLInputElement>(null)

    // Steal focus from the editor so this omnibox owns the keyboard.
    useEffect(() => {
      inputRef.current?.focus()
    }, [])

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
      if (items.length === 0) return event.key === 'ArrowUp' || event.key === 'ArrowDown'
      if (event.key === 'ArrowDown') {
        setSelectedIndex((i) => (i + 1) % items.length)
        return true
      }
      if (event.key === 'ArrowUp') {
        setSelectedIndex((i) => (i + items.length - 1) % items.length)
        return true
      }
      if (event.key === 'Enter') {
        const item = items[selectedIndex]
        if (item) void insertTemplate(item.id)
        return true
      }
      return false
    }

    useImperativeHandle(ref, () => ({ onKeyDown: handleKey }))

    return (
      <div className="max-h-96 w-72 overflow-hidden rounded border border-border bg-elevated shadow-lg">
        <div className="border-b border-border px-3 py-2 text-xs font-semibold uppercase text-foreground-subtle">
          {provider.slashItemTitle} · Templates
        </div>
        <input
          ref={inputRef}
          type="text"
          readOnly
          className="sr-only"
          onKeyDown={(e) => {
            if (handleKey(e.nativeEvent)) e.preventDefault()
          }}
        />
        <div className="max-h-80 overflow-y-auto">
          {items.length === 0 ? (
            <div className="px-3 py-3 text-sm text-foreground-subtle">
              No templates
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
                  'w-full px-3 py-1.5 text-left text-sm ' +
                  (index === selectedIndex
                    ? 'bg-blue-50 dark:bg-blue-900/30'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-700')
                }
              >
                {item.name}
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
