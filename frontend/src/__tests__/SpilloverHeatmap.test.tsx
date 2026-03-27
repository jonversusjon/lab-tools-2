import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import SpilloverHeatmap from '@/components/panels/SpilloverHeatmap'

describe('SpilloverHeatmap', () => {
  it('shows placeholder when no assignments', () => {
    render(<SpilloverHeatmap labels={[]} matrix={[]} />)
    expect(
      screen.getByText('Add fluorophore assignments to see spillover matrix')
    ).toBeInTheDocument()
  })

  it('renders NxN grid with correct labels', () => {
    const labels = ['FITC', 'PE', 'APC']
    const matrix: (number | null)[][] = [
      [1.0, 0.15, 0.0],
      [0.05, 1.0, 0.1],
      [0.0, 0.02, 1.0],
    ]
    render(<SpilloverHeatmap labels={labels} matrix={matrix} />)
    // Labels should appear as both row and column headers
    const fitcElements = screen.getAllByText('FITC')
    expect(fitcElements.length).toBeGreaterThanOrEqual(2) // row + column
    const peElements = screen.getAllByText('PE')
    expect(peElements.length).toBeGreaterThanOrEqual(2)
  })

  it('diagonal cells show "1.00"', () => {
    const labels = ['FITC', 'PE']
    const matrix: (number | null)[][] = [
      [1.0, 0.15],
      [0.05, 1.0],
    ]
    render(<SpilloverHeatmap labels={labels} matrix={matrix} />)
    const diag0 = screen.getByTestId('heatmap-cell-0-0')
    expect(diag0.textContent).toBe('1.00')
    const diag1 = screen.getByTestId('heatmap-cell-1-1')
    expect(diag1.textContent).toBe('1.00')
  })

  it('null values show "N/A"', () => {
    const labels = ['FITC', 'Bad']
    const matrix: (number | null)[][] = [
      [1.0, 0.1],
      [null, 1.0],
    ]
    render(<SpilloverHeatmap labels={labels} matrix={matrix} />)
    const cell = screen.getByTestId('heatmap-cell-1-0')
    expect(cell.textContent).toBe('N/A')
  })

  it('high spillover cell (>0.25) has bold text', () => {
    const labels = ['FITC', 'PE']
    const matrix: (number | null)[][] = [
      [1.0, 0.35],
      [0.05, 1.0],
    ]
    render(<SpilloverHeatmap labels={labels} matrix={matrix} />)
    const cell = screen.getByTestId('heatmap-cell-0-1')
    const span = cell.querySelector('span')
    expect(span?.className).toContain('font-bold')
  })

  it('cell background colors are applied', () => {
    const labels = ['FITC', 'PE']
    const matrix: (number | null)[][] = [
      [1.0, 0.4],
      [0.0, 1.0],
    ]
    render(<SpilloverHeatmap labels={labels} matrix={matrix} />)
    // Diagonal should be grey
    const diag = screen.getByTestId('heatmap-cell-0-0')
    expect(diag.style.backgroundColor).toBe('rgb(243, 244, 246)')
    // Off-diagonal with 0.4 should have an orange-ish color (not white)
    const offDiag = screen.getByTestId('heatmap-cell-0-1')
    expect(offDiag.style.backgroundColor).not.toBe('rgb(255, 255, 255)')
    expect(offDiag.style.backgroundColor).not.toBe('')
  })
})
