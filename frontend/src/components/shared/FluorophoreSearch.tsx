import { useState, useMemo, useRef, useEffect } from 'react'
import { tokenSearch } from '@/utils/search'
import type { Fluorophore } from '@/types'

export default function FluorophoreSearch({
  fluorophores,
  selectedId,
  selectedName,
  onSelect,
  onClear,
}: {
  fluorophores: Fluorophore[]
  selectedId: string | null
  selectedName: string
  onSelect: (id: string, name: string) => void
  onClear: () => void
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const filtered = useMemo(() => {
    if (!query.trim()) return fluorophores.slice(0, 30)
    return tokenSearch(fluorophores, query, (f) => [
      { value: f.name, weight: 3 },
    ]).slice(0, 30)
  }, [fluorophores, query])

  if (selectedId) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-teal-700 dark:text-teal-400">{selectedName}</span>
        <button
          type="button"
          onClick={onClear}
          className="text-xs text-gray-400 hover:text-red-500"
        >
          Clear
        </button>
      </div>
    )
  }

  return (
    <div ref={ref} className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search fluorophores..."
        className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm dark:text-gray-100 focus:border-blue-500 focus:outline-none"
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-50 mt-1 max-h-48 w-full overflow-y-auto rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 shadow-lg">
          {filtered.map((fl) => (
            <li
              key={fl.id}
              className="cursor-pointer px-3 py-1.5 text-sm hover:bg-blue-50 dark:hover:bg-blue-900/30 dark:text-gray-100"
              onClick={() => {
                onSelect(fl.id, fl.name)
                setQuery('')
                setOpen(false)
              }}
            >
              <span className="font-medium">{fl.name}</span>
              {fl.ex_max_nm && fl.em_max_nm && (
                <span className="ml-2 text-xs text-gray-400">
                  {fl.ex_max_nm}/{fl.em_max_nm}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
