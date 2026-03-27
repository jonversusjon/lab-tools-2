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
import { downsampleSpectra } from '@/utils/spectra'

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

// Colorblind-safe Wong palette
const OVERLAY_COLORS = [
  '#0072B2', '#D55E00', '#009E73', '#CC79A7',
  '#E69F00', '#56B4E9', '#F0E442', '#000000',
]

interface SpectraViewerProps {
  fluorophores: Array<{
    name: string
    spectra: { excitation: number[][]; emission: number[][] }
    color?: string
  }>
  mode: 'single' | 'overlay'
  laserLines?: number[]
  detectorWindows?: Array<{
    midpoint: number
    width: number
    color?: string
  }>
}

export default function SpectraViewer({
  fluorophores,
  mode,
  laserLines,
  detectorWindows,
}: SpectraViewerProps) {
  const datasets: Array<{
    label: string
    data: Array<{ x: number; y: number }>
    borderColor: string
    backgroundColor: string
    borderDash?: number[]
    fill: boolean
  }> = []

  if (mode === 'single' && fluorophores.length > 0) {
    const fl = fluorophores[0]
    const color = fl.color ?? '#0891b2'
    const exData = downsampleSpectra(fl.spectra.excitation, 2)
    const emData = downsampleSpectra(fl.spectra.emission, 2)

    datasets.push({
      label: fl.name + ' Ex',
      data: exData.map(([x, y]) => ({ x, y })),
      borderColor: color,
      backgroundColor: 'transparent',
      borderDash: [6, 3],
      fill: false,
    })
    datasets.push({
      label: fl.name + ' Em',
      data: emData.map(([x, y]) => ({ x, y })),
      borderColor: color,
      backgroundColor: color + '30',
      fill: true,
    })
  } else if (mode === 'overlay') {
    fluorophores.forEach((fl, i) => {
      const color = fl.color ?? OVERLAY_COLORS[i % OVERLAY_COLORS.length]
      const emData = downsampleSpectra(fl.spectra.emission, 2)
      datasets.push({
        label: fl.name,
        data: emData.map(([x, y]) => ({ x, y })),
        borderColor: color,
        backgroundColor: color + '20',
        fill: false,
      })
    })
  }

  // Build annotation objects
  const annotations: Record<string, object> = {}

  if (laserLines) {
    laserLines.forEach((wl, i) => {
      annotations['laser' + i] = {
        type: 'line' as const,
        xMin: wl,
        xMax: wl,
        borderColor: '#666',
        borderWidth: 1,
        borderDash: [4, 4],
        label: {
          display: true,
          content: wl + 'nm',
          position: 'start' as const,
          font: { size: 10 },
        },
      }
    })
  }

  if (detectorWindows) {
    detectorWindows.forEach((det, i) => {
      const low = det.midpoint - det.width / 2
      const high = det.midpoint + det.width / 2
      annotations['det' + i] = {
        type: 'box' as const,
        xMin: low,
        xMax: high,
        backgroundColor: (det.color ?? '#94a3b8') + '25',
        borderColor: det.color ?? '#94a3b8',
        borderWidth: 1,
      }
    })
  }

  const options = {
    responsive: true,
    animation: false as const,
    scales: {
      x: {
        type: 'linear' as const,
        min: 350,
        max: 850,
        ticks: { stepSize: 50 },
        title: { display: true, text: 'Wavelength (nm)' },
      },
      y: {
        min: 0,
        max: 1,
        ticks: { stepSize: 0.25 },
        title: { display: true, text: 'Normalized Intensity' },
      },
    },
    elements: {
      point: { radius: 0 },
      line: { tension: 0.1 },
    },
    plugins: {
      annotation: { annotations },
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
    <div className="h-72 w-full">
      <Line data={{ datasets }} options={options} />
    </div>
  )
}
