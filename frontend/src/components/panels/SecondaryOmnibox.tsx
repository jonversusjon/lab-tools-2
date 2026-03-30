import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import type { Antibody, SecondaryAntibody, Fluorophore } from '@/types'
import type { DetectionStrategy } from '@/utils/conjugates'

interface SecondaryOmniboxProps {
  primaryAntibody: Antibody
  detectionStrategy: DetectionStrategy
  secondaryAntibodies: SecondaryAntibody[]
  fluorophores: Fluorophore[]
  currentSecondaryId: string | null
  currentSecondaryName: string | null
  currentFluorophoreName: string | null
  onSelectSecondary: (secondaryId: string) => void
  onSelectFluorophore: (fluorophoreId: string) => void
  onClear: () => void
}

export default function SecondaryOmnibox({
  primaryAntibody,
  detectionStrategy,
  secondaryAntibodies,
  fluorophores,
  currentSecondaryId,
  currentSecondaryName,
  currentFluorophoreName,
  onSelectSecondary,
  onSelectFluorophore,
  onClear,
}: SecondaryOmniboxProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [highlightIndex, setHighlightIndex] = useState(0)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null)

  // Species-matched secondaries (anti-host)
  const speciesSecondaries = useMemo(() => {
    if (detectionStrategy.type === 'direct') return []
    if (detectionStrategy.type === 'conjugate') return []
    const term = search.toLowerCase()
    return secondaryAntibodies.filter((sec) => {
      if (sec.binding_mode !== 'species') return false
      if (primaryAntibody.host && sec.target_species.toLowerCase() !== primaryAntibody.host.toLowerCase()) {
        return false
      }
      if (sec.target_isotype && primaryAntibody.isotype &&
          sec.target_isotype.toLowerCase() !== primaryAntibody.isotype.toLowerCase()) {
        return false
      }
      if (!term) return true
      return (
        sec.name.toLowerCase().includes(term) ||
        (sec.fluorophore_name && sec.fluorophore_name.toLowerCase().includes(term)) ||
        (sec.vendor && sec.vendor.toLowerCase().includes(term))
      )
    })
  }, [secondaryAntibodies, primaryAntibody.host, primaryAntibody.isotype, detectionStrategy, search])

  // Conjugate-matched secondaries (streptavidin, anti-DIG, etc.)
  const conjugateSecondaries = useMemo(() => {
    if (detectionStrategy.type === 'direct' || detectionStrategy.type === 'species') return []
    const targetConj = detectionStrategy.conjugate
    const term = search.toLowerCase()
    return secondaryAntibodies.filter((sec) => {
      if (sec.binding_mode !== 'conjugate') return false
      if (!sec.target_conjugate || sec.target_conjugate.toLowerCase() !== targetConj) return false
      if (!term) return true
      return (
        sec.name.toLowerCase().includes(term) ||
        (sec.fluorophore_name && sec.fluorophore_name.toLowerCase().includes(term)) ||
        (sec.vendor && sec.vendor.toLowerCase().includes(term))
      )
    })
  }, [secondaryAntibodies, detectionStrategy, search])

  const filteredFluorophores = useMemo(() => {
    const term = search.toLowerCase()
    if (!term) return fluorophores.slice(0, 20)
    return fluorophores.filter((fl) => fl.name.toLowerCase().includes(term))
  }, [fluorophores, search])

  // Flat list for keyboard navigation: species secondaries, conjugate secondaries, then fluorophores
  const allItems = useMemo(() => {
    const items: Array<{ type: 'secondary'; item: SecondaryAntibody } | { type: 'fluorophore'; item: Fluorophore }> = []
    for (const sec of speciesSecondaries) items.push({ type: 'secondary', item: sec })
    for (const sec of conjugateSecondaries) items.push({ type: 'secondary', item: sec })
    for (const fl of filteredFluorophores) items.push({ type: 'fluorophore', item: fl })
    return items
  }, [speciesSecondaries, conjugateSecondaries, filteredFluorophores])

  useEffect(() => {
    setHighlightIndex(0)
  }, [allItems.length])

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
    if (open && inputRef.current) {
      inputRef.current.focus()
    }
  }, [open])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        triggerRef.current && !triggerRef.current.contains(target) &&
        dropdownRef.current && !dropdownRef.current.contains(target)
      ) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const handleSelect = (item: typeof allItems[0]) => {
    if (item.type === 'secondary') {
      onSelectSecondary(item.item.id)
    } else {
      onSelectFluorophore(item.item.id)
    }
    setOpen(false)
    setSearch('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
      setSearch('')
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIndex((i) => Math.min(i + 1, allItems.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (allItems[highlightIndex]) handleSelect(allItems[highlightIndex])
    }
  }

  const hasSelection = currentSecondaryId || currentFluorophoreName

  // Helper to render a secondary button row
  const renderSecondaryButton = (sec: SecondaryAntibody) => {
    const idx = allItems.findIndex((it) => it.type === 'secondary' && it.item.id === sec.id)
    return (
      <button
        key={'sec-' + sec.id}
        onMouseDown={(e) => {
          e.preventDefault()
          onSelectSecondary(sec.id)
          setOpen(false)
          setSearch('')
        }}
        onMouseEnter={() => setHighlightIndex(idx)}
        className={
          'w-full px-3 py-2 text-left text-sm' +
          (idx === highlightIndex
            ? ' bg-blue-50 dark:bg-blue-900/30'
            : ' hover:bg-gray-50 dark:hover:bg-gray-700')
        }
      >
        <span className="font-medium">{sec.name}</span>
        {sec.fluorophore_name && (
          <span className="ml-2 text-teal-600 dark:text-teal-400">{sec.fluorophore_name}</span>
        )}
      </button>
    )
  }

  const dropdown =
    open && dropdownPos
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
            <div className="border-b border-gray-100 dark:border-gray-700 px-3 py-2">
              <input
                ref={inputRef}
                type="text"
                placeholder="Search secondary or fluorophore..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1 text-sm dark:text-gray-100 focus:border-blue-500 focus:outline-none"
              />
            </div>
            {hasSelection && (
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
              {speciesSecondaries.length > 0 && (
                <>
                  <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/50">
                    Anti-{primaryAntibody.host ?? 'Host'} Secondaries
                  </div>
                  {speciesSecondaries.map((sec) => renderSecondaryButton(sec))}
                </>
              )}
              {conjugateSecondaries.length > 0 && (
                <>
                  <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/50">
                    {detectionStrategy.type === 'both' || detectionStrategy.type === 'conjugate'
                      ? detectionStrategy.label
                      : 'Conjugate Reagents'}
                  </div>
                  {conjugateSecondaries.map((sec) => renderSecondaryButton(sec))}
                </>
              )}
              {filteredFluorophores.length > 0 && (
                <>
                  <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/50">
                    Fluorophores
                  </div>
                  {filteredFluorophores.map((fl) => {
                    const idx = allItems.findIndex((it) => it.type === 'fluorophore' && it.item.id === fl.id)
                    return (
                      <button
                        key={'fl-' + fl.id}
                        onMouseDown={(e) => {
                          e.preventDefault()
                          onSelectFluorophore(fl.id)
                          setOpen(false)
                          setSearch('')
                        }}
                        onMouseEnter={() => setHighlightIndex(idx)}
                        className={
                          'w-full px-3 py-2 text-left text-sm' +
                          (idx === highlightIndex
                            ? ' bg-blue-50 dark:bg-blue-900/30'
                            : ' hover:bg-gray-50 dark:hover:bg-gray-700')
                        }
                      >
                        <span className="font-medium">{fl.name}</span>
                        {fl.ex_max_nm && fl.em_max_nm && (
                          <span className="ml-2 text-gray-400 dark:text-gray-500">
                            {fl.ex_max_nm}/{fl.em_max_nm}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </>
              )}
              {speciesSecondaries.length === 0 && conjugateSecondaries.length === 0 && filteredFluorophores.length === 0 && (
                <div className="px-3 py-4 text-center text-sm text-gray-400 dark:text-gray-500">
                  No results found
                </div>
              )}
            </div>
          </div>,
          document.body
        )
      : null

  // Display label for current selection
  let displayLabel: React.ReactNode
  if (currentSecondaryName) {
    displayLabel = (
      <span className="inline-flex items-center gap-1 text-sm">
        <span className="font-medium text-gray-700 dark:text-gray-300">{currentSecondaryName}</span>
        {currentFluorophoreName && (
          <span className="text-teal-600 dark:text-teal-400">{currentFluorophoreName}</span>
        )}
      </span>
    )
  } else if (currentFluorophoreName && !currentSecondaryId) {
    displayLabel = (
      <span className="inline-flex items-center gap-1 text-sm text-teal-700 dark:text-teal-400">
        <span className="inline-block h-2 w-2 rounded-full bg-teal-500" />
        {currentFluorophoreName}
      </span>
    )
  } else {
    displayLabel = (
      <span className="text-sm italic text-gray-400 dark:text-gray-500">Select secondary...</span>
    )
  }

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => setOpen(!open)}
        className="w-full text-left"
      >
        {displayLabel}
      </button>
      {dropdown}
    </>
  )
}
