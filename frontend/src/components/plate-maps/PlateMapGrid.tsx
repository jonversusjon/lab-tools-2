import { useCallback } from 'react'
import { PLATE_TYPES, getRowLabels, getColLabels } from '@/utils/plateTypes'
import type { WellDataMap, PlateMapLegend, ColorLayer } from '@/types'

interface PlateMapGridProps {
  plateType: string
  wellData: WellDataMap
  selectedWells: string[]
  legend: PlateMapLegend
  previewWells?: string[]
  readOnly?: boolean
  onWellClick?: (wellId: string, row: number, col: number, event: React.MouseEvent) => void
  onRowClick?: (rowIndex: number, rowLabel: string, event: React.MouseEvent) => void
  onColumnClick?: (colIndex: number, colLabel: string, event: React.MouseEvent) => void
  onContextMenu?: (event: React.MouseEvent, type: 'well' | 'row' | 'column', id: string) => void
  id?: string
}

function isDark(hex: string): boolean {
  const clean = hex.replace('#', '')
  if (clean.length !== 6) return false
  const r = parseInt(clean.slice(0, 2), 16)
  const g = parseInt(clean.slice(2, 4), 16)
  const b = parseInt(clean.slice(4, 6), 16)
  return r * 0.299 + g * 0.587 + b * 0.114 < 128
}

function getWellLabel(
  wellId: string,
  wellData: WellDataMap,
  legend: PlateMapLegend
): string | null {
  const colors = wellData[wellId]
  if (!colors) return null
  const layers: ColorLayer[] = ['fillColor', 'borderColor', 'backgroundColor']
  for (const layer of layers) {
    const hex = colors[layer]
    if (!hex) continue
    const entry = legend.colors?.[layer]?.[hex]
    if (entry?.applyToWells && entry.label) return entry.label
  }
  return null
}

export default function PlateMapGrid({
  plateType,
  wellData,
  selectedWells,
  legend,
  previewWells = [],
  readOnly = false,
  onWellClick,
  onRowClick,
  onColumnClick,
  onContextMenu,
  id,
}: PlateMapGridProps) {
  const config = PLATE_TYPES[plateType]
  if (!config) return <div className="text-red-500 text-sm">Unknown plate type: {plateType}</div>

  const { rows, cols } = config
  const rowLabels = getRowLabels(rows)
  const colLabels = getColLabels(cols)
  const selectedSet = new Set(selectedWells)
  const previewSet = new Set(previewWells)

  const handleWellClick = useCallback(
    (e: React.MouseEvent, wellId: string, row: number, col: number) => {
      if (readOnly || !onWellClick) return
      onWellClick(wellId, row, col, e)
    },
    [readOnly, onWellClick]
  )

  const handleRowClick = useCallback(
    (e: React.MouseEvent, rowIndex: number, rowLabel: string) => {
      if (readOnly || !onRowClick) return
      onRowClick(rowIndex, rowLabel, e)
    },
    [readOnly, onRowClick]
  )

  const handleColClick = useCallback(
    (e: React.MouseEvent, colIndex: number, colLabel: string) => {
      if (readOnly || !onColumnClick) return
      onColumnClick(colIndex, colLabel, e)
    },
    [readOnly, onColumnClick]
  )

  // For non-well plate types (dish, flask, chamber): simple grid without row/col headers
  if (config.type !== 'well') {
    return (
      <div id={id} className="w-full">
        <div
          className="grid gap-2"
          style={{
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gridTemplateRows: `repeat(${rows}, 1fr)`,
          }}
        >
          {rowLabels.map((rowLabel, rowIdx) =>
            colLabels.map((colLabel, colIdx) => {
              const wellId = rowLabel + colLabel
              const colors = wellData[wellId] ?? {}
              const isSelected = selectedSet.has(wellId)
              const isPreview = previewSet.has(wellId)
              const wellLabel = getWellLabel(wellId, wellData, legend)

              return (
                <div
                  key={wellId}
                  data-well-id={wellId}
                  onClick={(e) => handleWellClick(e, wellId, rowIdx, colIdx)}
                  onContextMenu={(e) => {
                    if (onContextMenu) { e.preventDefault(); onContextMenu(e, 'well', wellId) }
                  }}
                  className={
                    'relative flex items-center justify-center rounded-lg border-2 cursor-pointer ' +
                    'min-h-[60px] transition-all duration-100 ' +
                    (isSelected
                      ? 'ring-2 ring-blue-500 dark:ring-blue-400 ring-offset-1'
                      : '') +
                    (isPreview ? ' ring-2 ring-blue-300 dark:ring-yellow-300 ring-offset-1' : '')
                  }
                  style={{
                    backgroundColor: colors.backgroundColor ?? undefined,
                    borderColor: colors.borderColor ?? '#d1d5db',
                  }}
                >
                  <div
                    className="absolute inset-2 rounded flex items-center justify-center"
                    style={{ backgroundColor: colors.fillColor ?? undefined }}
                  >
                    {wellLabel && (
                      <span
                        className="text-xs font-medium px-1 text-center leading-tight"
                        style={{ color: colors.fillColor ? (isDark(colors.fillColor) ? '#fff' : '#111') : undefined }}
                      >
                        {wellLabel}
                      </span>
                    )}
                  </div>
                  <span className="absolute bottom-1 right-1 text-xs text-gray-400 dark:text-gray-500">
                    {wellId}
                  </span>
                </div>
              )
            })
          )}
        </div>
      </div>
    )
  }

  // Well plate layout with row/column headers
  return (
    <div id={id} className="w-full overflow-auto">
      <div
        className="inline-grid"
        style={{
          gridTemplateColumns: `auto repeat(${cols}, minmax(0, 1fr))`,
          gridTemplateRows: `auto repeat(${rows}, minmax(0, 1fr))`,
          gap: rows >= 16 ? '2px' : rows >= 8 ? '3px' : '4px',
        }}
      >
        {/* Top-left empty corner */}
        <div />

        {/* Column headers */}
        {colLabels.map((colLabel, colIdx) => (
          <button
            key={colLabel}
            type="button"
            disabled={readOnly}
            onClick={(e) => handleColClick(e, colIdx, colLabel)}
            className={
              'flex items-center justify-center rounded text-center font-medium ' +
              (rows >= 16 ? 'text-[9px] py-0.5' : rows >= 8 ? 'text-xs py-1' : 'text-sm py-1') +
              ' text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 ' +
              (readOnly ? 'cursor-default' : 'cursor-pointer')
            }
          >
            {colLabel}
          </button>
        ))}

        {/* Rows */}
        {rowLabels.map((rowLabel, rowIdx) => (
          <>
            {/* Row header */}
            <button
              key={'row-' + rowLabel}
              type="button"
              disabled={readOnly}
              onClick={(e) => handleRowClick(e, rowIdx, rowLabel)}
              className={
                'flex items-center justify-center rounded font-medium ' +
                (rows >= 16 ? 'text-[9px] px-0.5' : rows >= 8 ? 'text-xs px-1' : 'text-sm px-2') +
                ' text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 ' +
                (readOnly ? 'cursor-default' : 'cursor-pointer')
              }
            >
              {rowLabel}
            </button>

            {/* Wells in this row */}
            {colLabels.map((colLabel, colIdx) => {
              const wellId = rowLabel + colLabel
              const colors = wellData[wellId] ?? {}
              const isSelected = selectedSet.has(wellId)
              const isPreview = previewSet.has(wellId)
              const wellLabel = getWellLabel(wellId, wellData, legend)
              const wellSize = rows >= 16 ? 'w-5 h-5' : rows >= 8 ? 'w-7 h-7' : 'w-10 h-10'

              return (
                <div
                  key={wellId}
                  data-well-id={wellId}
                  onClick={(e) => handleWellClick(e, wellId, rowIdx, colIdx)}
                  onContextMenu={(e) => {
                    if (onContextMenu) { e.preventDefault(); onContextMenu(e, 'well', wellId) }
                  }}
                  className={
                    'relative flex items-center justify-center rounded-sm ' +
                    (readOnly ? 'cursor-default' : 'cursor-pointer') +
                    ' transition-all duration-75'
                  }
                  style={{
                    backgroundColor: colors.backgroundColor ?? 'var(--well-bg)',
                  }}
                >
                  <div
                    className={
                      'rounded-full flex items-center justify-center ' +
                      wellSize +
                      (isSelected
                        ? ' outline outline-2 outline-offset-1 outline-blue-500 dark:outline-blue-400'
                        : '') +
                      (isPreview && !isSelected
                        ? ' outline outline-2 outline-offset-1 outline-blue-300 dark:outline-yellow-300'
                        : '')
                    }
                    style={{
                      backgroundColor: colors.fillColor ?? 'var(--well-fill)',
                      borderWidth: colors.borderColor ? 2 : 1,
                      borderStyle: 'solid',
                      borderColor: colors.borderColor ?? 'var(--well-border)',
                    }}
                  >
                    {wellLabel && (
                      <span
                        className={
                          'font-medium text-center leading-tight overflow-hidden ' +
                          (rows >= 16 ? 'text-[5px]' : rows >= 8 ? 'text-[7px]' : 'text-[9px]')
                        }
                        style={{
                          color: colors.fillColor
                            ? isDark(colors.fillColor) ? '#fff' : '#111'
                            : 'var(--well-text)',
                          maxWidth: '100%',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                        }}
                      >
                        {wellLabel}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </>
        ))}
      </div>
    </div>
  )
}
