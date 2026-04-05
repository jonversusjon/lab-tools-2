import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { tokenSearch } from '@/utils/search'
import type { Fluorophore } from '@/types'

interface IFFluorophorePickerProps {
  fluorophores: Fluorophore[]
  currentFluorophoreId: string | null
  assignedFluorophoreIds: Set<string>
  onSelect: (fluorophoreId: string) => void
  onClear: () => void
}

export default function IFFluorophorePicker({
  fluorophores,
  currentFluorophoreId,
  assignedFluorophoreIds,
  onSelect,
  onClear,
}: IFFluorophorePickerProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [highlightIndex, setHighlightIndex] = useState(0)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null)

  const currentFluorophore = useMemo(
    () => fluorophores.find((f) => f.id === currentFluorophoreId) ?? null,
    [fluorophores, currentFluorophoreId]
  )

  const filtered = useMemo(() => {
    if (!search.trim()) return fluorophores.slice(0, 50)
    return tokenSearch(fluorophores, search, (f) => [
      { value: f.name, weight: 3 },
      { value: f.ex_max_nm != null ? String(f.ex_max_nm) : null, weight: 0.5 },
      { value: f.em_max_nm != null ? String(f.em_max_nm) : null, weight: 0.5 },
    ])
  }, [fluorophores, search])

  useEffect(() => { setHighlightIndex(0) }, [filtered.length])

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    setDropdownPos({ top: rect.bottom + 2, left: rect.left })
  }, [])

  useEffect(() => {
    if (!open) return
    updatePosition()
    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)
    return () => {
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
    }
  }, [open, updatePosition])

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      const t = e.target as Node
      if (
        triggerRef.current && !triggerRef.current.contains(t) &&
        dropdownRef.current && !dropdownRef.current.contains(t)
      ) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
      setSearch('')
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIndex((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filtered[highlightIndex]) {
        onSelect(filtered[highlightIndex].id)
        setOpen(false)
        setSearch('')
      }
    }
  }

  const dropdown =
    open && dropdownPos
      ? createPortal(
          <div
            ref={dropdownRef}
            className="w-72 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg"
            style={{ position: 'fixed', top: dropdownPos.top, left: dropdownPos.left, zIndex: 9999 }}
          >
            <div className="border-b border-gray-100 dark:border-gray-700 px-3 py-2">
              <input
                ref={inputRef}
                type="text"
                placeholder="Search fluorophores..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1 text-sm dark:text-gray-100 focus:border-blue-500 focus:outline-none"
              />
            </div>
            {currentFluorophoreId && (
              <button
                onMouseDown={(e) => {
                  e.preventDefault()
                  onClear()
                  setOpen(false)
                  setSearch('')
                }}
                className="w-full px-3 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 border-b border-gray-100 dark:border-gray-700"
              >
                Clear selection
              </button>
            )}
            <div className="max-h-60 overflow-y-auto">
              {filtered.map((fl, i) => {
                const inUse = assignedFluorophoreIds.has(fl.id) && fl.id !== currentFluorophoreId
                return (
                  <button
                    key={fl.id}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      onSelect(fl.id)
                      setOpen(false)
                      setSearch('')
                    }}
                    onMouseEnter={() => setHighlightIndex(i)}
                    className={
                      'w-full px-3 py-2 text-left text-sm' +
                      (i === highlightIndex ? ' bg-blue-50 dark:bg-blue-900/30' : ' hover:bg-gray-50 dark:hover:bg-gray-700') +
                      (inUse ? ' opacity-50' : '')
                    }
                  >
                    <span className="font-medium">{fl.name}</span>
                    {fl.ex_max_nm != null && fl.em_max_nm != null && (
                      <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">
                        ex {fl.ex_max_nm} / em {fl.em_max_nm}
                      </span>
                    )}
                    {inUse && (
                      <span className="ml-1 text-xs text-gray-400 dark:text-gray-500">(in use)</span>
                    )}
                  </button>
                )
              })}
              {filtered.length === 0 && (
                <div className="px-3 py-4 text-center text-sm text-gray-400 dark:text-gray-500">
                  No fluorophores found
                </div>
              )}
            </div>
          </div>,
          document.body
        )
      : null

  return (
    <>
      <button ref={triggerRef} onClick={() => setOpen(!open)} className="w-full text-left">
        {currentFluorophore ? (
          <span className="inline-flex items-center gap-1 text-sm text-teal-700 dark:text-teal-400">
            <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-teal-500" />
            {currentFluorophore.name}
          </span>
        ) : (
          <span className="text-sm italic text-gray-400 dark:text-gray-500">Select...</span>
        )}
      </button>
      {dropdown}
    </>
  )
}
