import { useState, useRef, useEffect } from 'react'
import {
  useListEntries,
  useCreateListEntry,
  useUpdateListEntry,
  useDeleteListEntry,
} from '@/hooks/useListEntries'
import { useToast } from '@/components/layout/Toast'
import type { ListEntry } from '@/types'

interface ListEditorProps {
  listType: string
  label: string
  /** Current value in the parent input (used to select from list) */
  value: string
  onChange: (value: string) => void
  /** Additional CSS class for the outer wrapper */
  className?: string
  /** Placeholder for the main input */
  placeholder?: string
  /** Whether the field is required */
  required?: boolean
  /** When true, renders a strict <select> dropdown instead of a free-text input with datalist */
  selectOnly?: boolean
}

export default function ListEditor({
  listType,
  label,
  value,
  onChange,
  className = '',
  placeholder,
  required,
  selectOnly = false,
}: ListEditorProps) {
  const { data: entries = [] } = useListEntries(listType)
  const createMut = useCreateListEntry(listType)
  const updateMut = useUpdateListEntry(listType)
  const deleteMut = useDeleteListEntry(listType)
  const { toast } = useToast()

  const [editorOpen, setEditorOpen] = useState(false)
  const [newValue, setNewValue] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState('')
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setEditorOpen(false)
      }
    }
    if (editorOpen) {
      document.addEventListener('mousedown', handleClick)
    }
    return () => document.removeEventListener('mousedown', handleClick)
  }, [editorOpen])

  const handleAdd = () => {
    const trimmed = newValue.trim()
    if (!trimmed) return
    createMut.mutate(trimmed, {
      onSuccess: () => {
        setNewValue('')
        toast('Added: ' + trimmed, 'success')
      },
      onError: (err) => {
        toast(err.message, 'error')
      },
    })
  }

  const handleSaveEdit = (entry: ListEntry) => {
    const trimmed = editingValue.trim()
    if (!trimmed || trimmed === entry.value) {
      setEditingId(null)
      return
    }
    updateMut.mutate(
      { id: entry.id, value: trimmed },
      {
        onSuccess: () => {
          setEditingId(null)
          toast('Renamed to: ' + trimmed, 'success')
        },
        onError: (err) => {
          toast(err.message, 'error')
        },
      },
    )
  }

  const handleDelete = (entry: ListEntry) => {
    deleteMut.mutate(entry.id, {
      onSuccess: () => {
        toast(
          'Removed "' + entry.value + '" from list. Existing records are unchanged.',
          'info',
        )
      },
    })
  }

  const inputClass =
    'w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm dark:text-gray-100 focus:border-blue-500 focus:outline-none'

  return (
    <div className={'relative ' + className}>
      <div className="mb-1 flex items-center justify-between">
        <label className="block text-sm font-medium text-foreground-muted">
          {label}
          {required && <span className="text-danger"> *</span>}
        </label>
        <button
          type="button"
          onClick={() => setEditorOpen(!editorOpen)}
          className="text-xs text-accent hover:underline"
          title={'Edit ' + label + ' list'}
        >
          Edit list
        </button>
      </div>

      {selectOnly ? (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass}
        >
          <option value="">{placeholder || 'Select...'}</option>
          {entries.map((e) => (
            <option key={e.id} value={e.value}>{e.value}</option>
          ))}
        </select>
      ) : (
        <>
          <input
            type="text"
            list={'list-' + listType}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={inputClass}
            placeholder={placeholder}
          />
          <datalist id={'list-' + listType}>
            {entries.map((e) => (
              <option key={e.id} value={e.value} />
            ))}
          </datalist>
        </>
      )}

      {editorOpen && (
        <div
          ref={popoverRef}
          className="absolute left-0 top-full z-50 mt-1 w-72 rounded-lg border border-border bg-elevated shadow-xl"
        >
          <div className="border-b border-border px-3 py-2">
            <p className="text-xs font-medium text-foreground-muted uppercase tracking-wide">
              Manage {label}s
            </p>
          </div>

          {/* Add new */}
          <div className="flex gap-1 border-b border-border px-3 py-2">
            <input
              type="text"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleAdd()
                }
              }}
              placeholder="Add new..."
              className="flex-1 rounded border border-border-strong bg-white dark:bg-gray-700 px-2 py-1 text-sm dark:text-gray-100 focus:border-blue-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={handleAdd}
              disabled={!newValue.trim() || createMut.isPending}
              className="rounded bg-accent hover:bg-accent-hover text-accent-foreground px-2 py-1 text-xs font-medium disabled:opacity-50"
            >
              Add
            </button>
          </div>

          {/* Existing entries */}
          <ul className="max-h-52 overflow-y-auto">
            {entries.length === 0 && (
              <li className="px-3 py-2 text-xs text-foreground-subtle">
                No entries yet.
              </li>
            )}
            {entries.map((entry) => (
              <li
                key={entry.id}
                className="group flex items-center gap-1 border-b border-border px-3 py-1.5"
              >
                {editingId === entry.id ? (
                  <>
                    <input
                      type="text"
                      value={editingValue}
                      onChange={(e) => setEditingValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          handleSaveEdit(entry)
                        }
                        if (e.key === 'Escape') setEditingId(null)
                      }}
                      className="flex-1 rounded border border-border-strong bg-white dark:bg-gray-700 px-2 py-0.5 text-sm dark:text-gray-100 focus:border-blue-500 focus:outline-none"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => handleSaveEdit(entry)}
                      className="text-xs text-success hover:opacity-80"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="text-xs text-foreground-subtle hover:text-foreground-muted"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <span
                      className="flex-1 cursor-pointer text-sm text-foreground"
                      onClick={() => {
                        onChange(entry.value)
                        setEditorOpen(false)
                      }}
                      title="Click to select"
                    >
                      {entry.value}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(entry.id)
                        setEditingValue(entry.value)
                      }}
                      className="invisible text-xs text-foreground-subtle hover:text-accent group-hover:visible"
                      title="Edit"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(entry)}
                      className="invisible text-xs text-foreground-subtle hover:text-danger group-hover:visible"
                      title="Delete"
                    >
                      Del
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
