import { NodeViewWrapper } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import { useState } from 'react'

const COLOR_CLASSES: Record<string, string> = {
  gray: 'bg-gray-100 dark:bg-gray-800',
  blue: 'bg-blue-50 dark:bg-blue-900/30',
  green: 'bg-green-50 dark:bg-green-900/30',
  yellow: 'bg-yellow-50 dark:bg-yellow-900/30',
  red: 'bg-red-50 dark:bg-red-900/30',
  purple: 'bg-purple-50 dark:bg-purple-900/30',
}

export default function CalloutView({ node, updateAttributes }: NodeViewProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  const colorClass = COLOR_CLASSES[node.attrs.color] ?? COLOR_CLASSES.gray
  const icon: string = node.attrs.icon
  const text: string = node.attrs.text

  function startEdit() {
    setDraft(text)
    setEditing(true)
  }

  function commit() {
    if (draft !== text) {
      updateAttributes({ text: draft })
    }
    setEditing(false)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      commit()
    } else if (e.key === 'Escape') {
      setEditing(false)
    }
  }

  return (
    <NodeViewWrapper>
      <div className={`flex items-start gap-3 rounded-md px-4 py-3 my-1 ${colorClass}`}>
        <span
          contentEditable={false}
          className="text-2xl leading-tight select-none flex-shrink-0"
        >
          {icon}
        </span>
        <div className="flex-1 min-w-0" contentEditable={false}>
          {editing ? (
            <input
              type="text"
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={handleKeyDown}
              className="w-full bg-transparent outline-none text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400"
              placeholder="Write a note…"
            />
          ) : (
            <button
              type="button"
              onClick={startEdit}
              className="w-full text-left text-sm text-gray-800 dark:text-gray-200 focus:outline-none"
            >
              {text || <span className="text-gray-400 dark:text-gray-500">Click to edit…</span>}
            </button>
          )}
        </div>
      </div>
    </NodeViewWrapper>
  )
}
