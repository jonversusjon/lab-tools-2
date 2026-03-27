import { Fragment } from 'react'
import { heatmapColor, heatmapColorDark } from '@/utils/colors'
import { useTheme } from '@/components/layout/ThemeContext'

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

  if (n === 0) {
    return (
      <div className="rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-6 py-8 text-center text-gray-400 dark:text-gray-500">
        Add fluorophore assignments to see spillover matrix
      </div>
    )
  }

  const diagonalBg = isDark ? '#374151' : '#F3F4F6'
  const zeroBg = isDark ? '#1F2937' : '#FFFFFF'
  const colorFn = isDark ? heatmapColorDark : heatmapColor
  const cellTextColor = isDark ? '#E5E7EB' : undefined

  return (
    <div className="rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
      <h3 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">Spillover Matrix</h3>

      {/* Warning banner for fluorophores missing spectral data */}
      {missingSpectraWarnings.length > 0 && (
        <div className="mb-3 rounded border border-yellow-300 dark:border-yellow-700 bg-yellow-50 dark:bg-yellow-900/20 px-3 py-2">
          {missingSpectraWarnings.map((name) => (
            <p key={name} className="text-xs text-yellow-700 dark:text-yellow-400">
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
              className="px-1 py-1 text-center text-xs font-medium text-gray-500 dark:text-gray-400 truncate"
              title={labels[0]}
            >
              {labels[0]}
            </div>
            <div
              className="px-2 py-1 text-xs font-medium text-gray-500 dark:text-gray-400 truncate"
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
          <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
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
                className="px-1 py-1 text-center text-xs font-medium text-gray-500 dark:text-gray-400 truncate"
                title={label}
              >
                {label}
              </div>
            ))}

            {/* Data rows */}
            {matrix.map((row, i) => (
              <Fragment key={'row-' + i}>
                <div
                  className="flex items-center px-2 py-1 text-xs font-medium text-gray-500 dark:text-gray-400 truncate"
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
    </div>
  )
}
