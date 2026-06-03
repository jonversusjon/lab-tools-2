import { Fragment, useState } from 'react'
import { heatmapColor, heatmapColorDark } from '@/utils/colors'
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

interface SpilloverHeatmapProps {
  labels: string[]
  matrix: (number | null)[][]
  missingSpectraWarnings?: string[]
}

export default function SpilloverHeatmap({
  labels,
  matrix,
  missingSpectraWarnings = [],
}: SpilloverHeatmapProps) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const n = labels.length

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
  const cellTextColor = isDark ? '#E5E7EB' : undefined

  return (
    <div className="rounded border border-border bg-elevated">
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-3 text-left"
        onClick={toggleCollapsed}
        aria-expanded={!collapsed}
      >
        <h3 className="text-sm font-semibold text-foreground-muted">Spillover Matrix</h3>
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
        <div className="px-4 pb-4">
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
                  <div className="inline-grid" style={{ gridTemplateColumns: 'auto 50px' }}>
                    <div />
                    <div
                      className="px-1 py-1 text-center text-xs font-medium text-foreground-muted truncate"
                      title={labels[0]}
                    >
                      {labels[0]}
                    </div>
                    <div
                      className="px-2 py-1 text-xs font-medium text-foreground-muted truncate"
                      title={labels[0]}
                    >
                      {labels[0]}
                    </div>
                    <div
                      className="flex h-[50px] w-[50px] items-center justify-center text-xs"
                      style={{ backgroundColor: diagonalBg, color: cellTextColor }}
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
                    className="inline-grid"
                    style={{
                      gridTemplateColumns: `auto repeat(${n}, minmax(50px, 1fr))`,
                    }}
                  >
                    {/* Header row: empty corner + column labels */}
                    <div />
                    {labels.map((label, j) => (
                      <div
                        key={'col-' + j}
                        className="px-1 py-1 text-center text-xs font-medium text-foreground-muted truncate"
                        title={label}
                      >
                        {label}
                      </div>
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
                              className="flex h-[50px] items-center justify-center text-xs"
                              style={{ backgroundColor: bg, color: cellTextColor }}
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
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
