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

/**
 * Maps a spillover value (0.0–1.0) to a heatmap color for light backgrounds.
 * white (0.0) → yellow (0.1–0.2) → orange (0.3–0.5) → red (>0.5)
 */
export function heatmapColor(value: number): string {
  if (value <= 0) return '#ffffff'
  if (value >= 1) return '#dc2626'

  // Breakpoints: 0→white, 0.1→yellow, 0.3→orange, 0.5→red
  if (value <= 0.1) {
    const t = value / 0.1
    return rgbToHex(
      lerp(255, 250, t),
      lerp(255, 204, t),
      lerp(255, 21, t)
    )
  }
  if (value <= 0.3) {
    const t = (value - 0.1) / 0.2
    return rgbToHex(
      lerp(250, 249, t),
      lerp(204, 115, t),
      lerp(21, 22, t)
    )
  }
  if (value <= 0.5) {
    const t = (value - 0.3) / 0.2
    return rgbToHex(
      lerp(249, 220, t),
      lerp(115, 38, t),
      lerp(22, 38, t)
    )
  }
  // 0.5 → 1.0: deep red
  const t = (value - 0.5) / 0.5
  return rgbToHex(
    lerp(220, 185, t),
    lerp(38, 28, t),
    lerp(38, 28, t)
  )
}

/**
 * Maps a spillover value (0.0–1.0) to a heatmap color for dark backgrounds.
 * dark gray (0.0) → dark blue (0.05) → blue (0.1) → amber (0.3) → orange-red (0.5+)
 */
export function heatmapColorDark(value: number): string {
  if (value <= 0) return '#1F2937'
  if (value >= 1) return '#dc2626'

  if (value <= 0.1) {
    const t = value / 0.1
    return rgbToHex(
      lerp(31, 30, t),
      lerp(41, 58, t),
      lerp(55, 138, t)
    )
  }
  if (value <= 0.3) {
    const t = (value - 0.1) / 0.2
    return rgbToHex(
      lerp(30, 180, t),
      lerp(58, 120, t),
      lerp(138, 30, t)
    )
  }
  if (value <= 0.5) {
    const t = (value - 0.3) / 0.2
    return rgbToHex(
      lerp(180, 220, t),
      lerp(120, 50, t),
      lerp(30, 30, t)
    )
  }
  // 0.5 → 1.0: deep red
  const t = (value - 0.5) / 0.5
  return rgbToHex(
    lerp(220, 185, t),
    lerp(50, 28, t),
    lerp(30, 28, t)
  )
}
