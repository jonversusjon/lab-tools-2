import { useState } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { WellDataMap, PlateMapLegend, ColorLayer, LegendColorEntry } from '@/types'

const LAYER_LABELS: Record<ColorLayer, string> = {
  fillColor: 'Fill',
  borderColor: 'Border',
  backgroundColor: 'Background',
}

interface LegendItemProps {
  id: string
  hex: string
  layer: ColorLayer
  entry: LegendColorEntry
  readOnly: boolean
  wellIds: string[]
  onLabelChange: (label: string) => void
  onApplyToWellsChange: (checked: boolean) => void
  onColorChange?: (newHex: string) => void
}

function LegendItem({
  id,
  hex,
  layer: _layer,
  entry,
  readOnly,
  wellIds,
  onLabelChange,
  onApplyToWellsChange,
  onColorChange,
}: LegendItemProps) {
  const [expanded, setExpanded] = useState(false)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  })

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      className={
        'rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 ' +
        (isDragging ? 'opacity-50 shadow-lg' : '')
      }
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      <div className="flex items-center gap-2 p-2">
        {!readOnly && (
          <button
            type="button"
            {...listeners}
            className="cursor-grab text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 touch-none shrink-0"
            aria-label="Drag to reorder"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
              <path d="M5 4a1 1 0 100-2 1 1 0 000 2zM11 4a1 1 0 100-2 1 1 0 000 2zM5 9a1 1 0 100-2 1 1 0 000 2zM11 9a1 1 0 100-2 1 1 0 000 2zM5 14a1 1 0 100-2 1 1 0 000 2zM11 14a1 1 0 100-2 1 1 0 000 2z" />
            </svg>
          </button>
        )}
        {onColorChange ? (
          <label
            className="w-5 h-5 rounded-full shrink-0 block cursor-pointer border border-gray-300 dark:border-gray-600 overflow-hidden"
            style={{ backgroundColor: hex }}
            title="Change border color"
          >
            <input
              type="color"
              value={hex}
              onChange={(e) => onColorChange(e.target.value)}
              className="sr-only"
            />
          </label>
        ) : (
          <div
            className="w-5 h-5 rounded-full shrink-0 border border-gray-300 dark:border-gray-600"
            style={{ backgroundColor: hex }}
          />
        )}
        {readOnly ? (
          <span className="flex-1 text-sm text-gray-700 dark:text-gray-300">
            {entry.label || hex}
          </span>
        ) : (
          <input
            type="text"
            value={entry.label}
            onChange={(e) => onLabelChange(e.target.value)}
            placeholder="Add label"
            className="flex-1 rounded border border-transparent hover:border-gray-300 dark:hover:border-gray-600 focus:border-blue-500 dark:focus:border-blue-400 bg-transparent px-1 py-0.5 text-sm text-gray-700 dark:text-gray-300 focus:outline-none"
          />
        )}
        {!readOnly && (
          <label className="flex items-center gap-1 shrink-0 cursor-pointer" title="Show label on wells">
            <input
              type="checkbox"
              checked={entry.applyToWells}
              onChange={(e) => onApplyToWellsChange(e.target.checked)}
              className="rounded"
            />
            <span className="text-xs text-gray-500 dark:text-gray-400">Show</span>
          </label>
        )}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="shrink-0 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
        >
          {wellIds.length} well{wellIds.length !== 1 ? 's' : ''} {expanded ? '▲' : '▼'}
        </button>
      </div>
      {expanded && (
        <div className="px-2 pb-2">
          <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">
            {wellIds.slice(0, 20).join(', ')}
            {wellIds.length > 20 && ` …+${wellIds.length - 20} more`}
          </p>
        </div>
      )}
    </div>
  )
}

interface PlateMapLegendPanelProps {
  wellData: WellDataMap
  legend: PlateMapLegend
  readOnly?: boolean
  onLegendChange?: (legend: PlateMapLegend) => void
  onWellDataChange?: (data: WellDataMap) => void
}

function buildEmptyLegend(): PlateMapLegend {
  return {
    colors: { fillColor: {}, borderColor: {}, backgroundColor: {} },
    colorOrder: { fillColor: [], borderColor: [], backgroundColor: [] },
  }
}

export default function PlateMapLegendPanel({
  wellData,
  legend,
  readOnly = false,
  onLegendChange,
  onWellDataChange,
}: PlateMapLegendPanelProps) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const safeLegend: PlateMapLegend = {
    colors: {
      fillColor: legend.colors?.fillColor ?? {},
      borderColor: legend.colors?.borderColor ?? {},
      backgroundColor: legend.colors?.backgroundColor ?? {},
    },
    colorOrder: {
      fillColor: legend.colorOrder?.fillColor ?? [],
      borderColor: legend.colorOrder?.borderColor ?? [],
      backgroundColor: legend.colorOrder?.backgroundColor ?? [],
    },
  }

  // Collect colors actually used in wellData
  const usedColors: Record<ColorLayer, Set<string>> = {
    fillColor: new Set(),
    borderColor: new Set(),
    backgroundColor: new Set(),
  }
  for (const colors of Object.values(wellData)) {
    if (colors.fillColor) usedColors.fillColor.add(colors.fillColor)
    if (colors.borderColor) usedColors.borderColor.add(colors.borderColor)
    if (colors.backgroundColor) usedColors.backgroundColor.add(colors.backgroundColor)
  }

  // Wells per color
  function getWellsForColor(layer: ColorLayer, hex: string): string[] {
    return Object.entries(wellData)
      .filter(([, c]) => c[layer] === hex)
      .map(([id]) => id)
  }

  const layers: ColorLayer[] = ['fillColor', 'borderColor', 'backgroundColor']
  const hasAny = layers.some((l) => usedColors[l].size > 0)

  if (!hasAny) {
    return (
      <div className="text-sm text-gray-400 dark:text-gray-500 py-4 text-center">
        No colors applied yet.
      </div>
    )
  }

  function handleColorChange(layer: ColorLayer, oldHex: string, newHex: string) {
    if (oldHex === newHex) return
    if (onWellDataChange) {
      const nextWellData: WellDataMap = {}
      for (const [wellId, colors] of Object.entries(wellData)) {
        nextWellData[wellId] = colors[layer] === oldHex
          ? { ...colors, [layer]: newHex }
          : colors
      }
      onWellDataChange(nextWellData)
    }
    if (onLegendChange) {
      const next = JSON.parse(JSON.stringify(safeLegend)) as PlateMapLegend
      const entry = next.colors[layer][oldHex]
      if (entry) {
        next.colors[layer][newHex] = entry
        delete next.colors[layer][oldHex]
      }
      if (next.colorOrder[layer]) {
        next.colorOrder[layer] = next.colorOrder[layer].map((h) => h === oldHex ? newHex : h)
      }
      onLegendChange(next)
    }
  }

  function updateEntry(layer: ColorLayer, hex: string, patch: Partial<LegendColorEntry>) {
    if (!onLegendChange) return
    const next = JSON.parse(JSON.stringify(safeLegend)) as PlateMapLegend
    const existing = next.colors[layer][hex] ?? { label: '', applyToWells: false }
    next.colors[layer][hex] = { ...existing, ...patch }
    onLegendChange(next)
  }

  function handleDragEnd(layer: ColorLayer, event: DragEndEvent) {
    if (!onLegendChange) return
    const { active, over } = event
    if (!over || active.id === over.id) return
    const order = [...(safeLegend.colorOrder[layer] ?? [])]
    const oldIdx = order.indexOf(active.id as string)
    const newIdx = order.indexOf(over.id as string)
    if (oldIdx < 0 || newIdx < 0) return
    const next = JSON.parse(JSON.stringify(safeLegend)) as PlateMapLegend
    next.colorOrder[layer] = arrayMove(order, oldIdx, newIdx)
    onLegendChange(next)
  }

  return (
    <div className="flex flex-col gap-4">
      {layers.map((layer) => {
        const hexSet = usedColors[layer]
        if (hexSet.size === 0) return null

        // Build ordered list: items in colorOrder first, then any not yet in order
        const order = safeLegend.colorOrder[layer] ?? []
        const orderedHexes = [
          ...order.filter((h) => hexSet.has(h)),
          ...Array.from(hexSet).filter((h) => !order.includes(h)),
        ]

        return (
          <div key={layer}>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
              {LAYER_LABELS[layer]}
            </h3>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={(e) => handleDragEnd(layer, e)}
            >
              <SortableContext items={orderedHexes} strategy={verticalListSortingStrategy}>
                <div className="flex flex-col gap-1.5">
                  {orderedHexes.map((hex) => {
                    const entry = safeLegend.colors[layer][hex] ?? { label: '', applyToWells: false }
                    const wellIds = getWellsForColor(layer, hex)
                    return (
                      <LegendItem
                        key={hex}
                        id={hex}
                        hex={hex}
                        layer={layer}
                        entry={entry}
                        readOnly={readOnly}
                        wellIds={wellIds}
                        onLabelChange={(label) => updateEntry(layer, hex, { label })}
                        onApplyToWellsChange={(checked) => updateEntry(layer, hex, { applyToWells: checked })}
                        onColorChange={
                          !readOnly && layer === 'borderColor'
                            ? (newHex) => handleColorChange(layer, hex, newHex)
                            : undefined
                        }
                      />
                    )
                  })}
                </div>
              </SortableContext>
            </DndContext>
          </div>
        )
      })}
    </div>
  )
}

export { buildEmptyLegend }
