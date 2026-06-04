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
import type { Instrument, FluorophoreWithSpectra } from '@/types'

export interface ActiveTarget {
  id: string
  fluorophore_id: string
  detector_id: string | null
}

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

// Which spectrum types to render — mirrors the TypeToggle in the fluorophore
// overlay sidebar (FluorophoreBrowser).
type VisibleTypes = 'EX' | 'EM' | 'both'

function TypeToggle({
  value,
  onChange,
  compact,
}: {
  value: VisibleTypes
  onChange: (v: VisibleTypes) => void
  compact: boolean
}) {
  return (
    <div className="flex overflow-hidden rounded border border-border-strong text-xs">
      {(['EX', 'EM', 'both'] as VisibleTypes[]).map((t) => (
        <button
          key={t}
          onClick={() => onChange(t)}
          className={
            (compact ? 'px-1.5 py-0.5 ' : 'px-2 py-0.5 ') +
            (value === t
              ? 'bg-accent text-accent-foreground'
              : 'bg-elevated text-foreground-muted hover:bg-hover')
          }
        >
          {t === 'both' ? 'Both' : t}
        </button>
      ))}
    </div>
  )
}

interface PanelSpectraByLaserProps {
  instrument: Instrument
  activeTargets: ActiveTarget[]
  allFluorophoresForScoring: FluorophoreWithSpectra[]
  activeDetectors: Set<string>
  /**
   * Render for the narrow experiment rail: taller (square/portrait) charts and
   * slightly smaller text so the curves read well in a portrait footprint.
   */
  compact?: boolean
}

export default function PanelSpectraByLaser({
  instrument,
  activeTargets,
  allFluorophoresForScoring,
  activeDetectors,
  compact = false,
}: PanelSpectraByLaserProps) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  // Build consistent color map per fluorophore across all laser plots
  const fluorophoreColorMap = useMemo(() => {
    const map = new Map<string, string>()
    const assignedFlIds = [...new Set(activeTargets.map((a) => a.fluorophore_id))]
    assignedFlIds.forEach((flId, i) => {
      map.set(flId, PALETTE[i % PALETTE.length])
    })
    return map
  }, [activeTargets])

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

  // Excitation / emission visibility, shared across all per-laser charts.
  const [visibleTypes, setVisibleTypes] = useState<VisibleTypes>('EM')

  if (activeTargets.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-foreground-subtle">
        Assign fluorophores to targets to see per-laser spectra
      </p>
    )
  }

  return (
    <div className="space-y-3 pt-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-foreground-subtle">Spectra</span>
        <TypeToggle value={visibleTypes} onChange={setVisibleTypes} compact={compact} />
      </div>
      {[...instrument.lasers].sort((a, b) => a.wavelength_nm - b.wavelength_nm).map((laser) => {
        const laserColor = getLaserColor(laser.wavelength_nm)
        const isCollapsed = collapsedLasers.has(laser.id)

        // Find assigned fluorophores excited by this laser (>= 5% efficiency)
        const excitedFluorophores = activeTargets
          .map((a) => {
            const fl = allFluorophoresForScoring.find((f) => f.id === a.fluorophore_id)
            if (!fl) return null
            const excEff = excitationEfficiency(fl, laser.wavelength_nm)
            if (excEff < 0.05) return null
            return { fl, target: a, excEff }
          })
          .filter((x): x is NonNullable<typeof x> => x !== null)

        const excitedCount = excitedFluorophores.length

        return (
          <div key={laser.id} className="rounded border border-border">
            <button
              onClick={() => toggleLaser(laser.id)}
              className={
                'flex w-full items-center gap-2 text-left font-medium hover:bg-hover ' +
                (compact ? 'px-2 py-1.5 text-xs' : 'px-3 py-2 text-sm')
              }
            >
              <span
                className="inline-block h-3 w-3 shrink-0 rounded-full"
                style={{ backgroundColor: laserColor }}
              />
              <span className="text-foreground">
                {laser.wavelength_nm}nm {laser.name}
              </span>
              <span className="text-xs text-foreground-subtle">
                ({excitedCount} fluorophore{excitedCount !== 1 ? 's' : ''})
              </span>
              <svg
                className="ml-auto h-3.5 w-3.5 shrink-0 text-foreground-subtle transition-transform duration-150"
                style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            {!isCollapsed && (
              <div className={'border-t border-border pb-3 ' + (compact ? 'px-2' : 'px-3')}>
                {excitedCount === 0 ? (
                  <p className="py-3 text-center text-xs text-foreground-subtle">
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
                    activeDetectors={activeDetectors}
                    compact={compact}
                    visibleTypes={visibleTypes}
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
    target: ActiveTarget
    excEff: number
  }>
  detectorToLaser: Map<string, string>
  fluorophoreColorMap: Map<string, string>
  isDark: boolean
  activeDetectors: Set<string>
  compact: boolean
  visibleTypes: VisibleTypes
}

function LaserSpectraChart({
  laser,
  laserColor,
  excitedFluorophores,
  detectorToLaser,
  fluorophoreColorMap,
  isDark,
  activeDetectors,
  compact,
  visibleTypes,
}: LaserSpectraChartProps) {
  const tickColor = isDark ? '#9CA3AF' : '#374151'
  const gridColor = isDark ? '#374151' : '#E5E7EB'
  const legendColor = isDark ? '#D1D5DB' : '#374151'
  const axisFontSize = compact ? 9 : 11
  const legendFontSize = compact ? 10 : 12

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

  const showEx = visibleTypes === 'EX' || visibleTypes === 'both'
  const showEm = visibleTypes === 'EM' || visibleTypes === 'both'

  for (const { fl, target, excEff } of excitedFluorophores) {
    const color = fluorophoreColorMap.get(fl.id) ?? '#888888'
    // Is this fluorophore assigned to a detector on THIS laser?
    const assignedLaserId = target.detector_id ? detectorToLaser.get(target.detector_id) : null
    const isOnTarget = assignedLaserId === laser.id

    let status = ''
    if (!target.detector_id) {
      status = ' (unassigned)'
    } else if (!isOnTarget) {
      status = ' (spillover)'
    }

    // Both curves are scaled by this laser's excitation efficiency so a poorly
    // excited fluorophore reads as a fainter contribution on this laser.
    if (showEm) {
      const em = fl.spectra?.EM
      if (em && em.length > 0) {
        const scaledData = downsampleSpectra(em, 2).map(([wl, intensity]) => ({
          x: wl,
          y: intensity * excEff,
        }))
        datasets.push({
          label: fl.name + ' Em' + status,
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
    }

    if (showEx) {
      // Excitation curves are dashed and unfilled (matching SpectraViewer).
      const ex = fl.spectra?.EX ?? fl.spectra?.AB
      if (ex && ex.length > 0) {
        const scaledData = downsampleSpectra(ex, 2).map(([wl, intensity]) => ({
          x: wl,
          y: intensity * excEff,
        }))
        datasets.push({
          label: fl.name + ' Ex' + status,
          data: scaledData,
          borderColor: color,
          backgroundColor: 'transparent',
          borderDash: [2, 2],
          borderWidth: isOnTarget ? 1.5 : 1,
          fill: false,
          tension: 0.1,
          pointRadius: 0,
        })
      }
    }
  }

  // Build detector bandpass annotations
  const annotations: Record<string, object> = {}
  for (const det of laser.detectors) {
    if (!activeDetectors.has(det.id)) continue
    const low = det.filter_midpoint - det.filter_width / 2
    const high = det.filter_midpoint + det.filter_width / 2
    annotations['det-' + det.id] = {
      type: 'box' as const,
      xMin: low,
      xMax: high,
      // Faint fills wash out against the dark canvas, so use stronger alpha in
      // dark mode to keep the emission-collection windows legible.
      backgroundColor: laserColor + (isDark ? '33' : '18'),
      borderColor: laserColor + (isDark ? '99' : '40'),
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
      // The plugin's default label background is dark (rgba(0,0,0,0.8)), so a
      // dark tick color was invisible in light mode. Pin both the background
      // and text to theme-appropriate, mutually contrasting values.
      color: isDark ? '#E5E7EB' : '#1F2937',
      backgroundColor: isDark ? 'rgba(17,24,39,0.85)' : 'rgba(255,255,255,0.9)',
    },
  }

  const options = {
    responsive: true,
    // Compact (rail) mode lets the fixed-height container define a square /
    // taller-than-wide footprint instead of Chart.js's default 2:1 landscape.
    maintainAspectRatio: !compact,
    animation: false as const,
    scales: {
      x: {
        type: 'linear' as const,
        min: 300,
        max: 850,
        ticks: { stepSize: 50, color: tickColor, font: { size: axisFontSize } },
        title: { display: true, text: 'Wavelength (nm)', color: tickColor, font: { size: axisFontSize } },
        grid: { color: gridColor },
      },
      y: {
        min: 0,
        max: 1,
        ticks: { stepSize: 0.25, color: tickColor, font: { size: axisFontSize } },
        title: { display: true, text: 'Relative Yield', color: tickColor, font: { size: axisFontSize } },
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
        labels: {
          color: legendColor,
          usePointStyle: true,
          font: { size: legendFontSize },
          // With usePointStyle the marker radius is boxHeight * √2/2 (capped at
          // fontSize) — boxWidth has no effect on circle size. Constrain
          // boxHeight to shrink the color circles in both themes.
          boxWidth: compact ? 8 : 12,
          boxHeight: compact ? 5 : 6,
          padding: compact ? 6 : 10,
        },
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
    <div className={compact ? 'h-80 w-full' : 'h-56 w-full'}>
      <Line data={{ datasets }} options={options} />
    </div>
  )
}
