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

// Light-mode scale: a warm sequential "YlOrRd"-style ramp (white → gold →
// orange → red → wine). Sequential by luminance and hue, so magnitude reads
// at a glance. Text legibility on the dark end is handled by readableTextColor.
const LIGHT_STOPS: {t: number, c: RGB}[] = [
  { t: 0.00, c: [255, 255, 255] }, // white
  { t: 0.10, c: [255, 241, 160] }, // pale yellow
  { t: 0.15, c: [255, 214,  53] }, // gold
  { t: 0.30, c: [251, 146,  60] }, // light orange
  { t: 0.40, c: [249, 115,  22] }, // orange
  { t: 0.55, c: [220,  55,  40] }, // red-orange
  { t: 0.70, c: [200,  30,  30] }, // red
  { t: 1.00, c: [136,  19,  55] }, // deep wine
]

// Dark-mode scale: an inferno/magma-style ramp (slate → plum → magenta →
// crimson → orange → amber). Perceptually ordered and brightness-increasing so
// it pops against the dark UI, with every step clearly separated from the next.
const DARK_STOPS: {t: number, c: RGB}[] = [
  { t: 0.00, c: [ 31,  41,  55] }, // gray-800 (blends with empty cells)
  { t: 0.12, c: [ 59,  28,  71] }, // dark plum
  { t: 0.28, c: [114,  30,  79] }, // deep magenta
  { t: 0.45, c: [183,  42,  76] }, // crimson
  { t: 0.65, c: [232,  80,  53] }, // red-orange
  { t: 0.83, c: [246, 140,  52] }, // orange
  { t: 1.00, c: [252, 196,  90] }, // hot amber
]

/**
 * Maps a spillover value (0.0–1.0) to a heatmap color for light backgrounds.
 */
export function heatmapColor(value: number): string {
  if (value <= 0) return '#ffffff'
  if (value >= 1) return '#881337' // deep wine
  return sampleGradient(LIGHT_STOPS, value)
}

/**
 * Maps a spillover value (0.0–1.0) to a heatmap color for dark backgrounds.
 */
export function heatmapColorDark(value: number): string {
  if (value <= 0) return '#1f2937' // gray-800
  if (value >= 1) return '#fcc45a' // hot amber

  // Sub-linear scaling (exponent 0.7) lifts the low end so the small spillover
  // values that dominate a real matrix spread across distinct colors instead of
  // collapsing into one dark smear.
  const nonLinearValue = Math.pow(value, 0.7)
  return sampleGradient(DARK_STOPS, nonLinearValue)
}

/**
 * Picks a legible text color (near-black or near-white) for a background hex,
 * based on perceived luminance. Keeps spillover values readable on every cell —
 * dark text on pale/gold cells, light text on saturated/deep cells — in both
 * light and dark mode, replacing the old fixed per-theme text color.
 */
export function readableTextColor(backgroundHex: string): string {
  const hex = backgroundHex.replace('#', '')
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  // Perceived luminance (ITU-R BT.601 weights).
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b
  return luminance > 140 ? '#1A1A1A' : '#F8FAFC'
}
