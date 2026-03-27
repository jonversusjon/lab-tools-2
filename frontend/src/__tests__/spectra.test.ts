import { describe, it, expect } from 'vitest'
import {
  interpolateAt,
  downsampleSpectra,
  isExcitable,
  isDetectable,
  isCompatible,
} from '@/utils/spectra'
import type { FluorophoreWithSpectra } from '@/types'

// Simple linear spectrum for testing: [400, 0], [450, 0.5], [500, 1.0], [550, 0.5], [600, 0]
const simpleSpectrum: number[][] = [
  [400, 0],
  [450, 0.5],
  [500, 1.0],
  [550, 0.5],
  [600, 0],
]

// Gaussian-ish emission centered at 519nm
const fitcEmission: number[][] = Array.from({ length: 201 }, (_, i) => {
  const wl = 400 + i
  return [wl, Math.exp(-((wl - 519) ** 2) / (2 * 25 ** 2))]
})

// Gaussian-ish excitation centered at 494nm
const fitcExcitation: number[][] = Array.from({ length: 201 }, (_, i) => {
  const wl = 400 + i
  return [wl, Math.exp(-((wl - 494) ** 2) / (2 * 20 ** 2))]
})

// APC-like: ex 650, em 660
const apcExcitation: number[][] = Array.from({ length: 201 }, (_, i) => {
  const wl = 550 + i
  return [wl, Math.exp(-((wl - 650) ** 2) / (2 * 20 ** 2))]
})
const apcEmission: number[][] = Array.from({ length: 201 }, (_, i) => {
  const wl = 550 + i
  return [wl, Math.exp(-((wl - 660) ** 2) / (2 * 15 ** 2))]
})

const makeFluorophore = (
  overrides: Partial<FluorophoreWithSpectra>
): FluorophoreWithSpectra => ({
  id: 'test',
  name: 'Test',
  excitation_max_nm: 494,
  emission_max_nm: 519,
  source: 'seed',
  spectra: null,
  ...overrides,
})

describe('interpolateAt', () => {
  it('returns exact value at data point', () => {
    expect(interpolateAt(simpleSpectrum, 500)).toBe(1.0)
    expect(interpolateAt(simpleSpectrum, 400)).toBe(0)
  })

  it('interpolates between data points', () => {
    // Midpoint between [450, 0.5] and [500, 1.0] → 475 should give 0.75
    expect(interpolateAt(simpleSpectrum, 475)).toBeCloseTo(0.75, 5)
  })

  it('returns 0 outside range', () => {
    expect(interpolateAt(simpleSpectrum, 350)).toBe(0)
    expect(interpolateAt(simpleSpectrum, 650)).toBe(0)
  })
})

describe('downsampleSpectra', () => {
  it('reduces point count', () => {
    // 201 points spanning 200nm → avg step ~1nm, step 2 → skip every other
    const result = downsampleSpectra(fitcEmission, 2)
    expect(result.length).toBeLessThan(fitcEmission.length)
    expect(result.length).toBeGreaterThan(0)
  })
})

describe('isExcitable', () => {
  it('FITC (ex 494) is excitable by 488nm laser (with spectra)', () => {
    const fl = makeFluorophore({
      excitation_max_nm: 494,
      spectra: { excitation: fitcExcitation, emission: fitcEmission },
    })
    expect(isExcitable(fl, 488)).toBe(true)
  })

  it('FITC is NOT excitable by 637nm laser (with spectra)', () => {
    const fl = makeFluorophore({
      excitation_max_nm: 494,
      spectra: { excitation: fitcExcitation, emission: fitcEmission },
    })
    expect(isExcitable(fl, 637)).toBe(false)
  })

  it('APC (ex 650) is excitable by 637nm (with spectra)', () => {
    const fl = makeFluorophore({
      id: 'apc',
      name: 'APC',
      excitation_max_nm: 650,
      emission_max_nm: 660,
      spectra: { excitation: apcExcitation, emission: apcEmission },
    })
    expect(isExcitable(fl, 637)).toBe(true)
  })

  it('uses fallback when no spectra: within ±40nm', () => {
    const fl = makeFluorophore({ excitation_max_nm: 494, spectra: null })
    expect(isExcitable(fl, 488)).toBe(true)
    expect(isExcitable(fl, 637)).toBe(false)
  })
})

describe('isDetectable', () => {
  it('FITC (em 519) is detectable by 530/30 filter (with spectra)', () => {
    const fl = makeFluorophore({
      emission_max_nm: 519,
      spectra: { excitation: fitcExcitation, emission: fitcEmission },
    })
    // 530/30 = 515–545nm, FITC emission peak 519 is right inside
    expect(isDetectable(fl, 530, 30)).toBe(true)
  })

  it('FITC is NOT detectable by 780/60 filter (with spectra)', () => {
    const fl = makeFluorophore({
      emission_max_nm: 519,
      spectra: { excitation: fitcExcitation, emission: fitcEmission },
    })
    expect(isDetectable(fl, 780, 60)).toBe(false)
  })

  it('APC (em 660) is detectable by 670/30 (655–685nm) (with spectra)', () => {
    const fl = makeFluorophore({
      id: 'apc',
      name: 'APC',
      excitation_max_nm: 650,
      emission_max_nm: 660,
      spectra: { excitation: apcExcitation, emission: apcEmission },
    })
    expect(isDetectable(fl, 670, 30)).toBe(true)
  })

  it('uses fallback when no spectra: emission max within generous 2× window', () => {
    const fl = makeFluorophore({ emission_max_nm: 519, spectra: null })
    expect(isDetectable(fl, 530, 30)).toBe(true)   // 500–560 range
    expect(isDetectable(fl, 780, 60)).toBe(false)   // 720–840 range
  })
})

describe('isCompatible', () => {
  it('combines excitable + detectable', () => {
    const fl = makeFluorophore({
      spectra: { excitation: fitcExcitation, emission: fitcEmission },
    })
    // FITC + 488nm laser + 530/30 detector → compatible
    expect(isCompatible(fl, 488, 530, 30)).toBe(true)
    // FITC + 637nm laser + 530/30 detector → not excitable
    expect(isCompatible(fl, 637, 530, 30)).toBe(false)
    // FITC + 488nm laser + 780/60 detector → not detectable
    expect(isCompatible(fl, 488, 780, 60)).toBe(false)
  })
})
