/**
 * Linearly interpolates a spectrum at the given wavelength.
 *
 * The `spectra` parameter is an array of [wavelength, intensity] pairs sorted
 * by wavelength. Returns 0 if the wavelength is outside the spectrum range.
 * Between two data points, performs linear interpolation.
 *
 * @param spectra - Array of [wavelength, intensity] pairs
 * @param wavelength - The wavelength to interpolate at
 * @returns The interpolated intensity value
 */
export function interpolateAt(
  _spectra: number[][],
  _wavelength: number
): number {
  throw new Error('not implemented')
}

export function isExcitable(
  _excitationSpectra: number[][],
  _laserWavelength: number
): boolean {
  throw new Error('not implemented')
}

export function isDetectable(
  _emissionSpectra: number[][],
  _filterMidpoint: number,
  _filterWidth: number
): boolean {
  throw new Error('not implemented')
}

export function isCompatible(
  _excitationSpectra: number[][],
  _emissionSpectra: number[][],
  _laserWavelength: number,
  _filterMidpoint: number,
  _filterWidth: number
): boolean {
  throw new Error('not implemented')
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
