import { useState, useEffect } from 'react'
import { TAILWIND_COLORS } from '@/utils/plateMapColors'
import { PLATE_CATEGORIES } from '@/utils/plateTypes'
import type { ColorLayer, PlateType } from '@/types'

const PRESETS_KEY = 'plate-map-color-presets'

function loadPresets(): string[] {
  try {
    const raw = localStorage.getItem(PRESETS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function savePresets(presets: string[]) {
  try {
    localStorage.setItem(PRESETS_KEY, JSON.stringify(presets))
  } catch {
    // ignore
  }
}

interface PlateMapControlsProps {
  plateType: string
  activeLayer: ColorLayer
  currentColors: Record<ColorLayer, string>
  selectedWellCount: number
  canUndo: boolean
  saveStatus: 'idle' | 'saving' | 'saved' | 'error'
  onPlateTypeChange: (type: PlateType) => void
  onLayerChange: (layer: ColorLayer) => void
  onApplyColor: (color: string) => void
  onRemoveColor: () => void
  onClearSelection: () => void
  onResetPlate: () => void
  onUndo: () => void
}

const LAYER_LABELS: Record<ColorLayer, string> = {
  fillColor: 'Fill',
  borderColor: 'Border',
  backgroundColor: 'Background',
}

export default function PlateMapControls({
  plateType,
  activeLayer,
  currentColors,
  selectedWellCount,
  canUndo,
  saveStatus,
  onPlateTypeChange,
  onLayerChange,
  onApplyColor,
  onRemoveColor,
  onClearSelection,
  onResetPlate,
  onUndo,
}: PlateMapControlsProps) {
  const [customHex, setCustomHex] = useState('')
  const [presets, setPresets] = useState<string[]>(loadPresets)

  const activeColor = currentColors[activeLayer]

  useEffect(() => {
    savePresets(presets)
  }, [presets])

  const handleAddPreset = () => {
    const hex = customHex.trim()
    if (!hex || presets.includes(hex)) return
    setPresets((prev) => [...prev, hex])
  }

  const handleDeletePreset = (hex: string) => {
    setPresets((prev) => prev.filter((p) => p !== hex))
  }

  const inputClass =
    'w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1.5 text-sm dark:text-gray-100 focus:border-blue-500 focus:outline-none'
  const btnClass =
    'rounded px-3 py-1.5 text-sm font-medium transition-colors duration-100 '

  return (
    <div className="flex flex-col gap-4 p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
      {/* Plate type selector */}
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">
          Plate Type
        </label>
        <select
          value={plateType}
          onChange={(e) => onPlateTypeChange(e.target.value as PlateType)}
          className={inputClass}
        >
          {Object.entries(PLATE_CATEGORIES).map(([category, types]) => (
            <optgroup key={category} label={category}>
              {types.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      {/* Color layer tabs */}
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">
          Color Layer
        </label>
        <div className="flex rounded border border-gray-200 dark:border-gray-600 overflow-hidden">
          {(Object.keys(LAYER_LABELS) as ColorLayer[]).map((layer) => (
            <button
              key={layer}
              type="button"
              onClick={() => onLayerChange(layer)}
              className={
                'flex-1 py-1.5 text-xs font-medium transition-colors duration-100 ' +
                (activeLayer === layer
                  ? 'bg-blue-600 text-white'
                  : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600')
              }
            >
              {LAYER_LABELS[layer]}
            </button>
          ))}
        </div>
        {activeColor && (
          <div className="mt-1 flex items-center gap-2">
            <div
              className="w-4 h-4 rounded border border-gray-300 dark:border-gray-600"
              style={{ backgroundColor: activeColor }}
            />
            <span className="text-xs text-gray-500 dark:text-gray-400">{activeColor}</span>
          </div>
        )}
      </div>

      {/* Color palette */}
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">
          Color Palette
        </label>
        <div className="flex flex-col gap-0.5">
          {/* None swatch */}
          <div className="flex items-center gap-1 mb-1">
            <button
              type="button"
              title="Remove color"
              onClick={onRemoveColor}
              className={
                'w-5 h-5 rounded border-2 flex items-center justify-center text-gray-400 hover:text-red-500 ' +
                'border-gray-300 dark:border-gray-600 hover:border-red-400 transition-colors'
              }
            >
              <span className="text-xs leading-none">✕</span>
            </button>
            <span className="text-xs text-gray-400 dark:text-gray-500">None</span>
          </div>
          {TAILWIND_COLORS.map((hue) => (
            <div key={hue.name} className="flex gap-0.5">
              {hue.shades.map((swatch) => (
                <button
                  key={swatch.hex}
                  type="button"
                  title={swatch.name}
                  onClick={() => onApplyColor(swatch.hex)}
                  className={
                    'w-4 h-4 rounded-sm border transition-transform duration-75 hover:scale-125 ' +
                    (activeColor === swatch.hex
                      ? 'border-gray-900 dark:border-white ring-1 ring-offset-1 ring-blue-500'
                      : 'border-transparent hover:border-gray-400')
                  }
                  style={{ backgroundColor: swatch.hex }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Custom hex */}
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">
          Custom Hex
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={customHex}
            onChange={(e) => setCustomHex(e.target.value)}
            placeholder="#3b82f6"
            className={inputClass + ' font-mono'}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const hex = customHex.trim()
                if (hex) onApplyColor(hex)
              }
            }}
          />
          <button
            type="button"
            onClick={() => {
              const hex = customHex.trim()
              if (hex) onApplyColor(hex)
            }}
            className={btnClass + 'bg-blue-600 text-white hover:bg-blue-700'}
          >
            Apply
          </button>
        </div>
      </div>

      {/* Presets */}
      {presets.length > 0 && (
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">
            Presets
          </label>
          <div className="flex flex-wrap gap-1.5">
            {presets.map((hex) => (
              <div key={hex} className="relative group">
                <button
                  type="button"
                  title={hex}
                  onClick={() => onApplyColor(hex)}
                  className="w-6 h-6 rounded border border-gray-300 dark:border-gray-600 hover:scale-110 transition-transform"
                  style={{ backgroundColor: hex }}
                />
                <button
                  type="button"
                  onClick={() => handleDeletePreset(hex)}
                  className="absolute -top-1 -right-1 hidden group-hover:flex w-3.5 h-3.5 items-center justify-center rounded-full bg-red-500 text-white text-[8px] leading-none"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={handleAddPreset}
            className="mt-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            + Save {customHex || 'current'} as preset
          </button>
        </div>
      )}
      {presets.length === 0 && (
        <button
          type="button"
          onClick={handleAddPreset}
          className="text-xs text-blue-600 dark:text-blue-400 hover:underline text-left"
        >
          + Save {customHex || 'a color'} as preset
        </button>
      )}

      {/* Actions */}
      <div className="flex flex-col gap-2 border-t border-gray-200 dark:border-gray-700 pt-3">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClearSelection}
            disabled={selectedWellCount === 0}
            className={btnClass + 'flex-1 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40'}
          >
            Clear Selection
            {selectedWellCount > 0 && (
              <span className="ml-1 text-xs text-gray-500">({selectedWellCount})</span>
            )}
          </button>
          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
            className={btnClass + 'border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40'}
          >
            ↩ Undo
          </button>
        </div>
        <button
          type="button"
          onClick={() => {
            if (confirm('Reset all well colors? This cannot be undone.')) onResetPlate()
          }}
          className={btnClass + 'border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'}
        >
          Reset Plate
        </button>
        <div className="text-xs text-center text-gray-400 dark:text-gray-500">
          {saveStatus === 'saving' && 'Saving...'}
          {saveStatus === 'saved' && '✓ Saved'}
          {saveStatus === 'error' && '⚠ Save failed'}
        </div>
      </div>
    </div>
  )
}
