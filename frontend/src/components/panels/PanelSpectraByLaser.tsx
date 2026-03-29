import { useState, useMemo } from 'react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js'
import annotationPlugin from 'chartjs-plugin-annotation'
import { Line } from 'react-chartjs-2'
import { excitationEfficiency, downsampleSpectra } from '@/utils/spectra'
import { getLaserColor } from '@/utils/colors'
import { useTheme } from '@/components/layout/ThemeContext'
import type { Instrument, PanelAssignment, FluorophoreWithSpectra } from '@/types'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
  annotationPlugin
)

// Colorblind-safe categorical palette (works on light & dark backgrounds)
const PALETTE = [
  '#0072B2', '#D55E00', '#009E73', '#CC79A7',
  '#E69F00', '#56B4E9', '#F0E442', '#882255',
  '#44AA99', '#AA4499',
]

interface PanelSpectraByLaserProps {
  instrument: Instrument
  assignments: PanelAssignment[]
  fluorophoresWithSpectra?: FluorophoreWithSpectra[]
  allFluorophoresForScoring: FluorophoreWithSpectra[]
}

export default function PanelSpectraByLaser({
  instrument,
  assignments,
  allFluorophoresForScoring,
}: PanelSpectraByLaserProps) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  // Build consistent color map per fluorophore across all laser plots
  const fluorophoreColorMap = useMemo(() => {
    const map = new Map<string, string>()
    const assignedFlIds = [...new Set(assignments.map((a) => a.fluorophore_id))]
    assignedFlIds.forEach((flId, i) => {
      map.set(flId, PALETTE[i % PALETTE.length])
    })
    return map
  }, [assignments])

  // Build detector → laser mapping for determining on-target vs spillover
  const detectorToLaser = useMemo(() => {
    const map = new Map<string, string>()
    for (const laser of instrument.lasers) {
      for (const det of laser.detectors) {
        map.set(det.id, laser.id)
      }
    }
    return map
  }, [instrument])

  // Default collapse state: collapse if > 3 lasers
  const [collapsedLasers, setCollapsedLasers] = useState<Set<string>>(() => {
    if (instrument.lasers.length > 3) {
      return new Set(instrument.lasers.map((l) => l.id))
    }
    return new Set()
  })

  const toggleLaser = (laserId: string) => {
    setCollapsedLasers((prev) => {
      const next = new Set(prev)
      if (next.has(laserId)) next.delete(laserId)
      else next.add(laserId)
      return next
    })
  }

  if (assignments.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-gray-400 dark:text-gray-500">
        Assign fluorophores to detectors to see per-laser spectra
      </p>
    )
  }

  return (
    <div className="space-y-3 pt-3">
      {instrument.lasers.map((laser) => {
        const laserColor = getLaserColor(laser.wavelength_nm)
        const isCollapsed = collapsedLasers.has(laser.id)

        // Find assigned fluorophores excited by this laser (>= 5% efficiency)
        const excitedFluorophores = assignments
          .map((a) => {
            const fl = allFluorophoresForScoring.find((f) => f.id === a.fluorophore_id)
            if (!fl) return null
            const excEff = excitationEfficiency(fl, laser.wavelength_nm)
            if (excEff < 0.05) return null
            return { fl, assignment: a, excEff }
          })
          .filter((x): x is NonNullable<typeof x> => x !== null)

        const excitedCount = excitedFluorophores.length

        return (
          <div key={laser.id} className="rounded border border-gray-200 dark:border-gray-700">
            <button
              onClick={() => toggleLaser(laser.id)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              <span
                className="inline-block h-3 w-3 rounded-full"
                style={{ backgroundColor: laserColor }}
              />
              <span className="dark:text-gray-200">
                {laser.wavelength_nm}nm {laser.name}
              </span>
              <span className="text-xs text-gray-400 dark:text-gray-500">
                ({excitedCount} fluorophore{excitedCount !== 1 ? 's' : ''})
              </span>
              <span className="ml-auto text-xs text-gray-400">
                {isCollapsed ? '\u25B6' : '\u25BC'}
              </span>
            </button>
            {!isCollapsed && (
              <div className="border-t border-gray-100 dark:border-gray-700 px-3 pb-3">
                {excitedCount === 0 ? (
                  <p className="py-3 text-center text-xs text-gray-400 dark:text-gray-500">
                    No assigned fluorophores excited by this laser
                  </p>
                ) : (
                  <LaserSpectraChart
                    laser={laser}
                    laserColor={laserColor}
                    excitedFluorophores={excitedFluorophores}
                    detectorToLaser={detectorToLaser}
                    fluorophoreColorMap={fluorophoreColorMap}
                    isDark={isDark}
                  />
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

interface LaserSpectraChartProps {
  laser: Instrument['lasers'][number]
  laserColor: string
  excitedFluorophores: Array<{
    fl: FluorophoreWithSpectra
    assignment: PanelAssignment
    excEff: number
  }>
  detectorToLaser: Map<string, string>
  fluorophoreColorMap: Map<string, string>
  isDark: boolean
}

function LaserSpectraChart({
  laser,
  laserColor,
  excitedFluorophores,
  detectorToLaser,
  fluorophoreColorMap,
  isDark,
}: LaserSpectraChartProps) {
  const tickColor = isDark ? '#9CA3AF' : '#374151'
  const gridColor = isDark ? '#374151' : '#E5E7EB'
  const legendColor = isDark ? '#D1D5DB' : '#374151'

  // Build datasets
  const datasets: Array<{
    label: string
    data: Array<{ x: number; y: number }>
    borderColor: string
    backgroundColor: string
    borderDash?: number[]
    borderWidth: number
    fill: boolean | string
    tension: number
    pointRadius: number
  }> = []

  for (const { fl, assignment, excEff } of excitedFluorophores) {
    const em = fl.spectra?.EM
    if (!em || em.length === 0) continue

    const color = fluorophoreColorMap.get(fl.id) ?? '#888888'
    // Is this fluorophore assigned to a detector on THIS laser?
    const assignedLaserId = detectorToLaser.get(assignment.detector_id)
    const isOnTarget = assignedLaserId === laser.id

    const downsampled = downsampleSpectra(em, 2)
    const scaledData = downsampled.map(([wl, intensity]) => ({
      x: wl,
      y: intensity * excEff,
    }))

    datasets.push({
      label: fl.name + (isOnTarget ? '' : ' (spillover)'),
      data: scaledData,
      borderColor: color,
      backgroundColor: color + (isOnTarget ? '30' : '12'),
      borderDash: isOnTarget ? undefined : [6, 3],
      borderWidth: isOnTarget ? 1.5 : 1,
      fill: true,
      tension: 0.1,
      pointRadius: 0,
    })
  }

  // Build detector bandpass annotations
  const annotations: Record<string, object> = {}
  for (const det of laser.detectors) {
    const low = det.filter_midpoint - det.filter_width / 2
    const high = det.filter_midpoint + det.filter_width / 2
    annotations['det-' + det.id] = {
      type: 'box' as const,
      xMin: low,
      xMax: high,
      backgroundColor: laserColor + '18',
      borderColor: laserColor + '40',
      borderWidth: 1,
    }
  }

  // Add laser line annotation
  annotations['laser-line'] = {
    type: 'line' as const,
    xMin: laser.wavelength_nm,
    xMax: laser.wavelength_nm,
    borderColor: laserColor + '80',
    borderWidth: 1.5,
    borderDash: [4, 4],
    label: {
      display: true,
      content: laser.wavelength_nm + 'nm',
      position: 'start' as const,
      font: { size: 10 },
      color: tickColor,
    },
  }

  const options = {
    responsive: true,
    animation: false as const,
    scales: {
      x: {
        type: 'linear' as const,
        min: 400,
        max: 850,
        ticks: { stepSize: 50, color: tickColor },
        title: { display: true, text: 'Wavelength (nm)', color: tickColor },
        grid: { color: gridColor },
      },
      y: {
        min: 0,
        max: 1,
        ticks: { stepSize: 0.25, color: tickColor },
        title: { display: true, text: 'Relative Yield', color: tickColor },
        grid: { color: gridColor },
      },
    },
    elements: {
      point: { radius: 0 },
      line: { tension: 0.1 },
    },
    plugins: {
      annotation: { annotations },
      legend: {
        labels: { color: legendColor, usePointStyle: true },
      },
      tooltip: {
        callbacks: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          label: (ctx: any) =>
            (ctx.dataset.label ?? '') +
            ': ' +
            (ctx.parsed.x ?? 0).toFixed(0) +
            'nm, ' +
            (ctx.parsed.y ?? 0).toFixed(3),
        },
      },
    },
  }

  return (
    <div className="h-56 w-full">
      <Line data={{ datasets }} options={options} />
    </div>
  )
}
