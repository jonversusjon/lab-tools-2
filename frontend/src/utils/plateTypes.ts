export interface PlateConfig {
  rows: number
  cols: number
  type: 'well' | 'dish' | 'flask' | 'chamber'
  ratio?: number
}

export const PLATE_TYPES: Record<string, PlateConfig> = {
  '384-well': { rows: 16, cols: 24, type: 'well' },
  '96-well': { rows: 8, cols: 12, type: 'well' },
  '48-well': { rows: 6, cols: 8, type: 'well', ratio: 1.333 },
  '24-well': { rows: 4, cols: 6, type: 'well' },
  '12-well': { rows: 3, cols: 4, type: 'well', ratio: 1.333 },
  '6-well': { rows: 2, cols: 3, type: 'well' },
  '10cm': { rows: 1, cols: 1, type: 'dish' },
  '15cm': { rows: 1, cols: 1, type: 'dish' },
  T25: { rows: 1, cols: 1, type: 'flask' },
  T75: { rows: 1, cols: 1, type: 'flask' },
  T175: { rows: 1, cols: 1, type: 'flask' },
  T225: { rows: 1, cols: 1, type: 'flask' },
  '1-chamber': { rows: 1, cols: 1, type: 'chamber' },
  '2-chamber': { rows: 1, cols: 2, type: 'chamber' },
  '4-chamber': { rows: 2, cols: 2, type: 'chamber' },
  '8-chamber': { rows: 2, cols: 4, type: 'chamber' },
  '16-chamber': { rows: 4, cols: 4, type: 'chamber' },
}

export const PLATE_RATIO = 1.5

export const PLATE_CATEGORIES: Record<string, string[]> = {
  'Well Plates': ['384-well', '96-well', '48-well', '24-well', '12-well', '6-well'],
  'Culture Dishes': ['10cm', '15cm'],
  Flasks: ['T25', 'T75', 'T175', 'T225'],
  'Chamber Slides': ['1-chamber', '2-chamber', '4-chamber', '8-chamber', '16-chamber'],
}

export function getRowLabels(rows: number): string[] {
  return Array.from({ length: rows }, (_, i) => String.fromCharCode(65 + i))
}

export function getColLabels(cols: number): string[] {
  return Array.from({ length: cols }, (_, i) => String(i + 1))
}
