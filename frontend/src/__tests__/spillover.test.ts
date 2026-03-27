import { describe, it, expect, beforeEach } from 'vitest'
import { computeSpilloverMatrix, clearSpilloverCache } from '@/utils/spillover'
import type { SpilloverInput } from '@/utils/spillover'

// Gaussian emission helper
function gaussianEmission(center: number, sigma: number, start: number, end: number): number[][] {
  return Array.from({ length: end - start + 1 }, (_, i) => {
    const wl = start + i
    return [wl, Math.exp(-((wl - center) ** 2) / (2 * sigma ** 2))]
  })
}

beforeEach(() => {
  clearSpilloverCache()
})

describe('computeSpilloverMatrix', () => {
  it('returns empty matrix for empty input', () => {
    const result = computeSpilloverMatrix([])
    expect(result.labels).toEqual([])
    expect(result.matrix).toEqual([])
  })

  it('returns 1x1 matrix with [[1.0]] for single fluorophore', () => {
    const input: SpilloverInput[] = [
      {
        fluorophoreId: 'fl1',
        fluorophoreName: 'FITC',
        emissionSpectra: gaussianEmission(519, 25, 400, 700),
        detectorMidpoint: 530,
        detectorWidth: 30,
      },
    ]
    const result = computeSpilloverMatrix(input)
    expect(result.labels).toEqual(['FITC'])
    expect(result.matrix).toEqual([[1.0]])
  })

  it('diagonal is always 1.0', () => {
    const inputs: SpilloverInput[] = [
      {
        fluorophoreId: 'fl-fitc',
        fluorophoreName: 'FITC',
        emissionSpectra: gaussianEmission(519, 25, 400, 700),
        detectorMidpoint: 530,
        detectorWidth: 30,
      },
      {
        fluorophoreId: 'fl-pe',
        fluorophoreName: 'PE',
        emissionSpectra: gaussianEmission(578, 25, 400, 700),
        detectorMidpoint: 582,
        detectorWidth: 15,
      },
      {
        fluorophoreId: 'fl-apc',
        fluorophoreName: 'APC',
        emissionSpectra: gaussianEmission(660, 15, 550, 750),
        detectorMidpoint: 670,
        detectorWidth: 30,
      },
    ]
    const result = computeSpilloverMatrix(inputs)
    for (let i = 0; i < result.matrix.length; i++) {
      expect(result.matrix[i][i]).toBe(1.0)
    }
  })

  it('non-overlapping fluorophores have ~0 spillover', () => {
    // BV421 emission ~421nm, APC detector at 670/30 — far apart
    const inputs: SpilloverInput[] = [
      {
        fluorophoreId: 'fl-bv421',
        fluorophoreName: 'BV421',
        emissionSpectra: gaussianEmission(421, 20, 380, 520),
        detectorMidpoint: 450,
        detectorWidth: 40,
      },
      {
        fluorophoreId: 'fl-apc',
        fluorophoreName: 'APC',
        emissionSpectra: gaussianEmission(660, 15, 550, 750),
        detectorMidpoint: 670,
        detectorWidth: 30,
      },
    ]
    const result = computeSpilloverMatrix(inputs)
    // BV421 into APC detector should be ~0
    expect(result.matrix[0][1]).toBeLessThan(0.01)
    // APC into BV421 detector should be ~0
    expect(result.matrix[1][0]).toBeLessThan(0.01)
  })

  it('overlapping fluorophores have measurable spillover', () => {
    // Two fluorophores with significant spectral overlap:
    // FITC (em 519) and a close neighbor with detector at 560/40 (wide bandpass)
    const inputs: SpilloverInput[] = [
      {
        fluorophoreId: 'fl-fitc',
        fluorophoreName: 'FITC',
        emissionSpectra: gaussianEmission(519, 30, 400, 700),
        detectorMidpoint: 530,
        detectorWidth: 30,
      },
      {
        fluorophoreId: 'fl-close',
        fluorophoreName: 'CloseNeighbor',
        emissionSpectra: gaussianEmission(550, 30, 400, 700),
        detectorMidpoint: 560,
        detectorWidth: 40,
      },
    ]
    const result = computeSpilloverMatrix(inputs)
    // FITC emission into 540–580nm detector: significant spillover
    expect(result.matrix[0][1]).toBeGreaterThan(0.1)
    // CloseNeighbor emission into 515–545nm FITC detector: also significant
    expect(result.matrix[1][0]).toBeGreaterThan(0.1)
  })

  it('missing/empty spectra produce null entries', () => {
    const inputs: SpilloverInput[] = [
      {
        fluorophoreId: 'fl1',
        fluorophoreName: 'Good',
        emissionSpectra: gaussianEmission(519, 25, 400, 700),
        detectorMidpoint: 530,
        detectorWidth: 30,
      },
      {
        fluorophoreId: 'fl2',
        fluorophoreName: 'NoSpectra',
        emissionSpectra: [],
        detectorMidpoint: 582,
        detectorWidth: 15,
      },
    ]
    const result = computeSpilloverMatrix(inputs)
    // Diagonal always 1.0
    expect(result.matrix[0][0]).toBe(1.0)
    expect(result.matrix[1][1]).toBe(1.0)
    // Row for NoSpectra (index 1) should have null off-diagonal
    expect(result.matrix[1][0]).toBeNull()
    // Good→NoSpectra's detector is a valid computation
    expect(typeof result.matrix[0][1]).toBe('number')
  })

  it('clearSpilloverCache resets the memoization cache', () => {
    const input: SpilloverInput[] = [
      {
        fluorophoreId: 'fl-test',
        fluorophoreName: 'Test',
        emissionSpectra: gaussianEmission(519, 25, 400, 700),
        detectorMidpoint: 530,
        detectorWidth: 30,
      },
    ]
    computeSpilloverMatrix(input)
    // No error — just verify it doesn't throw
    clearSpilloverCache()
    // Recompute should still work
    const result = computeSpilloverMatrix(input)
    expect(result.matrix[0][0]).toBe(1.0)
  })

  it('computes 10x10 matrix in <50ms', () => {
    const inputs: SpilloverInput[] = Array.from({ length: 10 }, (_, i) => ({
      fluorophoreId: 'fl-' + i,
      fluorophoreName: 'Dye' + i,
      emissionSpectra: gaussianEmission(450 + i * 25, 20, 350, 800),
      detectorMidpoint: 460 + i * 25,
      detectorWidth: 20,
    }))
    const start = performance.now()
    const result = computeSpilloverMatrix(inputs)
    const elapsed = performance.now() - start
    expect(result.matrix.length).toBe(10)
    expect(result.matrix[0].length).toBe(10)
    expect(elapsed).toBeLessThan(50)
  })
})
