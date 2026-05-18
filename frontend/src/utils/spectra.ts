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
 * If full excitation spectrum (EX or AB) available: use interpolateAt to get
 * intensity at laser wavelength, compare to peak intensity.
 * Threshold: >= 15% of peak.
 * Fallback (no spectra): laser within ±40nm of excitation max.
 */
export function isExcitable(
  fluorophore: FluorophoreWithSpectra,
  laserWavelength: number
): boolean {
  const ex = fluorophore.spectra?.EX ?? fluorophore.spectra?.AB
  if (ex && ex.length > 0) {
    const intensity = interpolateAt(ex, laserWavelength)
    const peak = Math.max(...ex.map((p) => p[1]))
    if (peak <= 0) return false
    return intensity / peak >= 0.15
  }
  // Fallback: within ±40nm of excitation max
  if (fluorophore.ex_max_nm !== null && fluorophore.ex_max_nm !== undefined) {
    return Math.abs(fluorophore.ex_max_nm - laserWavelength) <= 40
  }
  return false
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
  const em = fluorophore.spectra?.EM
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
  if (fluorophore.em_max_nm !== null && fluorophore.em_max_nm !== undefined) {
    return (
      fluorophore.em_max_nm >= filterMidpoint - filterWidth &&
      fluorophore.em_max_nm <= filterMidpoint + filterWidth
    )
  }
  return false
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
 * Excitation efficiency: 0-1 score for how well a laser excites this fluorophore.
 * Raw value with no noise floor. Returns 0 when the fluorophore has no
 * excitation spectrum (callers that need a missing-spectra signal should
 * use rankChannels, which returns a discriminated union).
 */
export function excitationEfficiency(
  fluorophore: FluorophoreWithSpectra,
  laserWavelength: number
): number {
  const ex = fluorophore.spectra?.EX ?? fluorophore.spectra?.AB
  if (ex && ex.length > 0) {
    const intensity = interpolateAt(ex, laserWavelength)
    const peak = Math.max(...ex.map((p) => p[1]))
    if (peak <= 0) return 0
    return intensity / peak
  }
  return 0
}

/**
 * Detection efficiency: 0-1 score for what fraction of emission falls in the bandpass.
 * Raw value, no fallback. Returns 0 when the fluorophore has no emission spectrum.
 */
export function detectionEfficiency(
  fluorophore: FluorophoreWithSpectra,
  filterMidpoint: number,
  filterWidth: number
): number {
  const em = fluorophore.spectra?.EM
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
    if (totalIntegral <= 0) return 0
    return bandpassIntegral / totalIntegral
  }
  return 0
}

/**
 * Combined channel score: excitation × detection efficiency.
 */
export function channelScore(
  fluorophore: FluorophoreWithSpectra,
  laserWavelength: number,
  filterMidpoint: number,
  filterWidth: number
): number {
  return excitationEfficiency(fluorophore, laserWavelength) *
         detectionEfficiency(fluorophore, filterMidpoint, filterWidth)
}

export interface ChannelRanking {
  detectorId: string
  laserId: string
  laserWavelength: number
  filterMidpoint: number
  filterWidth: number
  score: number
  excitationEff: number
  detectionEff: number
}

/**
 * Discriminated result so callers can distinguish "no spectra to compute
 * from" (signal a no-spectra affordance like NoSpectraChip) from "computed
 * but real low values" (render the raw number).
 */
export type RankChannelsResult =
  | { kind: 'computed'; rankings: ChannelRanking[] }
  | { kind: 'no_spectra' }

/**
 * Score and rank all channels on an instrument for a given fluorophore.
 *
 * Returns `{ kind: 'no_spectra' }` when the fluorophore lacks either an
 * excitation/absorption spectrum or an emission spectrum — without both,
 * there is no raw data to compute from. Display paths must surface this
 * as a distinct missing-data affordance instead of rendering a fabricated
 * fallback value.
 *
 * Otherwise returns `{ kind: 'computed', rankings }` where rankings are
 * raw values (no noise floor) sorted descending by score. Sub-5% values
 * are returned unmodified.
 */
export function rankChannels(
  fluorophore: FluorophoreWithSpectra,
  instrument: {
    lasers: Array<{
      id: string
      wavelength_nm: number
      detectors: Array<{ id: string; filter_midpoint: number; filter_width: number }>
    }>
  }
): RankChannelsResult {
  const ex = fluorophore.spectra?.EX ?? fluorophore.spectra?.AB
  const em = fluorophore.spectra?.EM
  if (!ex || ex.length === 0 || !em || em.length === 0) {
    return { kind: 'no_spectra' }
  }

  const rankings: ChannelRanking[] = []
  for (const laser of instrument.lasers) {
    for (const det of laser.detectors) {
      const excEff = excitationEfficiency(fluorophore, laser.wavelength_nm)
      const detEff = detectionEfficiency(fluorophore, det.filter_midpoint, det.filter_width)
      const score = excEff * detEff
      rankings.push({
        detectorId: det.id,
        laserId: laser.id,
        laserWavelength: laser.wavelength_nm,
        filterMidpoint: det.filter_midpoint,
        filterWidth: det.filter_width,
        score,
        excitationEff: excEff,
        detectionEff: detEff,
      })
    }
  }
  rankings.sort((a, b) => b.score - a.score)
  return { kind: 'computed', rankings }
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
