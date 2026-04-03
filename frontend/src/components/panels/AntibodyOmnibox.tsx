import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { tokenSearch } from '@/utils/search'
import type { Antibody } from '@/types'

interface AntibodyOmniboxProps {
  antibodies: Antibody[]
  excludeIds: Set<string>
  onSelect: (antibody: Antibody) => void
  onCancel: () => void
  autoFocus?: boolean
}

export default function AntibodyOmnibox({
  antibodies,
  excludeIds,
  onSelect,
  onCancel,
  autoFocus,
}: AntibodyOmniboxProps) {
  const [search, setSearch] = useState('')
  const [highlightIndex, setHighlightIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null)

  const filtered = useMemo(() => {
    const available = antibodies.filter((ab) => !excludeIds.has(ab.id))
    if (!search.trim()) return available
    return tokenSearch(available, search, (ab) => [
      { value: ab.target, weight: 3 },
      { value: ab.name, weight: 2 },
      { value: ab.clone, weight: 2 },
      { value: ab.catalog_number, weight: 1.5 },
      { value: ab.conjugate, weight: 1 },
      { value: ab.fluorophore_name, weight: 1 },
      { value: ab.vendor, weight: 0.5 },
    ])
  }, [antibodies, excludeIds, search])

  // Reset highlight when filtered list changes
  useEffect(() => {
    setHighlightIndex(0)
  }, [filtered.length])

  // Position dropdown via portal
  const updatePosition = useCallback(() => {
    if (!inputRef.current) return
    const rect = inputRef.current.getBoundingClientRect()
    setDropdownPos({ top: rect.bottom + 2, left: rect.left })
  }, [])

  useEffect(() => {
    updatePosition()
    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)
    return () => {
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
    }
  }, [updatePosition])

  // Auto-focus
  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus()
    }
  }, [autoFocus])

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        inputRef.current && !inputRef.current.contains(target) &&
        dropdownRef.current && !dropdownRef.current.contains(target)
      ) {
        onCancel()
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onCancel])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIndex((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filtered[highlightIndex]) {
        onSelect(filtered[highlightIndex])
      }
    }
  }

  const dropdown =
    dropdownPos && filtered.length > 0
      ? createPortal(
          <div
            ref={dropdownRef}
            className="max-h-60 w-80 overflow-y-auto rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg"
            style={{
              position: 'fixed',
              top: dropdownPos.top,
              left: dropdownPos.left,
              zIndex: 9999,
            }}
          >
            {filtered.map((ab, i) => (
              <button
                key={ab.id}
                onMouseDown={(e) => {
                  e.preventDefault()
                  onSelect(ab)
                }}
                onMouseEnter={() => setHighlightIndex(i)}
                className={
                  'w-full px-3 py-2 text-left text-sm' +
                  (i === highlightIndex
                    ? ' bg-blue-50 dark:bg-blue-900/30'
                    : ' hover:bg-gray-50 dark:hover:bg-gray-700')
                }
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span>
                    <span className="font-medium">{ab.target}</span>
                    {ab.clone && (
                      <span className="ml-2 text-gray-500 dark:text-gray-400">({ab.clone})</span>
                    )}
                  </span>
                  {ab.host && (
                    <span className="shrink-0 text-xs text-gray-400 dark:text-gray-500">{ab.host}</span>
                  )}
                </div>
                {(ab.fluorophore_name || ab.vendor) && (
                  <div className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
                    {ab.fluorophore_name && (
                      <span className="text-teal-600 dark:text-teal-400">{ab.fluorophore_name}</span>
                    )}
                    {ab.fluorophore_name && ab.vendor && (
                      <span className="mx-1">&middot;</span>
                    )}
                    {ab.vendor && <span>{ab.vendor}</span>}
                  </div>
                )}
              </button>
            ))}
          </div>,
          document.body
        )
      : dropdownPos && search.trim() && filtered.length === 0
        ? createPortal(
            <div
              ref={dropdownRef}
              className="w-80 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg"
              style={{
                position: 'fixed',
                top: dropdownPos.top,
                left: dropdownPos.left,
                zIndex: 9999,
              }}
            >
              <div className="px-3 py-3 text-sm text-gray-400 dark:text-gray-500">
                No matches for &ldquo;{search}&rdquo;
              </div>
            </div>,
            document.body
          )
        : null

  return (
    <>
      <input
        ref={inputRef}
        type="text"
        placeholder="Search target, clone, host, vendor..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={updatePosition}
        className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1 text-sm dark:text-gray-100 focus:border-blue-500 focus:outline-none"
      />
      {dropdown}
    </>
  )
}
