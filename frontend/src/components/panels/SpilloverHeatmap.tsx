import { Fragment, useState } from 'react'
import { heatmapColor, heatmapColorDark, readableTextColor } from '@/utils/colors'
import { useTheme } from '@/components/layout/ThemeContext'

const STORAGE_KEY = 'spillover-matrix-collapsed'

function getInitialCollapsed(): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored === null ? true : stored === 'true'
  } catch {
    return true
  }
}

/**
 * Diagonal (45°) column header. Fluorophore names are too long to fit a
 * matrix cell's width horizontally, so they're rotated and anchored at the
 * bottom of a tall header row. `whitespace-nowrap` keeps them from wrapping or
 * truncating; the row height gives the angled text room.
 */
function ColumnHeader({
  label,
  heightClass,
  textClass,
}: {
  label: string
  heightClass: string
  textClass: string
}) {
  return (
    <div className={'relative ' + heightClass} title={label}>
      <span
        className={
          'absolute bottom-1 left-1/2 origin-bottom-left -rotate-45 whitespace-nowrap font-medium text-foreground-muted ' +
          textClass
        }
      >
        {label}
      </span>
    </div>
  )
}

interface SpilloverHeatmapProps {
  labels: string[]
  matrix: (number | null)[][]
  missingSpectraWarnings?: string[]
  /**
   * Render for the narrow experiment rail: smaller cells, tighter padding and
   * slightly smaller text so the matrix fits a portrait footprint.
   */
  compact?: boolean
}

export default function SpilloverHeatmap({
  labels,
  matrix,
  missingSpectraWarnings = [],
  compact = false,
}: SpilloverHeatmapProps) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const n = labels.length

  // Cell sizing shrinks in compact (rail) mode so the matrix fits the portrait
  // footprint without forcing horizontal scroll for typical panels.
  const cellPx = compact ? 38 : 50
  const cellSize = String(cellPx) + 'px'
  const cellSizeClass = compact ? 'h-[38px]' : 'h-[50px]'

  // Angled column headers need a tall row so long fluorophore names aren't cut
  // off. Slightly shorter + smaller text in the compact rail.
  const headerHeightClass = compact ? 'h-24' : 'h-28'
  const headerTextClass = compact ? 'text-[10px]' : 'text-xs'

  const [collapsed, setCollapsed] = useState(getInitialCollapsed)

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev
      try { localStorage.setItem(STORAGE_KEY, String(next)) } catch {}
      return next
    })
  }

  const diagonalBg = isDark ? '#374151' : '#F3F4F6'
  const zeroBg = isDark ? '#1F2937' : '#FFFFFF'
  const colorFn = isDark ? heatmapColorDark : heatmapColor

  // Gradient legend: sample the active scale at even steps so the bar matches
  // exactly what the cells render (including the dark-mode lift).
  const legendGradient =
    'linear-gradient(to right, ' +
    Array.from({ length: 11 }, (_, k) => {
      const t = k / 10
      return colorFn(t) + ' ' + String(t * 100) + '%'
    }).join(', ') +
    ')'

  return (
    <div className="rounded border border-border bg-elevated">
      <button
        type="button"
        className={
          'flex w-full items-center justify-between text-left ' +
          (compact ? 'px-3 py-2' : 'px-4 py-3')
        }
        onClick={toggleCollapsed}
        aria-expanded={!collapsed}
      >
        <h3 className={'font-semibold text-foreground-muted ' + (compact ? 'text-xs' : 'text-sm')}>
          Spillover Matrix
        </h3>
        <svg
          className={'h-4 w-4 text-foreground-muted transition-transform duration-200' + (collapsed ? '' : ' rotate-180')}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {!collapsed && (
        <div className={compact ? 'px-3 pb-3' : 'px-4 pb-4'}>
          {n === 0 ? (
            <p className="py-4 text-center text-sm text-foreground-subtle">
              Add fluorophore assignments to see spillover matrix
            </p>
          ) : (
            <>
              {/* Warning banner for fluorophores missing spectral data */}
              {missingSpectraWarnings.length > 0 && (
                <div className="mb-3 rounded border border-warning bg-warning-soft px-3 py-2">
                  {missingSpectraWarnings.map((name) => (
                    <p key={name} className="text-xs text-warning-soft-foreground">
                      &#9888; <span className="font-medium">{name}</span> has no spectral data — spillover estimates are unavailable for this fluorophore.
                    </p>
                  ))}
                </div>
              )}

              {n === 1 ? (
                <div>
                  <div className="inline-grid pr-12" style={{ gridTemplateColumns: 'auto ' + cellSize }}>
                    <div />
                    <ColumnHeader
                      label={labels[0]}
                      heightClass={headerHeightClass}
                      textClass={headerTextClass}
                    />
                    <div
                      className="px-2 py-1 text-xs font-medium text-foreground-muted truncate"
                      title={labels[0]}
                    >
                      {labels[0]}
                    </div>
                    <div
                      className="flex items-center justify-center text-xs"
                      style={{ height: cellSize, width: cellSize, backgroundColor: diagonalBg, color: readableTextColor(diagonalBg) }}
                    >
                      1.00
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-foreground-subtle">
                    2 or more assignments needed for spillover analysis
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <div
                    className="inline-grid pr-12"
                    style={{
                      gridTemplateColumns: `auto repeat(${n}, minmax(${cellSize}, 1fr))`,
                    }}
                  >
                    {/* Header row: empty corner + angled column labels */}
                    <div />
                    {labels.map((label, j) => (
                      <ColumnHeader
                        key={'col-' + j}
                        label={label}
                        heightClass={headerHeightClass}
                        textClass={headerTextClass}
                      />
                    ))}

                    {/* Data rows */}
                    {matrix.map((row, i) => (
                      <Fragment key={'row-' + i}>
                        <div
                          className="flex items-center px-2 py-1 text-xs font-medium text-foreground-muted truncate"
                          title={labels[i]}
                        >
                          {labels[i]}
                        </div>
                        {row.map((val, j) => {
                          const isDiagonal = i === j
                          const isNull = val === null
                          const isBold = val !== null && val > 0.25 && !isDiagonal
                          const bg = isDiagonal
                            ? diagonalBg
                            : isNull
                              ? zeroBg
                              : colorFn(val)

                          return (
                            <div
                              key={'cell-' + i + '-' + j}
                              className={'flex items-center justify-center text-xs ' + cellSizeClass}
                              style={{ backgroundColor: bg, color: readableTextColor(bg) }}
                              data-testid={'heatmap-cell-' + i + '-' + j}
                            >
                              <span className={isBold ? 'font-bold' : ''}>
                                {isNull ? 'N/A' : val.toFixed(2)}
                              </span>
                            </div>
                          )
                        })}
                      </Fragment>
                    ))}
                  </div>

                  {/* Gradient legend: orients the reader on what the colors mean. */}
                  <div className="mt-3 max-w-md">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] tabular-nums text-foreground-subtle">0.0</span>
                      <div
                        className="h-2 flex-1 rounded-full border border-border"
                        style={{ background: legendGradient }}
                      />
                      <span className="text-[10px] tabular-nums text-foreground-subtle">1.0</span>
                    </div>
                    <p className="mt-1.5 text-[10px] leading-snug text-foreground-subtle">
                      Fraction of a fluorophore&apos;s signal collected by another channel. Higher is worse; <span className="font-bold text-foreground-muted">bold</span> marks ≥ 0.25.
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
