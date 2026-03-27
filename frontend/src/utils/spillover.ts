import { interpolateAt } from '@/utils/spectra'

interface SpilloverInput {
  fluorophoreId: string
  fluorophoreName: string
  emissionSpectra: number[][] // [[wavelength, intensity], ...]
  detectorMidpoint: number
  detectorWidth: number
}

// Memoization cache: fluorophoreId → pre-interpolated emission array at 1nm steps (300–850nm)
const emissionGridCache = new Map<string, Float64Array>()

const GRID_START = 300
const GRID_END = 850
const GRID_SIZE = GRID_END - GRID_START + 1

function getEmissionGrid(fluorophoreId: string, emissionSpectra: number[][]): Float64Array {
  const cached = emissionGridCache.get(fluorophoreId)
  if (cached) return cached

  const grid = new Float64Array(GRID_SIZE)
  for (let i = 0; i < GRID_SIZE; i++) {
    grid[i] = interpolateAt(emissionSpectra, GRID_START + i)
  }
  emissionGridCache.set(fluorophoreId, grid)
  return grid
}

/**
 * Integrate emission grid over a rectangular bandpass window.
 * Bandpass: [midpoint - width/2, midpoint + width/2]
 */
function integrateOverBandpass(grid: Float64Array, midpoint: number, width: number): number {
  const low = Math.round(midpoint - width / 2)
  const high = Math.round(midpoint + width / 2)
  let sum = 0
  for (let wl = Math.max(low, GRID_START); wl <= Math.min(high, GRID_END); wl++) {
    sum += grid[wl - GRID_START]
  }
  return sum
}

/**
 * Compute NxN spillover matrix for assigned fluorophores.
 *
 * spillover[i][j] = fraction of fluorophore i's emission captured by
 * fluorophore j's assigned detector, relative to fluorophore i's own detector.
 *
 * = ∫ emission_i(λ) × T_j(λ) dλ  /  ∫ emission_i(λ) × T_i(λ) dλ
 *
 * T(λ) = rectangular bandpass: 1 inside [midpoint - width/2, midpoint + width/2], 0 outside.
 * Diagonal = 1.0 by definition.
 * Return null for entries where spectra are unavailable or denominator is 0.
 */
export function computeSpilloverMatrix(
  assignments: SpilloverInput[]
): { labels: string[]; matrix: (number | null)[][] } {
  const n = assignments.length
  const labels = assignments.map((a) => a.fluorophoreName)
  const matrix: (number | null)[][] = Array.from({ length: n }, () =>
    Array.from({ length: n }, () => null)
  )

  if (n === 0) return { labels, matrix }

  // Pre-compute emission grids and own-detector integrals
  const grids: (Float64Array | null)[] = []
  const ownIntegrals: (number | null)[] = []

  for (let i = 0; i < n; i++) {
    const a = assignments[i]
    if (!a.emissionSpectra || a.emissionSpectra.length === 0) {
      grids.push(null)
      ownIntegrals.push(null)
    } else {
      const grid = getEmissionGrid(a.fluorophoreId, a.emissionSpectra)
      grids.push(grid)
      const own = integrateOverBandpass(grid, a.detectorMidpoint, a.detectorWidth)
      ownIntegrals.push(own <= 0 ? null : own)
    }
  }

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) {
        matrix[i][j] = 1.0
        continue
      }
      const grid = grids[i]
      const own = ownIntegrals[i]
      if (!grid || own === null) {
        matrix[i][j] = null
        continue
      }
      const spillover = integrateOverBandpass(
        grid,
        assignments[j].detectorMidpoint,
        assignments[j].detectorWidth
      )
      matrix[i][j] = spillover / own
    }
  }

  return { labels, matrix }
}

export function clearSpilloverCache(): void {
  emissionGridCache.clear()
}

export type { SpilloverInput }
