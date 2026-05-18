import { describe, it, expect } from 'vitest'
import {
  excitationEfficiency,
  detectionEfficiency,
  type SpectrumPoints,
} from '@/utils/efficiencyScore'

// Reference fixture: hand-checked against the backend's
// services/spectra.py::interpolate_at and integrate_bandpass on the
// same arrays. Lets us assert frontend math matches backend to
// ±0.001.
const REF_EX: SpectrumPoints = [
  [450, 0.05],
  [460, 0.1],
  [470, 0.2],
  [480, 0.4],
  [488, 0.85],
  [495, 1.0],
  [500, 0.85],
  [510, 0.4],
  [520, 0.1],
  [530, 0.02],
]

const REF_EM: SpectrumPoints = [
  [490, 0.05],
  [500, 0.15],
  [510, 0.5],
  [519, 1.0],
  [525, 0.85],
  [535, 0.55],
  [545, 0.3],
  [555, 0.15],
  [570, 0.05],
]

// Backend-computed reference values (see commit message / fix-up
// addendum for the Python snippet used to generate these):
//   LASER 488nm ex_eff: 0.85
//   FILTER 530/30 det_eff: 0.661217
//   ARC 488/40 ex_eff: 0.819099
const BACKEND_LASER_488 = 0.85
const BACKEND_FILTER_530_30 = 0.661217
const BACKEND_ARC_488_40 = 0.819099

describe('excitationEfficiency — laser source', () => {
  it('peak excitation: laser at ex max returns ~1.0', () => {
    const eff = excitationEfficiency(REF_EX, 495, {
      laser_wavelength_nm: 495,
    })
    expect(eff).toBeCloseTo(1.0, 6)
  })

  it('off-peak excitation: laser at half-max returns proportional value', () => {
    // 480nm intensity = 0.4, peak = 1.0 → 0.4
    const eff = excitationEfficiency(REF_EX, 495, {
      laser_wavelength_nm: 480,
    })
    expect(eff).toBeCloseTo(0.4, 6)
  })

  it('laser outside spectrum range returns 0', () => {
    const eff = excitationEfficiency(REF_EX, 495, {
      laser_wavelength_nm: 700,
    })
    expect(eff).toBe(0)
  })

  it('matches backend within ±0.001 for laser case (488nm)', () => {
    const eff = excitationEfficiency(REF_EX, 495, {
      laser_wavelength_nm: 488,
      excitation_type: 'laser',
    })
    expect(Math.abs(eff - BACKEND_LASER_488)).toBeLessThanOrEqual(0.001)
  })

  it('no spectrum + ex_max_nm within ±40nm returns 1.0', () => {
    const eff = excitationEfficiency(null, 495, {
      laser_wavelength_nm: 488,
    })
    expect(eff).toBe(1.0)
  })

  it('no spectrum + ex_max_nm outside ±40nm returns 0', () => {
    const eff = excitationEfficiency(null, 495, {
      laser_wavelength_nm: 600,
    })
    expect(eff).toBe(0)
  })

  it('empty spectrum + missing ex_max_nm returns 0', () => {
    const eff = excitationEfficiency([], null, {
      laser_wavelength_nm: 488,
    })
    expect(eff).toBe(0)
  })
})

describe('excitationEfficiency — arc lamp source', () => {
  it('matches backend within ±0.001 for arc case (488nm / 40nm ex filter)', () => {
    const eff = excitationEfficiency(REF_EX, 495, {
      laser_wavelength_nm: 488,
      excitation_type: 'arc',
      ex_filter_width: 40,
    })
    expect(Math.abs(eff - BACKEND_ARC_488_40)).toBeLessThanOrEqual(0.001)
  })

  it('arc with zero ex_filter_width falls back to laser-style point excitation', () => {
    const eff = excitationEfficiency(REF_EX, 495, {
      laser_wavelength_nm: 488,
      excitation_type: 'arc',
      ex_filter_width: 0,
    })
    // Same as plain laser at 488nm: 0.85 / 1.0 = 0.85
    expect(eff).toBeCloseTo(0.85, 6)
  })

  it('arc with no spectrum + ex_max within ±filter_width/2 returns 1.0', () => {
    const eff = excitationEfficiency(null, 500, {
      laser_wavelength_nm: 488,
      excitation_type: 'arc',
      ex_filter_width: 40,
    })
    expect(eff).toBe(1.0)
  })

  it('arc with no spectrum + ex_max outside ±filter_width/2 returns 0', () => {
    const eff = excitationEfficiency(null, 550, {
      laser_wavelength_nm: 488,
      excitation_type: 'arc',
      ex_filter_width: 40,
    })
    expect(eff).toBe(0)
  })
})

describe('detectionEfficiency', () => {
  it('filter centered on emission peak returns near-max collection', () => {
    // Filter 520/40 (500-540) covers most of the emission curve
    const eff = detectionEfficiency(REF_EM, 519, 520, 40)
    expect(eff).toBeGreaterThan(0.6)
  })

  it('filter entirely outside emission range returns 0', () => {
    const eff = detectionEfficiency(REF_EM, 519, 800, 50)
    expect(eff).toBe(0)
  })

  it('matches backend within ±0.001 for 530/30 filter', () => {
    const eff = detectionEfficiency(REF_EM, 519, 530, 30)
    expect(Math.abs(eff - BACKEND_FILTER_530_30)).toBeLessThanOrEqual(0.001)
  })

  it('no spectrum + em_max within ±filter_width of midpoint returns 1.0', () => {
    const eff = detectionEfficiency(null, 530, 530, 30)
    expect(eff).toBe(1.0)
  })

  it('no spectrum + em_max outside ±filter_width returns 0', () => {
    const eff = detectionEfficiency(null, 600, 530, 30)
    expect(eff).toBe(0)
  })

  it('empty spectrum + missing em_max returns 0', () => {
    const eff = detectionEfficiency([], null, 530, 30)
    expect(eff).toBe(0)
  })
})
