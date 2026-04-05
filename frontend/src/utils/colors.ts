/** Laser wavelength → hex color for UI headers */
export const laserColors: Record<number, string> = {
  355: '#9333EA',  // UV
  405: '#8B5CF6',  // Violet
  488: '#3B82F6',  // Blue
  561: '#84CC16',  // Yellow-Green
  637: '#EF4444',  // Red
}

/** Maps a laser wavelength to a color using ranges, so 633 and 640 both get red. */
export function getLaserColor(wavelengthNm: number): string {
  if (wavelengthNm <= 0) return '#6B7280'
  if (wavelengthNm < 380) return '#9333EA'   // UV
  if (wavelengthNm < 440) return '#8B5CF6'   // Violet
  if (wavelengthNm < 500) return '#3B82F6'   // Blue
  if (wavelengthNm < 540) return '#10B981'   // Cyan/Green
  if (wavelengthNm < 590) return '#84CC16'   // Yellow-Green
  if (wavelengthNm < 620) return '#F59E0B'   // Orange
  return '#EF4444'                            // Red (620nm+)
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
  return (
    '#' +
    clamp(r).toString(16).padStart(2, '0') +
    clamp(g).toString(16).padStart(2, '0') +
    clamp(b).toString(16).padStart(2, '0')
  )
}

type RGB = [number, number, number]

function sampleGradient(stops: {t: number, c: RGB}[], value: number): string {
  if (value <= stops[0].t) return rgbToHex(...stops[0].c)
  if (value >= stops[stops.length - 1].t) return rgbToHex(...stops[stops.length - 1].c)
  
  for (let i = 0; i < stops.length - 1; i++) {
    const s1 = stops[i]
    const s2 = stops[i+1]
    if (value >= s1.t && value <= s2.t) {
      const range = s2.t - s1.t
      const ratio = (value - s1.t) / range
      return rgbToHex(
        lerp(s1.c[0], s2.c[0], ratio),
        lerp(s1.c[1], s2.c[1], ratio),
        lerp(s1.c[2], s2.c[2], ratio)
      )
    }
  }
  return rgbToHex(...stops[stops.length - 1].c)
}

const LIGHT_STOPS: {t: number, c: RGB}[] = [
  { t: 0.00, c: [255, 255, 255] }, // white
  { t: 0.25, c: [219, 234, 254] }, // blue-100
  { t: 0.50, c: [192, 132, 252] }, // fuchsia-400
  { t: 0.75, c: [244, 114, 182] }, // pink-400
  { t: 1.00, c: [251, 113, 133] }  // rose-400
]

const DARK_STOPS: {t: number, c: RGB}[] = [
  { t: 0.00, c: [31, 41, 55] },    // gray-800
  { t: 0.25, c: [30, 58, 138] },   // blue-900
  { t: 0.50, c: [126, 34, 206] },  // purple-700
  { t: 0.75, c: [190, 18, 60] },   // rose-700
  { t: 1.00, c: [159, 18, 57] }    // rose-800
]

/**
 * Maps a spillover value (0.0–1.0) to a heatmap color for light backgrounds.
 */
export function heatmapColor(value: number): string {
  if (value <= 0) return '#ffffff'
  if (value >= 1) return '#fb7185' // rose-400
  
  // Non-linear scaling: quiet the low values, accentuate the peaks (exponent 1.5)
  const nonLinearValue = Math.pow(value, 1.5)
  return sampleGradient(LIGHT_STOPS, nonLinearValue)
}

/**
 * Maps a spillover value (0.0–1.0) to a heatmap color for dark backgrounds.
 */
export function heatmapColorDark(value: number): string {
  if (value <= 0) return '#1f2937' // gray-800
  if (value >= 1) return '#9f1239' // rose-800

  // Non-linear scaling: quiet the low values, accentuate the peaks (exponent 1.5)
  const nonLinearValue = Math.pow(value, 1.5)
  return sampleGradient(DARK_STOPS, nonLinearValue)
}
