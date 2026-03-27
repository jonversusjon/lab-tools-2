import type { FluorophoreWithSpectra } from '@/types'

/**
 * Linear interpolation: given a spectrum as [[wavelength, intensity], ...],
 * return the intensity at the given wavelength.
 * Returns 0 if wavelength is outside the spectrum range.
 * Spectrum must be sorted by wavelength (ascending).
 */
export function interpolateAt(
  spectra: number[][],
  wavelength: number
): number {
  if (spectra.length === 0) return 0
  if (wavelength <= spectra[0][0]) return wavelength === spectra[0][0] ? spectra[0][1] : 0
  if (wavelength >= spectra[spectra.length - 1][0]) {
    return wavelength === spectra[spectra.length - 1][0]
      ? spectra[spectra.length - 1][1]
      : 0
  }

  // Binary search for the interval
  let lo = 0
  let hi = spectra.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (spectra[mid][0] <= wavelength) lo = mid
    else hi = mid
  }

  const [x0, y0] = spectra[lo]
  const [x1, y1] = spectra[hi]
  const t = (wavelength - x0) / (x1 - x0)
  return y0 + (y1 - y0) * t
}

/**
 * Can this fluorophore be excited by the given laser?
 * If full excitation spectrum available: use interpolateAt to get
 * intensity at laser wavelength, compare to max intensity in spectrum.
 * Threshold: >= 15% of peak.
 * Fallback (no spectra or empty): laser within ±40nm of excitation max.
 */
export function isExcitable(
  fluorophore: FluorophoreWithSpectra,
  laserWavelength: number
): boolean {
  const ex = fluorophore.spectra?.excitation
  if (ex && ex.length > 0) {
    const intensity = interpolateAt(ex, laserWavelength)
    const peak = Math.max(...ex.map((p) => p[1]))
    if (peak <= 0) return false
    return intensity / peak >= 0.15
  }
  // Fallback: within ±40nm of excitation max
  return Math.abs(fluorophore.excitation_max_nm - laserWavelength) <= 40
}

/**
 * Can this detector collect meaningful signal from this fluorophore?
 * If full emission spectrum available: compute integral of emission
 * over bandpass [midpoint - width/2, midpoint + width/2] at 1nm steps.
 * Compare to total emission integral. Threshold: >= 5% of total.
 * Fallback (no spectra): emission max within [midpoint - width, midpoint + width].
 */
export function isDetectable(
  fluorophore: FluorophoreWithSpectra,
  filterMidpoint: number,
  filterWidth: number
): boolean {
  const em = fluorophore.spectra?.emission
  if (em && em.length > 0) {
    const low = filterMidpoint - filterWidth / 2
    const high = filterMidpoint + filterWidth / 2

    let bandpassIntegral = 0
    for (let wl = Math.round(low); wl <= Math.round(high); wl++) {
      bandpassIntegral += interpolateAt(em, wl)
    }

    let totalIntegral = 0
    const startWl = Math.round(em[0][0])
    const endWl = Math.round(em[em.length - 1][0])
    for (let wl = startWl; wl <= endWl; wl++) {
      totalIntegral += interpolateAt(em, wl)
    }

    if (totalIntegral <= 0) return false
    return bandpassIntegral / totalIntegral >= 0.05
  }
  // Fallback: generous 2× window
  return (
    fluorophore.emission_max_nm >= filterMidpoint - filterWidth &&
    fluorophore.emission_max_nm <= filterMidpoint + filterWidth
  )
}

/**
 * Combined: is this fluorophore compatible with this laser+detector pair?
 */
export function isCompatible(
  fluorophore: FluorophoreWithSpectra,
  laserWavelength: number,
  filterMidpoint: number,
  filterWidth: number
): boolean {
  return (
    isExcitable(fluorophore, laserWavelength) &&
    isDetectable(fluorophore, filterMidpoint, filterWidth)
  )
}

/**
 * Downsample spectra by taking every Nth point, where N = stepNm / avgStep.
 * If the input is already sparse enough, returns a copy.
 */
export function downsampleSpectra(
  spectra: number[][],
  stepNm: number
): number[][] {
  if (spectra.length <= 2) return [...spectra]
  const avgStep =
    (spectra[spectra.length - 1][0] - spectra[0][0]) / (spectra.length - 1)
  const skip = Math.max(1, Math.round(stepNm / avgStep))
  if (skip <= 1) return [...spectra]
  const result: number[][] = []
  for (let i = 0; i < spectra.length; i += skip) {
    result.push(spectra[i])
  }
  // Always include the last point
  if (result[result.length - 1] !== spectra[spectra.length - 1]) {
    result.push(spectra[spectra.length - 1])
  }
  return result
}
