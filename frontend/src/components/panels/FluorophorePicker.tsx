import { useEffect, useRef } from 'react'
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
  onSelect,
  onClear,
  onClose,
}: FluorophorePickerProps) {
  const ref = useRef<HTMLDivElement>(null)

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

  // Pre-conjugated antibody handling
  if (antibody.fluorophore_id) {
    const conjugatedFl = fluorophores.find((f) => f.id === antibody.fluorophore_id)
    if (!conjugatedFl) {
      return (
        <div ref={ref} className="absolute z-20 w-56 rounded border border-gray-200 bg-white p-3 shadow-lg">
          <p className="text-sm text-gray-500">Conjugated fluorophore not found in library.</p>
        </div>
      )
    }

    const compatible = isCompatible(conjugatedFl, laserWavelength, filterMidpoint, filterWidth)
    if (!compatible) {
      return (
        <div ref={ref} className="absolute z-20 w-64 rounded border border-gray-200 bg-white p-3 shadow-lg">
          <p className="text-sm text-amber-600">
            Pre-conjugated fluorophore ({conjugatedFl.name}) is not compatible with this detector.
          </p>
        </div>
      )
    }

    return (
      <div ref={ref} className="absolute z-20 w-56 rounded border border-gray-200 bg-white shadow-lg">
        <button
          onClick={() => onSelect(conjugatedFl.id)}
          className="w-full px-3 py-2 text-left text-sm font-medium hover:bg-blue-50"
        >
          {conjugatedFl.name}
          <span className="ml-2 text-xs text-gray-400">
            {conjugatedFl.excitation_max_nm}/{conjugatedFl.emission_max_nm}
          </span>
        </button>
      </div>
    )
  }

  // Unconjugated: filter to compatible fluorophores
  const compatible = fluorophores.filter((fl) =>
    isCompatible(fl, laserWavelength, filterMidpoint, filterWidth)
  )

  return (
    <div ref={ref} className="absolute z-20 max-h-60 w-64 overflow-y-auto rounded border border-gray-200 bg-white shadow-lg">
      {currentAssignmentFluorophoreId && (
        <button
          onClick={onClear}
          className="w-full border-b border-gray-100 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
        >
          Clear assignment
        </button>
      )}
      {compatible.length === 0 ? (
        <p className="px-3 py-2 text-sm text-gray-400">No compatible fluorophores</p>
      ) : (
        compatible.map((fl) => {
          const alreadyAssigned = assignedFluorophoreIds.has(fl.id)
          return (
            <button
              key={fl.id}
              onClick={() => onSelect(fl.id)}
              className={
                'w-full px-3 py-2 text-left text-sm hover:bg-blue-50' +
                (alreadyAssigned ? ' opacity-50' : '')
              }
            >
              <span className="font-medium">{fl.name}</span>
              <span className="ml-2 text-xs text-gray-400">
                {fl.excitation_max_nm}/{fl.emission_max_nm}
              </span>
              {alreadyAssigned && <span className="ml-1" title="Already assigned in this panel">&#9888;&#65039;</span>}
            </button>
          )
        })
      )}
    </div>
  )
}
