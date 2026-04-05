/** Generate well ID from row/col indices: getWellId(0, 0, rowLabels, colLabels) → "A1" */
export function getWellId(row: number, col: number, rowLabels: string[], colLabels: string[]): string {
  return rowLabels[row] + colLabels[col]
}

/** Parse well ID back to indices: getWellIndices("A1", rowLabels, colLabels) → { row: 0, col: 0 } */
export function getWellIndices(
  wellId: string,
  rowLabels: string[],
  colLabels: string[]
): { row: number; col: number } {
  const rowLabel = wellId.charAt(0)
  const colLabel = wellId.slice(1)
  return {
    row: rowLabels.indexOf(rowLabel),
    col: colLabels.indexOf(colLabel),
  }
}

/** All well IDs in a single row */
export function getRowWells(rowIndex: number, rowLabels: string[], colLabels: string[]): string[] {
  return colLabels.map((_, col) => getWellId(rowIndex, col, rowLabels, colLabels))
}

/** All well IDs in a single column */
export function getColumnWells(colIndex: number, rowLabels: string[], colLabels: string[]): string[] {
  return rowLabels.map((_, row) => getWellId(row, colIndex, rowLabels, colLabels))
}

/** All well IDs in a rectangular region defined by two corners */
export function getRectangularRegion(
  start: { row: number; col: number },
  end: { row: number; col: number },
  rowLabels: string[],
  colLabels: string[]
): string[] {
  const minRow = Math.min(start.row, end.row)
  const maxRow = Math.max(start.row, end.row)
  const minCol = Math.min(start.col, end.col)
  const maxCol = Math.max(start.col, end.col)
  const wells: string[] = []
  for (let r = minRow; r <= maxRow; r++) {
    for (let c = minCol; c <= maxCol; c++) {
      wells.push(getWellId(r, c, rowLabels, colLabels))
    }
  }
  return wells
}

/** All well IDs in a row range (for shift-click on row headers) */
export function getRowRegion(
  startRow: number,
  endRow: number,
  rowLabels: string[],
  colLabels: string[]
): string[] {
  const minRow = Math.min(startRow, endRow)
  const maxRow = Math.max(startRow, endRow)
  const wells: string[] = []
  for (let r = minRow; r <= maxRow; r++) {
    for (let c = 0; c < colLabels.length; c++) {
      wells.push(getWellId(r, c, rowLabels, colLabels))
    }
  }
  return wells
}

/** All well IDs in a column range (for shift-click on column headers) */
export function getColumnRegion(
  startCol: number,
  endCol: number,
  rowLabels: string[],
  colLabels: string[]
): string[] {
  const minCol = Math.min(startCol, endCol)
  const maxCol = Math.max(startCol, endCol)
  const wells: string[] = []
  for (let r = 0; r < rowLabels.length; r++) {
    for (let c = minCol; c <= maxCol; c++) {
      wells.push(getWellId(r, c, rowLabels, colLabels))
    }
  }
  return wells
}

/**
 * Toggle wells: if ALL provided wells are currently selected, deselect them.
 * Otherwise, select all (union with current selection).
 */
export function toggleWellSelection(wells: string[], currentSelection: string[]): string[] {
  const selSet = new Set(currentSelection)
  const allSelected = wells.every((w) => selSet.has(w))
  if (allSelected) {
    return currentSelection.filter((w) => !wells.includes(w))
  }
  const next = new Set(currentSelection)
  wells.forEach((w) => next.add(w))
  return Array.from(next)
}

/** Find wells whose bounding box intersects a drag-selection rectangle */
export function getWellsInRectangle(
  rect: { startX: number; startY: number; endX: number; endY: number },
  wellPositions: Record<string, { x: number; y: number; width: number; height: number }>
): string[] {
  const left = Math.min(rect.startX, rect.endX)
  const right = Math.max(rect.startX, rect.endX)
  const top = Math.min(rect.startY, rect.endY)
  const bottom = Math.max(rect.startY, rect.endY)

  return Object.entries(wellPositions)
    .filter(([, pos]) =>
      pos.x < right &&
      pos.x + pos.width > left &&
      pos.y < bottom &&
      pos.y + pos.height > top
    )
    .map(([wellId]) => wellId)
}
