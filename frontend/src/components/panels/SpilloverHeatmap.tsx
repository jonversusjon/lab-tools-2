import { Fragment } from 'react'
import { heatmapColor } from '@/utils/colors'

interface SpilloverHeatmapProps {
  labels: string[]
  matrix: (number | null)[][]
}

export default function SpilloverHeatmap({ labels, matrix }: SpilloverHeatmapProps) {
  const n = labels.length

  if (n === 0) {
    return (
      <div className="rounded border border-gray-200 bg-gray-50 px-6 py-8 text-center text-gray-400">
        Add fluorophore assignments to see spillover matrix
      </div>
    )
  }

  if (n === 1) {
    return (
      <div className="rounded border border-gray-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-gray-700">Spillover Matrix</h3>
        <div className="inline-grid" style={{ gridTemplateColumns: 'auto 50px' }}>
          <div />
          <div className="px-1 py-1 text-center text-xs font-medium text-gray-500 truncate" title={labels[0]}>{labels[0]}</div>
          <div className="px-2 py-1 text-xs font-medium text-gray-500 truncate" title={labels[0]}>{labels[0]}</div>
          <div
            className="flex h-[50px] w-[50px] items-center justify-center text-xs"
            style={{ backgroundColor: '#F3F4F6' }}
          >
            1.00
          </div>
        </div>
        <p className="mt-2 text-xs text-gray-400">
          2 or more assignments needed for spillover analysis
        </p>
      </div>
    )
  }

  return (
    <div className="rounded border border-gray-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-gray-700">Spillover Matrix</h3>
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
              className="px-1 py-1 text-center text-xs font-medium text-gray-500 truncate"
              title={label}
            >
              {label}
            </div>
          ))}

          {/* Data rows */}
          {matrix.map((row, i) => (
            <Fragment key={'row-' + i}>
              <div
                className="flex items-center px-2 py-1 text-xs font-medium text-gray-500 truncate"
                title={labels[i]}
              >
                {labels[i]}
              </div>
              {row.map((val, j) => {
                const isDiagonal = i === j
                const isNull = val === null
                const isBold = val !== null && val > 0.25 && !isDiagonal
                const bg = isDiagonal
                  ? '#F3F4F6'
                  : isNull
                    ? '#FFFFFF'
                    : heatmapColor(val)

                return (
                  <div
                    key={'cell-' + i + '-' + j}
                    className="flex h-[50px] items-center justify-center text-xs"
                    style={{ backgroundColor: bg }}
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
    </div>
  )
}
