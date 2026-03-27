import { useState } from 'react'
import { laserColors } from '@/utils/colors'
import DetectorRow from './DetectorRow'
import type { DetectorFormData } from './DetectorRow'

interface LaserFormData {
  wavelength_nm: number
  name: string
  detectors: DetectorFormData[]
}

interface LaserSectionProps {
  laser: LaserFormData
  onChange: (updated: LaserFormData) => void
  onRemove: () => void
}

export default function LaserSection({ laser, onChange, onRemove }: LaserSectionProps) {
  const [collapsed, setCollapsed] = useState(false)
  const colorHex = laserColors[laser.wavelength_nm] ?? '#6B7280'

  const updateDetector = (index: number, updated: DetectorFormData) => {
    const detectors = [...laser.detectors]
    detectors[index] = updated
    onChange({ ...laser, detectors })
  }

  const removeDetector = (index: number) => {
    const detectors = laser.detectors.filter((_, i) => i !== index)
    onChange({ ...laser, detectors })
  }

  const addDetector = () => {
    onChange({
      ...laser,
      detectors: [
        ...laser.detectors,
        { filter_midpoint: 0, filter_width: 0, name: '' },
      ],
    })
  }

  return (
    <div className="rounded border border-gray-200 bg-white">
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="text-gray-400 hover:text-gray-600"
          aria-label={collapsed ? 'Expand laser' : 'Collapse laser'}
        >
          {collapsed ? '\u25B6' : '\u25BC'}
        </button>
        <span
          className="inline-block h-3 w-3 rounded-full"
          style={{ backgroundColor: colorHex }}
        />
        <input
          type="number"
          value={laser.wavelength_nm || ''}
          onChange={(e) =>
            onChange({ ...laser, wavelength_nm: parseInt(e.target.value) || 0 })
          }
          placeholder="Wavelength"
          className="w-20 rounded border border-gray-300 px-2 py-1 text-sm"
          min={1}
        />
        <span className="text-xs text-gray-400">nm</span>
        <input
          type="text"
          value={laser.name}
          onChange={(e) => onChange({ ...laser, name: e.target.value })}
          placeholder="Laser name"
          className="w-40 rounded border border-gray-300 px-2 py-1 text-sm"
        />
        <span className="ml-auto text-xs text-gray-400">
          {laser.detectors.length} detector{laser.detectors.length !== 1 ? 's' : ''}
        </span>
        <button
          onClick={onRemove}
          className="text-sm text-red-500 hover:text-red-700"
          aria-label="Remove laser"
        >
          Remove
        </button>
      </div>

      {!collapsed && (
        <div className="border-t border-gray-100 px-4 pb-3 pt-2">
          {laser.detectors.length === 0 && (
            <p className="py-1 text-xs text-gray-400">No detectors yet.</p>
          )}
          {laser.detectors.map((det, i) => (
            <DetectorRow
              key={i}
              detector={det}
              onChange={(updated) => updateDetector(i, updated)}
              onRemove={() => removeDetector(i)}
            />
          ))}
          <button
            onClick={addDetector}
            className="mt-2 text-sm text-blue-600 hover:text-blue-800"
          >
            + Add Detector
          </button>
        </div>
      )}
    </div>
  )
}

export type { LaserFormData }
