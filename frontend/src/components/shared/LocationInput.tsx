import { useEffect, useMemo, useRef, useState } from 'react'
import { useListEntries, useCreateListEntry } from '@/hooks/useListEntries'
import { useToast } from '@/components/layout/Toast'

interface LocationInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

const LIST_TYPE = 'locations'

export default function LocationInput({
  value,
  onChange,
  placeholder = 'Select or add location...',
  className = '',
}: LocationInputProps) {
  const { data: entries = [] } = useListEntries(LIST_TYPE)
  const createMut = useCreateListEntry(LIST_TYPE)
  const { toast } = useToast()

  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(value)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setDraft(value)
  }, [value])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
        setDraft(value)
      }
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, value])

  const trimmed = draft.trim()
  const existing = useMemo(
    () =>
      entries.filter((e) =>
        trimmed === ''
          ? true
          : e.value.toLowerCase().includes(trimmed.toLowerCase()),
      ),
    [entries, trimmed],
  )
  const isNovel =
    trimmed !== '' &&
    !entries.some((e) => e.value.toLowerCase() === trimmed.toLowerCase())

  const selectExisting = (val: string) => {
    onChange(val)
    setDraft(val)
    setOpen(false)
  }

  const addNew = async () => {
    if (!isNovel) return
    try {
      await createMut.mutateAsync(trimmed)
      onChange(trimmed)
      setOpen(false)
      toast('Added location: ' + trimmed, 'success')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to add location'
      toast(msg, 'error')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      const exactMatch = entries.find(
        (entry) => entry.value.toLowerCase() === trimmed.toLowerCase(),
      )
      if (exactMatch) {
        selectExisting(exactMatch.value)
      } else if (isNovel) {
        addNew()
      }
    } else if (e.key === 'Escape') {
      setDraft(value)
      setOpen(false)
    }
  }

  const inputClass =
    'w-full rounded border border-border-strong bg-elevated text-foreground px-3 py-2 text-sm focus:border-blue-500 focus:outline-none'

  return (
    <div ref={rootRef} className={'relative ' + className}>
      <input
        type="text"
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          if (draft.trim() === '' && value !== '') onChange('')
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={inputClass}
      />
      {open && (existing.length > 0 || isNovel) && (
        <div className="absolute left-0 top-full z-50 mt-1 w-full overflow-hidden rounded-lg border border-border bg-elevated shadow-xl">
          <ul className="max-h-52 overflow-y-auto">
            {existing.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  onClick={() => selectExisting(entry.value)}
                  className="block w-full cursor-pointer px-3 py-2 text-left text-sm text-foreground hover:bg-hover"
                >
                  {entry.value}
                </button>
              </li>
            ))}
            {isNovel && (
              <li>
                <button
                  type="button"
                  onClick={addNew}
                  disabled={createMut.isPending}
                  className="block w-full cursor-pointer border-t border-border px-3 py-2 text-left text-sm text-accent hover:bg-hover disabled:opacity-50"
                >
                  + Add new location: <strong>{trimmed}</strong>
                </button>
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
