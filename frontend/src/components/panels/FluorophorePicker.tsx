import { useEffect, useRef, useState, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { isCompatible } from '@/utils/spectra'
import type { Antibody, FluorophoreWithSpectra } from '@/types'

interface FluorophorePickerProps {
  laserWavelength: number
  filterMidpoint: number
  filterWidth: number
  assignedFluorophoreIds: Set<string>
  antibody: Antibody
  fluorophores: FluorophoreWithSpectra[]
  currentAssignmentFluorophoreId: string | null
  anchorEl: HTMLElement | null
  onSelect: (fluorophoreId: string) => void
  onClear: () => void
  onClose: () => void
}

export default function FluorophorePicker({
  laserWavelength,
  filterMidpoint,
  filterWidth,
  assignedFluorophoreIds,
  antibody,
  fluorophores,
  currentAssignmentFluorophoreId,
  anchorEl,
  onSelect,
  onClear,
  onClose,
}: FluorophorePickerProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })

  useLayoutEffect(() => {
    if (!anchorEl) return
    const rect = anchorEl.getBoundingClientRect()
    setPos({
      top: rect.bottom + window.scrollY + 2,
      left: rect.left + window.scrollX,
    })
  }, [anchorEl])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('keydown', handleKey)
    document.addEventListener('mousedown', handleClick)
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.removeEventListener('mousedown', handleClick)
    }
  }, [onClose])

  const style: React.CSSProperties = {
    position: 'fixed',
    top: anchorEl ? anchorEl.getBoundingClientRect().bottom + 2 : pos.top,
    left: anchorEl ? anchorEl.getBoundingClientRect().left : pos.left,
    zIndex: 50,
  }

  let content: React.ReactNode

  // Pre-conjugated antibody handling
  if (antibody.fluorophore_id) {
    const conjugatedFl = fluorophores.find((f) => f.id === antibody.fluorophore_id)
    if (!conjugatedFl) {
      content = (
        <div ref={ref} className="w-56 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 shadow-lg" style={style}>
          <p className="text-sm text-gray-500 dark:text-gray-400">Conjugated fluorophore not found in library.</p>
        </div>
      )
    } else {
      const compat = isCompatible(conjugatedFl, laserWavelength, filterMidpoint, filterWidth)
      if (!compat) {
        content = (
          <div ref={ref} className="w-64 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 shadow-lg" style={style}>
            <p className="text-sm text-amber-600 dark:text-amber-400">
              Pre-conjugated fluorophore ({conjugatedFl.name}) is not compatible with this detector.
            </p>
          </div>
        )
      } else {
        content = (
          <div ref={ref} className="w-56 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg" style={style}>
            <button
              onClick={() => onSelect(conjugatedFl.id)}
              className="w-full px-3 py-2 text-left text-sm font-medium hover:bg-blue-50 dark:hover:bg-blue-900/30"
            >
              {conjugatedFl.name}
              <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">
                {conjugatedFl.ex_max_nm}/{conjugatedFl.em_max_nm}
              </span>
            </button>
          </div>
        )
      }
    }
  } else {
    // Unconjugated: filter to compatible fluorophores
    const compatible = fluorophores.filter((fl) =>
      isCompatible(fl, laserWavelength, filterMidpoint, filterWidth)
    )

    content = (
      <div ref={ref} className="max-h-60 w-64 overflow-y-auto rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg" style={style}>
        {currentAssignmentFluorophoreId && (
          <button
            onClick={onClear}
            className="w-full border-b border-gray-100 dark:border-gray-700 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30"
          >
            Clear assignment
          </button>
        )}
        {compatible.length === 0 ? (
          <p className="px-3 py-2 text-sm text-gray-400 dark:text-gray-500">No compatible fluorophores</p>
        ) : (
          compatible.map((fl) => {
            const alreadyAssigned = assignedFluorophoreIds.has(fl.id)
            return (
              <button
                key={fl.id}
                onClick={() => onSelect(fl.id)}
                className={
                  'w-full px-3 py-2 text-left text-sm hover:bg-blue-50 dark:hover:bg-blue-900/30' +
                  (alreadyAssigned ? ' opacity-50' : '')
                }
              >
                <span className="font-medium">{fl.name}</span>
                <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">
                  {fl.ex_max_nm}/{fl.em_max_nm}
                </span>
                {alreadyAssigned && <span className="ml-1" title="Already assigned in this panel">&#9888;&#65039;</span>}
              </button>
            )
          })
        )}
      </div>
    )
  }

  return createPortal(content, document.body)
}
