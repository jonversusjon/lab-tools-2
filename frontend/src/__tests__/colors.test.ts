import { describe, it, expect } from 'vitest'
import { heatmapColor, laserColors, getLaserColor } from '@/utils/colors'

function hexToRgb(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return { r, g, b }
}

describe('heatmapColor', () => {
  it('returns white-ish for 0.0', () => {
    const c = hexToRgb(heatmapColor(0))
    expect(c.r).toBeGreaterThanOrEqual(250)
    expect(c.g).toBeGreaterThanOrEqual(250)
    expect(c.b).toBeGreaterThanOrEqual(250)
  })

  it('returns yellow-ish for 0.15', () => {
    const c = hexToRgb(heatmapColor(0.15))
    expect(c.r).toBeGreaterThan(200)
    expect(c.g).toBeGreaterThan(100)
    expect(c.b).toBeLessThan(80)
  })

  it('returns orange-ish for 0.4', () => {
    const c = hexToRgb(heatmapColor(0.4))
    expect(c.r).toBeGreaterThan(200)
    expect(c.g).toBeLessThan(120)
    expect(c.b).toBeLessThan(80)
  })

  it('returns red-ish for 0.7', () => {
    const c = hexToRgb(heatmapColor(0.7))
    expect(c.r).toBeGreaterThan(150)
    expect(c.g).toBeLessThan(50)
    expect(c.b).toBeLessThan(50)
  })
})

describe('laserColors', () => {
  it('has entries for all standard laser wavelengths', () => {
    expect(laserColors[405]).toBeDefined()
    expect(laserColors[488]).toBeDefined()
    expect(laserColors[561]).toBeDefined()
    expect(laserColors[637]).toBeDefined()
  })
})

describe('getLaserColor', () => {
  it('returns red for common red laser wavelengths (633, 637, 640)', () => {
    expect(getLaserColor(633)).toBe('#EF4444')
    expect(getLaserColor(637)).toBe('#EF4444')
    expect(getLaserColor(640)).toBe('#EF4444')
  })

  it('returns violet for 405nm', () => {
    expect(getLaserColor(405)).toBe('#8B5CF6')
  })

  it('returns blue for 488nm', () => {
    expect(getLaserColor(488)).toBe('#3B82F6')
  })

  it('returns yellow-green for 561nm', () => {
    expect(getLaserColor(561)).toBe('#84CC16')
  })

  it('returns grey for invalid wavelength', () => {
    expect(getLaserColor(0)).toBe('#6B7280')
  })
})
