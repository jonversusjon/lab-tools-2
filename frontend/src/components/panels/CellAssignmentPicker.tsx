import { useState, useRef, useEffect, useMemo, useCallback, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { isCompatible } from '@/utils/spectra'
import { tokenSearch } from '@/utils/search'
import type { Antibody, SecondaryAntibody, FluorophoreWithSpectra } from '@/types'
import type { DetectionStrategy } from '@/utils/conjugates'

interface CellAssignmentPickerProps {
  antibody: Antibody | null
  detectionStrategy: DetectionStrategy
  laserWavelength: number
  filterMidpoint: number
  filterWidth: number
  /** All fluorophores (with spectra when available) for compatibility checks */
  allFluorophores: FluorophoreWithSpectra[]
  secondaryAntibodies: SecondaryAntibody[]
  currentSecondaryId: string | null
  currentFluorophoreId: string | null
  assignedFluorophoreIds: Set<string>
  anchorEl: HTMLElement
  onSelectSecondary: (secondaryId: string) => void
  onSelectFluorophore: (fluorophoreId: string) => void
  onClear: () => void
  onClose: () => void
}

export default function CellAssignmentPicker({
  antibody,
  detectionStrategy,
  laserWavelength,
  filterMidpoint,
  filterWidth,
  allFluorophores,
  secondaryAntibodies,
  currentSecondaryId,
  currentFluorophoreId,
  assignedFluorophoreIds,
  anchorEl,
  onSelectSecondary,
  onSelectFluorophore,
  onClear,
  onClose,
}: CellAssignmentPickerProps) {
  const [search, setSearch] = useState('')
  const [highlightIndex, setHighlightIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })

  // Build a fast lookup from fluorophore_id → FluorophoreWithSpectra
  const fluorophoreById = useMemo(() => {
    const map = new Map<string, FluorophoreWithSpectra>()
    for (const fl of allFluorophores) map.set(fl.id, fl)
    return map
  }, [allFluorophores])

  // Species-matched secondaries that are also compatible with this detector
  const speciesSecondaries = useMemo(() => {
    if (detectionStrategy.type === 'direct') return []
    if (detectionStrategy.type === 'conjugate') return []

    const compatible = secondaryAntibodies.filter((sec) => {
      if (sec.binding_mode !== 'species') return false
      if (
        antibody?.host &&
        sec.target_species.toLowerCase() !== antibody.host.toLowerCase()
      ) return false
      if (
        sec.target_isotype &&
        antibody?.isotype &&
        sec.target_isotype.toLowerCase() !== antibody.isotype.toLowerCase()
      ) return false
      // Must have a fluorophore compatible with this detector
      if (!sec.fluorophore_id) return false
      const fl = fluorophoreById.get(sec.fluorophore_id)
      if (!fl) return false
      return isCompatible(fl, laserWavelength, filterMidpoint, filterWidth)
    })

    if (!search.trim()) return compatible
    return tokenSearch(compatible, search, (sec) => [
      { value: sec.name, weight: 2 },
      { value: sec.fluorophore_name, weight: 2 },
      { value: sec.target_species, weight: 1 },
      { value: sec.vendor, weight: 0.5 },
    ])
  }, [
    secondaryAntibodies, antibody?.host, antibody?.isotype,
    detectionStrategy, fluorophoreById,
    laserWavelength, filterMidpoint, filterWidth, search,
  ])

  // Conjugate-matched secondaries that are also compatible with this detector
  const conjugateSecondaries = useMemo(() => {
    if (detectionStrategy.type === 'direct' || detectionStrategy.type === 'species') return []
    const targetConj = detectionStrategy.conjugate

    const compatible = secondaryAntibodies.filter((sec) => {
      if (sec.binding_mode !== 'conjugate') return false
      if (!sec.target_conjugate || sec.target_conjugate.toLowerCase() !== targetConj) return false
      if (!sec.fluorophore_id) return false
      const fl = fluorophoreById.get(sec.fluorophore_id)
      if (!fl) return false
      return isCompatible(fl, laserWavelength, filterMidpoint, filterWidth)
    })

    if (!search.trim()) return compatible
    return tokenSearch(compatible, search, (sec) => [
      { value: sec.name, weight: 2 },
      { value: sec.fluorophore_name, weight: 2 },
      { value: sec.vendor, weight: 0.5 },
    ])
  }, [
    secondaryAntibodies, detectionStrategy,
    fluorophoreById, laserWavelength, filterMidpoint, filterWidth, search,
  ])

  // Fluorophores compatible with this detector
  const compatibleFluorophores = useMemo(() => {
    const filtered = allFluorophores.filter((fl) =>
      isCompatible(fl, laserWavelength, filterMidpoint, filterWidth)
    )
    if (!search.trim()) return filtered.slice(0, 40)
    return tokenSearch(filtered, search, (fl) => [
      { value: fl.name, weight: 3 },
      { value: fl.ex_max_nm != null ? String(fl.ex_max_nm) : null, weight: 0.5 },
      { value: fl.em_max_nm != null ? String(fl.em_max_nm) : null, weight: 0.5 },
    ]).slice(0, 40)
  }, [allFluorophores, laserWavelength, filterMidpoint, filterWidth, search])

  // Flat list for keyboard navigation
  type PickerItem =
    | { kind: 'secondary'; item: SecondaryAntibody }
    | { kind: 'fluorophore'; item: FluorophoreWithSpectra }

  const allItems: PickerItem[] = useMemo(() => {
    const items: PickerItem[] = []
    for (const sec of speciesSecondaries) items.push({ kind: 'secondary', item: sec })
    for (const sec of conjugateSecondaries) items.push({ kind: 'secondary', item: sec })
    for (const fl of compatibleFluorophores) items.push({ kind: 'fluorophore', item: fl })
    return items
  }, [speciesSecondaries, conjugateSecondaries, compatibleFluorophores])

  useEffect(() => {
    setHighlightIndex(0)
  }, [allItems.length])

  const updatePos = useCallback(() => {
    const rect = anchorEl.getBoundingClientRect()
    setPos({ top: rect.bottom + 2, left: rect.left })
  }, [anchorEl])

  useLayoutEffect(() => {
    updatePos()
  }, [updatePos])

  useEffect(() => {
    window.addEventListener('scroll', updatePos, true)
    window.addEventListener('resize', updatePos)
    return () => {
      window.removeEventListener('scroll', updatePos, true)
      window.removeEventListener('resize', updatePos)
    }
  }, [updatePos])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        containerRef.current && !containerRef.current.contains(target) &&
        !anchorEl.contains(target)
      ) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose, anchorEl])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIndex((i) => Math.min(i + 1, allItems.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const item = allItems[highlightIndex]
      if (!item) return
      if (item.kind === 'secondary') onSelectSecondary(item.item.id)
      else onSelectFluorophore(item.item.id)
    }
  }

  const hasSelection = currentSecondaryId || currentFluorophoreId

  const renderSecondaryRow = (sec: SecondaryAntibody, idx: number) => (
    <button
      key={'sec-' + sec.id}
      onMouseDown={(e) => {
        e.preventDefault()
        onSelectSecondary(sec.id)
      }}
      onMouseEnter={() => setHighlightIndex(idx)}
      className={
        'w-full px-3 py-2 text-left text-sm' +
        (idx === highlightIndex
          ? ' bg-blue-50 dark:bg-blue-900/30'
          : ' hover:bg-gray-50 dark:hover:bg-gray-700') +
        (currentSecondaryId === sec.id ? ' font-semibold' : '')
      }
    >
      <span className="font-medium">{sec.name}</span>
      {sec.fluorophore_name && (
        <span className="ml-2 text-teal-600 dark:text-teal-400">{sec.fluorophore_name}</span>
      )}
      {currentSecondaryId === sec.id && (
        <span className="ml-2 text-xs text-blue-500">&#10003;</span>
      )}
    </button>
  )

  const content = (
    <div
      ref={containerRef}
      className="w-80 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg"
      style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999 }}
    >
      {/* Header: detector context */}
      <div className="border-b border-gray-100 dark:border-gray-700 px-3 py-1.5 text-xs text-gray-400 dark:text-gray-500">
        {filterMidpoint}/{filterWidth} detector &middot; {laserWavelength}nm laser
      </div>

      {/* Search input */}
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

      {/* Clear option */}
      {hasSelection && (
        <button
          onMouseDown={(e) => {
            e.preventDefault()
            onClear()
          }}
          className="w-full px-3 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 border-b border-gray-100 dark:border-gray-700"
        >
          Clear selection
        </button>
      )}

      <div className="max-h-64 overflow-y-auto">
        {/* Species-matched secondaries */}
        {speciesSecondaries.length > 0 && (
          <>
            <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/50">
              Anti-{antibody?.host ?? 'Host'} Secondaries
              {antibody?.isotype && (
                <span className="ml-1 font-normal text-gray-400">({antibody.isotype})</span>
              )}
            </div>
            {speciesSecondaries.map((sec) => {
              const idx = allItems.findIndex(
                (it) => it.kind === 'secondary' && it.item.id === sec.id
              )
              return renderSecondaryRow(sec, idx)
            })}
          </>
        )}

        {/* Conjugate reagents */}
        {conjugateSecondaries.length > 0 && (
          <>
            <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/50">
              {detectionStrategy.type === 'both' || detectionStrategy.type === 'conjugate'
                ? detectionStrategy.label
                : 'Conjugate Reagents'}
            </div>
            {conjugateSecondaries.map((sec) => {
              const idx = allItems.findIndex(
                (it) => it.kind === 'secondary' && it.item.id === sec.id
              )
              return renderSecondaryRow(sec, idx)
            })}
          </>
        )}

        {/* Direct fluorophores */}
        {compatibleFluorophores.length > 0 && (
          <>
            <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/50">
              Fluorophores
            </div>
            {compatibleFluorophores.map((fl) => {
              const idx = allItems.findIndex(
                (it) => it.kind === 'fluorophore' && it.item.id === fl.id
              )
              const isCurrentFl = currentFluorophoreId === fl.id
              const alreadyAssigned = assignedFluorophoreIds.has(fl.id) && !isCurrentFl
              return (
                <button
                  key={'fl-' + fl.id}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    onSelectFluorophore(fl.id)
                  }}
                  onMouseEnter={() => setHighlightIndex(idx)}
                  className={
                    'w-full px-3 py-2 text-left text-sm' +
                    (idx === highlightIndex
                      ? ' bg-blue-50 dark:bg-blue-900/30'
                      : ' hover:bg-gray-50 dark:hover:bg-gray-700') +
                    (alreadyAssigned ? ' opacity-50' : '') +
                    (isCurrentFl ? ' font-semibold' : '')
                  }
                >
                  <span className="font-medium">{fl.name}</span>
                  {fl.ex_max_nm != null && fl.em_max_nm != null && (
                    <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">
                      {fl.ex_max_nm}/{fl.em_max_nm}
                    </span>
                  )}
                  {isCurrentFl && (
                    <span className="ml-2 text-xs text-blue-500">&#10003;</span>
                  )}
                  {alreadyAssigned && (
                    <span className="ml-1 text-xs" title="Already assigned in this panel">&#9888;&#65039;</span>
                  )}
                </button>
              )
            })}
          </>
        )}

        {speciesSecondaries.length === 0 &&
          conjugateSecondaries.length === 0 &&
          compatibleFluorophores.length === 0 && (
          <div className="px-3 py-4 text-center text-sm text-gray-400 dark:text-gray-500">
            No compatible secondaries or fluorophores found
          </div>
        )}
      </div>
    </div>
  )

  return createPortal(content, document.body)
}
