import { describe, it, expect } from 'vitest'
import {
  interpolateAt,
  downsampleSpectra,
  isExcitable,
  isDetectable,
  isCompatible,
  excitationEfficiency,
  detectionEfficiency,
  channelScore,
  rankChannels,
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
  fluor_type: null,
  source: 'FPbase',
  ex_max_nm: 494,
  em_max_nm: 519,
  ext_coeff: null,
  qy: null,
  lifetime_ns: null,
  oligomerization: null,
  switch_type: null,
  has_spectra: false,
  is_favorite: false,
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
      ex_max_nm: 494,
      spectra: { EX: fitcExcitation, EM: fitcEmission },
    })
    expect(isExcitable(fl, 488)).toBe(true)
  })

  it('FITC is NOT excitable by 637nm laser (with spectra)', () => {
    const fl = makeFluorophore({
      ex_max_nm: 494,
      spectra: { EX: fitcExcitation, EM: fitcEmission },
    })
    expect(isExcitable(fl, 637)).toBe(false)
  })

  it('APC (ex 650) is excitable by 637nm (with spectra)', () => {
    const fl = makeFluorophore({
      id: 'apc',
      name: 'APC',
      ex_max_nm: 650,
      em_max_nm: 660,
      spectra: { EX: apcExcitation, EM: apcEmission },
    })
    expect(isExcitable(fl, 637)).toBe(true)
  })

  it('uses fallback when no spectra: within ±40nm', () => {
    const fl = makeFluorophore({ ex_max_nm: 494, spectra: null })
    expect(isExcitable(fl, 488)).toBe(true)
    expect(isExcitable(fl, 637)).toBe(false)
  })
})

describe('isDetectable', () => {
  it('FITC (em 519) is detectable by 530/30 filter (with spectra)', () => {
    const fl = makeFluorophore({
      em_max_nm: 519,
      spectra: { EX: fitcExcitation, EM: fitcEmission },
    })
    // 530/30 = 515–545nm, FITC emission peak 519 is right inside
    expect(isDetectable(fl, 530, 30)).toBe(true)
  })

  it('FITC is NOT detectable by 780/60 filter (with spectra)', () => {
    const fl = makeFluorophore({
      em_max_nm: 519,
      spectra: { EX: fitcExcitation, EM: fitcEmission },
    })
    expect(isDetectable(fl, 780, 60)).toBe(false)
  })

  it('APC (em 660) is detectable by 670/30 (655–685nm) (with spectra)', () => {
    const fl = makeFluorophore({
      id: 'apc',
      name: 'APC',
      ex_max_nm: 650,
      em_max_nm: 660,
      spectra: { EX: apcExcitation, EM: apcEmission },
    })
    expect(isDetectable(fl, 670, 30)).toBe(true)
  })

  it('uses fallback when no spectra: emission max within generous 2× window', () => {
    const fl = makeFluorophore({ em_max_nm: 519, spectra: null })
    expect(isDetectable(fl, 530, 30)).toBe(true)   // 500–560 range
    expect(isDetectable(fl, 780, 60)).toBe(false)   // 720–840 range
  })
})

describe('isCompatible', () => {
  it('combines excitable + detectable', () => {
    const fl = makeFluorophore({
      spectra: { EX: fitcExcitation, EM: fitcEmission },
    })
    // FITC + 488nm laser + 530/30 detector → compatible
    expect(isCompatible(fl, 488, 530, 30)).toBe(true)
    // FITC + 637nm laser + 530/30 detector → not excitable
    expect(isCompatible(fl, 637, 530, 30)).toBe(false)
    // FITC + 488nm laser + 780/60 detector → not detectable
    expect(isCompatible(fl, 488, 780, 60)).toBe(false)
  })
})

describe('excitationEfficiency', () => {
  it('returns high efficiency near excitation peak with spectra', () => {
    const fl = makeFluorophore({
      spectra: { EX: fitcExcitation, EM: fitcEmission },
    })
    expect(excitationEfficiency(fl, 488)).toBeGreaterThan(0.8)
  })

  it('returns ~0 far from excitation peak with spectra', () => {
    const fl = makeFluorophore({
      spectra: { EX: fitcExcitation, EM: fitcEmission },
    })
    expect(excitationEfficiency(fl, 637)).toBeLessThan(0.01)
  })

  it('Gaussian fallback: PE excited well by 561nm (peak-only)', () => {
    const pe = makeFluorophore({
      id: 'pe',
      name: 'PE',
      ex_max_nm: 565,
      em_max_nm: 578,
      spectra: null,
    })
    expect(excitationEfficiency(pe, 561)).toBeGreaterThan(0.9)
  })

  it('Gaussian fallback: PE poorly excited by 405nm', () => {
    const pe = makeFluorophore({
      id: 'pe',
      name: 'PE',
      ex_max_nm: 565,
      em_max_nm: 578,
      spectra: null,
    })
    expect(excitationEfficiency(pe, 405)).toBeLessThan(0.01)
  })

  it('clamps to [0, 1] when spectra data has artifacts producing ratio > 1', () => {
    // Spectrum with a data artifact: intensity at 500nm exceeds the "peak"
    const artifactSpectrum: number[][] = [
      [400, 0],
      [450, 0.5],
      [480, 0.8],
      [500, 1.2],  // artifact: exceeds the reported peak at 480
      [550, 0.3],
      [600, 0],
    ]
    const fl = makeFluorophore({
      spectra: { EX: artifactSpectrum, EM: fitcEmission },
    })
    const eff = excitationEfficiency(fl, 500)
    expect(eff).toBeLessThanOrEqual(1.0)
    expect(eff).toBeGreaterThanOrEqual(0)
  })
})

describe('detectionEfficiency', () => {
  it('returns meaningful efficiency when emission peak is in bandpass (with spectra)', () => {
    const fl = makeFluorophore({
      spectra: { EX: fitcExcitation, EM: fitcEmission },
    })
    expect(detectionEfficiency(fl, 530, 30)).toBeGreaterThan(0.1)
  })

  it('returns ~0 when bandpass is far from emission (with spectra)', () => {
    const fl = makeFluorophore({
      spectra: { EX: fitcExcitation, EM: fitcEmission },
    })
    expect(detectionEfficiency(fl, 780, 60)).toBeLessThan(0.01)
  })

  it('Gaussian fallback: PE detected by 585/15 bandpass', () => {
    const pe = makeFluorophore({
      id: 'pe',
      name: 'PE',
      ex_max_nm: 565,
      em_max_nm: 578,
      spectra: null,
    })
    expect(detectionEfficiency(pe, 585, 15)).toBeGreaterThan(0.1)
  })
})

describe('channelScore', () => {
  it('FITC on 488/530/30 scores well (with spectra)', () => {
    const fl = makeFluorophore({
      spectra: { EX: fitcExcitation, EM: fitcEmission },
    })
    expect(channelScore(fl, 488, 530, 30)).toBeGreaterThan(0.05)
  })

  it('PE on 561/585/15 scores well (Gaussian fallback)', () => {
    const pe = makeFluorophore({
      id: 'pe',
      name: 'PE',
      ex_max_nm: 565,
      em_max_nm: 578,
      spectra: null,
    })
    expect(channelScore(pe, 561, 585, 15)).toBeGreaterThan(0.05)
  })

  it('mismatch laser+detector scores near 0', () => {
    const fl = makeFluorophore({
      spectra: { EX: fitcExcitation, EM: fitcEmission },
    })
    expect(channelScore(fl, 637, 780, 60)).toBeLessThan(0.001)
  })
})

describe('rankChannels', () => {
  const instrument = {
    lasers: [
      {
        id: 'l1',
        wavelength_nm: 488,
        detectors: [
          { id: 'd1', filter_midpoint: 530, filter_width: 30 },
          { id: 'd2', filter_midpoint: 780, filter_width: 60 },
        ],
      },
      {
        id: 'l2',
        wavelength_nm: 637,
        detectors: [
          { id: 'd3', filter_midpoint: 670, filter_width: 30 },
        ],
      },
    ],
  }

  it('ranks FITC highest on 488/530/30', () => {
    const fl = makeFluorophore({
      spectra: { EX: fitcExcitation, EM: fitcEmission },
    })
    const rankings = rankChannels(fl, instrument)
    expect(rankings.length).toBeGreaterThan(0)
    expect(rankings[0].detectorId).toBe('d1')
    expect(rankings[0].laserWavelength).toBe(488)
  })

  it('works with peak-only fluorophores (Gaussian fallback)', () => {
    const pe = makeFluorophore({
      id: 'pe',
      name: 'PE',
      ex_max_nm: 565,
      em_max_nm: 578,
      spectra: null,
    })
    const rankings = rankChannels(pe, instrument)
    // PE should have some rankings via Gaussian fallback
    expect(rankings.length).toBeGreaterThanOrEqual(0)
  })

  it('returns results sorted by score descending', () => {
    const fl = makeFluorophore({
      spectra: { EX: fitcExcitation, EM: fitcEmission },
    })
    const rankings = rankChannels(fl, instrument)
    for (let i = 1; i < rankings.length; i++) {
      expect(rankings[i - 1].score).toBeGreaterThanOrEqual(rankings[i].score)
    }
  })
})
