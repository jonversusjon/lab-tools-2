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

export function downsampleSpectra(
  _spectra: number[][],
  _stepNm: number
): number[][] {
  throw new Error('not implemented')
}
