import { describe, it, expect } from 'vitest'
import {
  getWellId,
  getRectangularRegion,
  toggleWellSelection,
  getWellsInRectangle,
  getWellIndices,
  getRowWells,
  getColumnWells,
} from '@/utils/wellUtils'

const ROW_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
const COL_LABELS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12']

describe('getWellId', () => {
  it('returns A1 for row 0, col 0', () => {
    expect(getWellId(0, 0, ROW_LABELS, COL_LABELS)).toBe('A1')
  })

  it('returns H12 for row 7, col 11', () => {
    expect(getWellId(7, 11, ROW_LABELS, COL_LABELS)).toBe('H12')
  })

  it('returns B3 for row 1, col 2', () => {
    expect(getWellId(1, 2, ROW_LABELS, COL_LABELS)).toBe('B3')
  })
})

describe('getWellIndices', () => {
  it('parses A1 to row 0, col 0', () => {
    expect(getWellIndices('A1', ROW_LABELS, COL_LABELS)).toEqual({ row: 0, col: 0 })
  })

  it('parses H12 to row 7, col 11', () => {
    expect(getWellIndices('H12', ROW_LABELS, COL_LABELS)).toEqual({ row: 7, col: 11 })
  })

  it('parses B10 to row 1, col 9', () => {
    expect(getWellIndices('B10', ROW_LABELS, COL_LABELS)).toEqual({ row: 1, col: 9 })
  })
})

describe('getRowWells', () => {
  it('returns all 12 wells in row A', () => {
    const wells = getRowWells(0, ROW_LABELS, COL_LABELS)
    expect(wells).toHaveLength(12)
    expect(wells[0]).toBe('A1')
    expect(wells[11]).toBe('A12')
  })
})

describe('getColumnWells', () => {
  it('returns all 8 wells in column 1', () => {
    const wells = getColumnWells(0, ROW_LABELS, COL_LABELS)
    expect(wells).toHaveLength(8)
    expect(wells[0]).toBe('A1')
    expect(wells[7]).toBe('H1')
  })
})

describe('getRectangularRegion', () => {
  it('returns a single well for same start/end', () => {
    const wells = getRectangularRegion({ row: 0, col: 0 }, { row: 0, col: 0 }, ROW_LABELS, COL_LABELS)
    expect(wells).toEqual(['A1'])
  })

  it('returns 4 wells for a 2x2 region', () => {
    const wells = getRectangularRegion({ row: 0, col: 0 }, { row: 1, col: 1 }, ROW_LABELS, COL_LABELS)
    expect(wells).toHaveLength(4)
    expect(wells).toContain('A1')
    expect(wells).toContain('A2')
    expect(wells).toContain('B1')
    expect(wells).toContain('B2')
  })

  it('works when end is before start (reversed selection)', () => {
    const wells = getRectangularRegion({ row: 2, col: 3 }, { row: 1, col: 2 }, ROW_LABELS, COL_LABELS)
    expect(wells).toHaveLength(4)
    expect(wells).toContain('B3')
    expect(wells).toContain('B4')
    expect(wells).toContain('C3')
    expect(wells).toContain('C4')
  })
})

describe('toggleWellSelection', () => {
  it('adds wells not yet selected', () => {
    const result = toggleWellSelection(['A1', 'A2'], ['B1'])
    expect(result).toContain('A1')
    expect(result).toContain('A2')
    expect(result).toContain('B1')
  })

  it('deselects all if all provided wells are selected', () => {
    const result = toggleWellSelection(['A1', 'A2'], ['A1', 'A2', 'B1'])
    expect(result).not.toContain('A1')
    expect(result).not.toContain('A2')
    expect(result).toContain('B1')
  })

  it('adds missing wells even if some are already selected', () => {
    const result = toggleWellSelection(['A1', 'A2', 'A3'], ['A1'])
    expect(result).toContain('A1')
    expect(result).toContain('A2')
    expect(result).toContain('A3')
  })
})

describe('getWellsInRectangle', () => {
  const positions: Record<string, { x: number; y: number; width: number; height: number }> = {
    A1: { x: 0, y: 0, width: 40, height: 40 },
    A2: { x: 40, y: 0, width: 40, height: 40 },
    B1: { x: 0, y: 40, width: 40, height: 40 },
    B2: { x: 40, y: 40, width: 40, height: 40 },
  }

  it('selects wells whose centers fall inside the rect', () => {
    // center of A1 = (20, 20), A2 = (60, 20), B1 = (20, 60), B2 = (60, 60)
    const wells = getWellsInRectangle(
      { startX: 10, startY: 10, endX: 70, endY: 70 },
      positions
    )
    expect(wells).toHaveLength(4)
    expect(wells).toContain('A1')
    expect(wells).toContain('A2')
    expect(wells).toContain('B1')
    expect(wells).toContain('B2')
  })

  it('selects only wells inside the rect', () => {
    const wells = getWellsInRectangle(
      { startX: 10, startY: 10, endX: 30, endY: 30 },
      positions
    )
    expect(wells).toEqual(['A1'])
  })

  it('returns empty array when no wells in rect', () => {
    const wells = getWellsInRectangle(
      { startX: 200, startY: 200, endX: 300, endY: 300 },
      positions
    )
    expect(wells).toHaveLength(0)
  })
})
