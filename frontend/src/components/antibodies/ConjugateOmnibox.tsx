import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import type { Fluorophore } from '@/types'

interface ConjugateOmniboxProps {
  fluorophores: Fluorophore[]
  currentFluorophoreId: string | null
  currentConjugateText: string | null
  onSelect: (fluorophoreId: string, displayName: string) => void
  onClear: () => void
}

function tokenizedMatch(name: string, query: string): boolean {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean)
  const nameLower = name.toLowerCase()
  return tokens.every((tok) => nameLower.includes(tok))
}

export default function ConjugateOmnibox({
  fluorophores,
  currentFluorophoreId,
  currentConjugateText,
  onSelect,
  onClear,
}: ConjugateOmniboxProps) {
  const [isActive, setIsActive] = useState(false)
  const [search, setSearch] = useState('')
  const [highlightIndex, setHighlightIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null)

  const currentFluorophore = useMemo(() => {
    if (!currentFluorophoreId) return null
    return fluorophores.find((f) => f.id === currentFluorophoreId) ?? null
  }, [currentFluorophoreId, fluorophores])

  const filtered = useMemo(() => {
    if (!search.trim()) return fluorophores.slice(0, 50)
    return fluorophores.filter((fl) => tokenizedMatch(fl.name, search))
  }, [fluorophores, search])

  // Sort: fluorescent first, then non-fluorescent, alphabetically within each group
  const sorted = useMemo(() => {
    const fluorescent = filtered.filter((fl) => fl.fluor_type !== 'non-fluorescent')
    const nonFluorescent = filtered.filter((fl) => fl.fluor_type === 'non-fluorescent')
    fluorescent.sort((a, b) => a.name.localeCompare(b.name))
    nonFluorescent.sort((a, b) => a.name.localeCompare(b.name))
    return [...fluorescent, ...nonFluorescent]
  }, [filtered])

  useEffect(() => {
    setHighlightIndex(0)
  }, [sorted.length])

  const updatePosition = useCallback(() => {
    if (!inputRef.current) return
    const rect = inputRef.current.getBoundingClientRect()
    setDropdownPos({ top: rect.bottom + 2, left: rect.left, width: Math.max(rect.width, 320) })
  }, [])

  useEffect(() => {
    if (!isActive) return
    updatePosition()
    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)
    return () => {
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
    }
  }, [isActive, updatePosition])

  useEffect(() => {
    if (isActive && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isActive])

  useEffect(() => {
    if (!isActive) return
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        inputRef.current && !inputRef.current.contains(target) &&
        dropdownRef.current && !dropdownRef.current.contains(target)
      ) {
        setIsActive(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [isActive])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      setIsActive(false)
      setSearch('')
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIndex((i) => Math.min(i + 1, sorted.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (sorted[highlightIndex]) {
        handleSelect(sorted[highlightIndex])
      }
    }
  }

  const handleSelect = (fl: Fluorophore) => {
    onSelect(fl.id, fl.name)
    setIsActive(false)
    setSearch('')
  }

  const handleActivate = () => {
    // Pre-populate search with legacy conjugate text for link affordance
    if (!currentFluorophoreId && currentConjugateText) {
      setSearch(currentConjugateText)
    }
    setIsActive(true)
  }

  // Display mode (not active)
  if (!isActive) {
    if (currentFluorophore) {
      return (
        <div className="flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-full bg-teal-100 dark:bg-teal-900/40 px-2 py-0.5 text-xs font-medium text-teal-700 dark:text-teal-300">
            {currentFluorophore.name}
          </span>
          <button
            type="button"
            onClick={onClear}
            className="text-gray-400 hover:text-red-500 text-xs"
            title="Clear conjugate"
          >
            &times;
          </button>
          <button
            type="button"
            onClick={() => setIsActive(true)}
            className="text-gray-400 hover:text-blue-500 text-xs"
            title="Change conjugate"
          >
            &#9998;
          </button>
        </div>
      )
    }
    if (currentConjugateText) {
      return (
        <div className="flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
            {currentConjugateText}
          </span>
          <button
            type="button"
            onClick={handleActivate}
            className="text-xs text-blue-500 hover:text-blue-700"
            title="Link to database fluorophore"
          >
            link
          </button>
          <button
            type="button"
            onClick={onClear}
            className="text-gray-400 hover:text-red-500 text-xs"
            title="Clear conjugate"
          >
            &times;
          </button>
        </div>
      )
    }
    return (
      <button
        type="button"
        onClick={() => setIsActive(true)}
        className="text-sm text-gray-400 dark:text-gray-500 hover:text-blue-500"
      >
        + Add conjugate
      </button>
    )
  }

  // Active search mode
  const dropdown =
    dropdownPos && sorted.length > 0
      ? createPortal(
          <div
            ref={dropdownRef}
            className="max-h-60 overflow-y-auto rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg"
            style={{
              position: 'fixed',
              top: dropdownPos.top,
              left: dropdownPos.left,
              width: dropdownPos.width,
              zIndex: 9999,
            }}
          >
            {sorted.map((fl, i) => {
              const isNonFluorescent = fl.fluor_type === 'non-fluorescent'
              const showGroupHeader =
                isNonFluorescent &&
                (i === 0 || sorted[i - 1].fluor_type !== 'non-fluorescent')
              return (
                <div key={fl.id}>
                  {showGroupHeader && (
                    <div className="px-3 py-1 text-[10px] font-semibold uppercase text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-900/50">
                      Non-fluorescent
                    </div>
                  )}
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault()
                      handleSelect(fl)
                    }}
                    onMouseEnter={() => setHighlightIndex(i)}
                    className={
                      'w-full px-3 py-1.5 text-left text-sm' +
                      (i === highlightIndex
                        ? ' bg-blue-50 dark:bg-blue-900/30'
                        : ' hover:bg-gray-50 dark:hover:bg-gray-700')
                    }
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-medium dark:text-gray-100">{fl.name}</span>
                      {isNonFluorescent ? (
                        <span className="shrink-0 text-[10px] text-gray-400 dark:text-gray-500">
                          Non-fluorescent
                        </span>
                      ) : (
                        fl.ex_max_nm != null &&
                        fl.em_max_nm != null && (
                          <span className="shrink-0 text-[10px] text-gray-400 dark:text-gray-500">
                            {Math.round(fl.ex_max_nm)}/{Math.round(fl.em_max_nm)}
                          </span>
                        )
                      )}
                    </div>
                  </button>
                </div>
              )
            })}
          </div>,
          document.body
        )
      : dropdownPos && search.trim() && sorted.length === 0
        ? createPortal(
            <div
              ref={dropdownRef}
              className="rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg"
              style={{
                position: 'fixed',
                top: dropdownPos.top,
                left: dropdownPos.left,
                width: dropdownPos.width,
                zIndex: 9999,
              }}
            >
              <div className="px-3 py-3 text-sm text-gray-400 dark:text-gray-500">
                No matches
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
        placeholder="Search fluorophore or conjugate..."
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
