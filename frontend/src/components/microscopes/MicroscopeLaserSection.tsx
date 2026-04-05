import { useState } from 'react'
import { getLaserColor } from '@/utils/colors'

export interface FilterFormData {
  filter_midpoint: number
  filter_width: number
  name: string
}

export interface MicroscopeLaserFormData {
  wavelength_nm: number
  name: string
  filters: FilterFormData[]
}

interface FilterRowProps {
  filter: FilterFormData
  onChange: (updated: FilterFormData) => void
  onRemove: () => void
}

function FilterRow({ filter, onChange, onRemove }: FilterRowProps) {
  const low = filter.filter_midpoint - Math.floor(filter.filter_width / 2)
  const high = filter.filter_midpoint + Math.floor(filter.filter_width / 2)

  return (
    <div className="flex items-center gap-3 py-1.5">
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          value={filter.filter_midpoint || ''}
          onChange={(e) =>
            onChange({ ...filter, filter_midpoint: parseInt(e.target.value) || 0 })
          }
          placeholder="Midpoint"
          className="w-20 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1 text-sm dark:text-gray-100"
          min={1}
        />
        <span className="text-gray-400 dark:text-gray-500">/</span>
        <input
          type="number"
          value={filter.filter_width || ''}
          onChange={(e) =>
            onChange({ ...filter, filter_width: parseInt(e.target.value) || 0 })
          }
          placeholder="Width"
          className="w-16 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1 text-sm dark:text-gray-100"
          min={1}
        />
      </div>
      <input
        type="text"
        value={filter.name}
        onChange={(e) => onChange({ ...filter, name: e.target.value })}
        placeholder="Name (optional)"
        className="w-32 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1 text-sm dark:text-gray-100"
      />
      {filter.filter_midpoint > 0 && filter.filter_width > 0 && (
        <span className="text-xs text-gray-400 dark:text-gray-500">
          {low}&ndash;{high} nm
        </span>
      )}
      <button
        onClick={onRemove}
        className="ml-auto text-sm text-red-500 hover:text-red-700"
        aria-label="Remove filter"
      >
        Remove
      </button>
    </div>
  )
}

interface MicroscopeLaserSectionProps {
  laser: MicroscopeLaserFormData
  onChange: (updated: MicroscopeLaserFormData) => void
  onRemove: () => void
}

export default function MicroscopeLaserSection({ laser, onChange, onRemove }: MicroscopeLaserSectionProps) {
  const [collapsed, setCollapsed] = useState(false)
  const colorHex = getLaserColor(laser.wavelength_nm)

  const updateFilter = (index: number, updated: FilterFormData) => {
    const filters = [...laser.filters]
    filters[index] = updated
    onChange({ ...laser, filters })
  }

  const removeFilter = (index: number) => {
    const filters = laser.filters.filter((_, i) => i !== index)
    onChange({ ...laser, filters })
  }

  const addFilter = () => {
    onChange({
      ...laser,
      filters: [
        ...laser.filters,
        { filter_midpoint: 0, filter_width: 0, name: '' },
      ],
    })
  }

  return (
    <div className="rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
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
          className="w-20 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1 text-sm dark:text-gray-100"
          min={1}
        />
        <span className="text-xs text-gray-400 dark:text-gray-500">nm</span>
        <input
          type="text"
          value={laser.name}
          onChange={(e) => onChange({ ...laser, name: e.target.value })}
          placeholder="Laser name"
          className="w-40 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1 text-sm dark:text-gray-100"
        />
        <span className="ml-auto text-xs text-gray-400 dark:text-gray-500">
          {laser.filters.length} filter{laser.filters.length !== 1 ? 's' : ''}
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
        <div className="border-t border-gray-100 dark:border-gray-700 px-4 pb-3 pt-2">
          {laser.filters.length === 0 && (
            <p className="py-1 text-xs text-gray-400 dark:text-gray-500">No filters yet.</p>
          )}
          {laser.filters.map((fil, i) => (
            <FilterRow
              key={i}
              filter={fil}
              onChange={(updated) => updateFilter(i, updated)}
              onRemove={() => removeFilter(i)}
            />
          ))}
          <button
            onClick={addFilter}
            className="mt-2 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
          >
            + Add Filter
          </button>
        </div>
      )}
    </div>
  )
}
