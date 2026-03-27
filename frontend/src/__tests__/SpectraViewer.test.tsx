import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('react-chartjs-2', () => ({
  Line: (props: any) => <canvas data-testid="chart" data-datasets={JSON.stringify(props.data?.datasets?.length ?? 0)} />,
}))

vi.mock('chartjs-plugin-annotation', () => ({ default: {} }))

import SpectraViewer from '@/components/spectra/SpectraViewer'

const mockSpectra = {
  excitation: Array.from({ length: 100 }, (_, i) => [350 + i * 2, Math.exp(-((i - 30) ** 2) / 200)]),
  emission: Array.from({ length: 100 }, (_, i) => [400 + i * 2, Math.exp(-((i - 40) ** 2) / 200)]),
}

describe('SpectraViewer', () => {
  it('renders in single mode with mock spectra — canvas element present', () => {
    render(
      <SpectraViewer
        fluorophores={[{ name: 'FITC', spectra: mockSpectra }]}
        mode="single"
      />
    )
    expect(screen.getByTestId('chart')).toBeInTheDocument()
  })

  it('renders in overlay mode with 3 fluorophores', () => {
    render(
      <SpectraViewer
        fluorophores={[
          { name: 'FITC', spectra: mockSpectra },
          { name: 'PE', spectra: mockSpectra },
          { name: 'APC', spectra: mockSpectra },
        ]}
        mode="overlay"
      />
    )
    const chart = screen.getByTestId('chart')
    // 3 datasets (one emission per fluorophore)
    expect(chart.getAttribute('data-datasets')).toBe('3')
  })

  it('accepts laserLines prop without crashing', () => {
    render(
      <SpectraViewer
        fluorophores={[{ name: 'FITC', spectra: mockSpectra }]}
        mode="single"
        laserLines={[488, 561]}
      />
    )
    expect(screen.getByTestId('chart')).toBeInTheDocument()
  })

  it('accepts detectorWindows prop without crashing', () => {
    render(
      <SpectraViewer
        fluorophores={[{ name: 'FITC', spectra: mockSpectra }]}
        mode="single"
        detectorWindows={[{ midpoint: 530, width: 30 }]}
      />
    )
    expect(screen.getByTestId('chart')).toBeInTheDocument()
  })
})
