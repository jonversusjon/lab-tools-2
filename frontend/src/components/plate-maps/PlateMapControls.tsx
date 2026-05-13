import { useState, useEffect, useMemo } from 'react'
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
  const [showFullPalette, setShowFullPalette] = useState(false)

  const activeColor = currentColors[activeLayer]

  useEffect(() => {
    savePresets(presets)
  }, [presets])

  const limitedColors = useMemo(() => {
    return TAILWIND_COLORS
      .filter((_, i) => i % 2 === 0)
      .slice(0, 8)
      .map((hue) => ({
        ...hue,
        shades: hue.shades.filter((_, i) => i % 2 === 0).slice(0, 5),
      }))
  }, [])

  const displayColors = showFullPalette ? TAILWIND_COLORS : limitedColors

  const handleAddPreset = () => {
    const hex = customHex.trim()
    if (!hex || presets.includes(hex)) return
    setPresets((prev) => [...prev, hex])
  }

  const handleDeletePreset = (hex: string) => {
    setPresets((prev) => prev.filter((p) => p !== hex))
  }

  const inputClass =
    'w-full rounded border border-border bg-elevated text-foreground px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none'
  const btnClass =
    'rounded px-3 py-1.5 text-sm font-medium transition-colors duration-100 '

  return (
    <div className="flex flex-col gap-4 p-4 bg-elevated border border-border rounded-lg">
      {/* Plate type selector */}
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wider text-foreground-muted mb-1">
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
        <label className="block text-xs font-semibold uppercase tracking-wider text-foreground-muted mb-1">
          Color Layer
        </label>
        <div className="flex rounded border border-border overflow-hidden">
          {(Object.keys(LAYER_LABELS) as ColorLayer[]).map((layer) => (
            <button
              key={layer}
              type="button"
              onClick={() => onLayerChange(layer)}
              className={
                'flex-1 py-1.5 text-xs font-medium transition-colors duration-100 ' +
                (activeLayer === layer
                  ? 'bg-accent text-accent-foreground'
                  : 'bg-elevated text-foreground-muted hover:bg-hover')
              }
            >
              {LAYER_LABELS[layer]}
            </button>
          ))}
        </div>
        {activeColor && (
          <div className="mt-1 flex items-center gap-2">
            <div
              className="w-4 h-4 rounded border border-border-strong"
              style={{ backgroundColor: activeColor }}
            />
            <span className="text-xs text-foreground-muted">{activeColor}</span>
          </div>
        )}
      </div>

      {/* Color palette */}
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wider text-foreground-muted mb-1">
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
                'w-5 h-5 rounded border-2 flex items-center justify-center text-foreground-subtle hover:text-danger ' +
                'border-border hover:border-danger transition-colors'
              }
            >
              <span className="text-xs leading-none">✕</span>
            </button>
            <span className="text-xs text-foreground-subtle">None</span>
          </div>
          {displayColors.map((hue) => (
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
                      ? 'border-gray-900 dark:border-white ring-1 ring-offset-1 ring-accent' // theme-exempt: swatch selected ring-offset needs explicit color
                      : 'border-transparent hover:border-border-strong')
                  }
                  style={{ backgroundColor: swatch.hex }}
                />
              ))}
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setShowFullPalette((v) => !v)}
          className="mt-1 text-xs text-accent hover:underline"
        >
          {showFullPalette ? 'Show fewer colors' : 'Show all colors'}
        </button>
      </div>

      {/* Custom hex */}
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wider text-foreground-muted mb-1">
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
            className={btnClass + 'bg-accent text-accent-foreground hover:bg-accent-hover'}
          >
            Apply
          </button>
        </div>
      </div>

      {/* Presets */}
      {presets.length > 0 && (
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-foreground-muted mb-1">
            Presets
          </label>
          <div className="flex flex-wrap gap-1.5">
            {presets.map((hex) => (
              <div key={hex} className="relative group">
                <button
                  type="button"
                  title={hex}
                  onClick={() => onApplyColor(hex)}
                  className="w-6 h-6 rounded border border-border-strong hover:scale-110 transition-transform"
                  style={{ backgroundColor: hex }}
                />
                <button
                  type="button"
                  onClick={() => handleDeletePreset(hex)}
                  className="absolute -top-1 -right-1 hidden group-hover:flex w-3.5 h-3.5 items-center justify-center rounded-full bg-danger text-danger-foreground text-[8px] leading-none"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={handleAddPreset}
            className="mt-1 text-xs text-accent hover:underline"
          >
            + Save {customHex || 'current'} as preset
          </button>
        </div>
      )}
      {presets.length === 0 && (
        <button
          type="button"
          onClick={handleAddPreset}
          className="text-xs text-accent hover:underline text-left"
        >
          + Save {customHex || 'a color'} as preset
        </button>
      )}

      {/* Actions */}
      <div className="flex flex-col gap-2 border-t border-border pt-3">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClearSelection}
            disabled={selectedWellCount === 0}
            className={btnClass + 'flex-1 border border-border text-foreground-muted hover:bg-hover disabled:opacity-40'}
          >
            Clear Selection
            {selectedWellCount > 0 && (
              <span className="ml-1 text-xs text-foreground-subtle">({selectedWellCount})</span>
            )}
          </button>
          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
            className={btnClass + 'border border-border text-foreground-muted hover:bg-hover disabled:opacity-40'}
          >
            ↩ Undo
          </button>
        </div>
        <button
          type="button"
          onClick={() => {
            if (confirm('Reset all well colors? This cannot be undone.')) onResetPlate()
          }}
          className={btnClass + 'border border-danger text-danger hover:bg-danger-soft'}
        >
          Reset Plate
        </button>
      </div>
    </div>
  )
}
