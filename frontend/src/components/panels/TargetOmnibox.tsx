import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { tokenSearch } from '@/utils/search'
import type { Antibody, DyeLabel } from '@/types'

export type TargetSelection =
  | { type: 'antibody'; antibody: Antibody }
  | { type: 'dye_label'; dyeLabel: DyeLabel }

interface TargetOmniboxProps {
  antibodies: Antibody[]
  dyeLabels: DyeLabel[]
  excludeAntibodyIds: Set<string>
  excludeDyeLabelIds: Set<string>
  onSelect: (selection: TargetSelection) => void
  onCancel: () => void
  autoFocus?: boolean
}

type UnifiedTarget =
  | { kind: 'antibody'; id: string; item: Antibody }
  | { kind: 'dye_label'; id: string; item: DyeLabel }

export default function TargetOmnibox({
  antibodies,
  dyeLabels,
  excludeAntibodyIds,
  excludeDyeLabelIds,
  onSelect,
  onCancel,
  autoFocus,
}: TargetOmniboxProps) {
  const [search, setSearch] = useState('')
  const [highlightIndex, setHighlightIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null)

  const filtered = useMemo(() => {
    const abItems: UnifiedTarget[] = antibodies
      .filter((ab) => !excludeAntibodyIds.has(ab.id))
      .map((ab) => ({ kind: 'antibody' as const, id: ab.id, item: ab }))
    const dlItems: UnifiedTarget[] = dyeLabels
      .filter((dl) => !excludeDyeLabelIds.has(dl.id))
      .map((dl) => ({ kind: 'dye_label' as const, id: dl.id, item: dl }))

    const all = [...abItems, ...dlItems]
    if (!search.trim()) return all

    return tokenSearch(all, search, (entry) => {
      if (entry.kind === 'antibody') {
        const ab = entry.item as Antibody
        return [
          { value: ab.target, weight: 3 },
          { value: ab.name, weight: 2 },
          { value: ab.clone, weight: 2 },
          { value: ab.catalog_number, weight: 1.5 },
          { value: ab.conjugate, weight: 1 },
          { value: ab.fluorophore_name, weight: 1 },
          { value: ab.vendor, weight: 0.5 },
        ]
      }
      const dl = entry.item as DyeLabel
      return [
        { value: dl.name, weight: 3 },
        { value: dl.label_target, weight: 2 },
        { value: dl.category, weight: 1 },
        { value: dl.fluorophore_name, weight: 1 },
        { value: dl.vendor, weight: 0.5 },
      ]
    })
  }, [antibodies, dyeLabels, excludeAntibodyIds, excludeDyeLabelIds, search])

  useEffect(() => {
    setHighlightIndex(0)
  }, [filtered.length])

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

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus()
    }
  }, [autoFocus])

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

  const handleSelect = (entry: UnifiedTarget) => {
    if (entry.kind === 'antibody') {
      onSelect({ type: 'antibody', antibody: entry.item as Antibody })
    } else {
      onSelect({ type: 'dye_label', dyeLabel: entry.item as DyeLabel })
    }
  }

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
        handleSelect(filtered[highlightIndex])
      }
    }
  }

  const dropdown =
    dropdownPos && filtered.length > 0
      ? createPortal(
          <div
            ref={dropdownRef}
            className="max-h-72 w-96 overflow-y-auto rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg"
            style={{
              position: 'fixed',
              top: dropdownPos.top,
              left: dropdownPos.left,
              zIndex: 9999,
            }}
          >
            {filtered.map((entry, i) => (
              <button
                key={entry.kind + '-' + entry.id}
                onMouseDown={(e) => {
                  e.preventDefault()
                  handleSelect(entry)
                }}
                onMouseEnter={() => setHighlightIndex(i)}
                className={
                  'w-full px-3 py-2 text-left text-sm' +
                  (i === highlightIndex
                    ? ' bg-blue-50 dark:bg-blue-900/30'
                    : ' hover:bg-gray-50 dark:hover:bg-gray-700')
                }
              >
                {entry.kind === 'antibody' ? (
                  <>
                    <div className="flex items-baseline justify-between gap-2">
                      <span>
                        <span className="font-medium">{(entry.item as Antibody).target}</span>
                        {(entry.item as Antibody).clone && (
                          <span className="ml-2 text-gray-500 dark:text-gray-400">
                            ({(entry.item as Antibody).clone})
                          </span>
                        )}
                      </span>
                      {(entry.item as Antibody).host && (
                        <span className="shrink-0 text-xs text-gray-400 dark:text-gray-500">
                          {(entry.item as Antibody).host}
                        </span>
                      )}
                    </div>
                    {((entry.item as Antibody).fluorophore_name || (entry.item as Antibody).vendor) && (
                      <div className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
                        {(entry.item as Antibody).fluorophore_name && (
                          <span className="text-teal-600 dark:text-teal-400">
                            {(entry.item as Antibody).fluorophore_name}
                          </span>
                        )}
                        {(entry.item as Antibody).fluorophore_name && (entry.item as Antibody).vendor && (
                          <span className="mx-1">&middot;</span>
                        )}
                        {(entry.item as Antibody).vendor && <span>{(entry.item as Antibody).vendor}</span>}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="flex items-center gap-1.5">
                        <span className="font-medium">{(entry.item as DyeLabel).name}</span>
                        <span className="text-[10px] font-medium px-1 py-0.5 rounded bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 uppercase tracking-wide">
                          DYE
                        </span>
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                      {(entry.item as DyeLabel).label_target}
                      {(entry.item as DyeLabel).fluorophore_name && (
                        <span className="ml-1 text-teal-600 dark:text-teal-400">
                          &middot; {(entry.item as DyeLabel).fluorophore_name}
                        </span>
                      )}
                    </div>
                  </>
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
              className="w-96 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg"
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
        placeholder="Search antibody, dye, or label..."
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
