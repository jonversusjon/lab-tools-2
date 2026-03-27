import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import FluorophorePicker from '@/components/panels/FluorophorePicker'
import type { Antibody, FluorophoreWithSpectra } from '@/types'

// Gaussian spectra helper
function gaussianSpectrum(center: number, sigma: number, start: number, end: number): number[][] {
  return Array.from({ length: end - start + 1 }, (_, i) => {
    const wl = start + i
    return [wl, Math.exp(-((wl - center) ** 2) / (2 * sigma ** 2))]
  })
}

const fitcFl: FluorophoreWithSpectra = {
  id: 'fl-fitc',
  name: 'FITC',
  excitation_max_nm: 494,
  emission_max_nm: 519,
  source: 'seed',
  spectra: {
    excitation: gaussianSpectrum(494, 20, 400, 600),
    emission: gaussianSpectrum(519, 25, 400, 700),
  },
}

const peFl: FluorophoreWithSpectra = {
  id: 'fl-pe',
  name: 'PE',
  excitation_max_nm: 565,
  emission_max_nm: 578,
  source: 'seed',
  spectra: {
    excitation: gaussianSpectrum(565, 20, 400, 700),
    emission: gaussianSpectrum(578, 25, 400, 700),
  },
}

const apcFl: FluorophoreWithSpectra = {
  id: 'fl-apc',
  name: 'APC',
  excitation_max_nm: 650,
  emission_max_nm: 660,
  source: 'seed',
  spectra: {
    excitation: gaussianSpectrum(650, 20, 550, 750),
    emission: gaussianSpectrum(660, 15, 550, 750),
  },
}

const unconjugatedAb: Antibody = {
  id: 'ab1',
  target: 'CD3',
  clone: 'OKT3',
  host: 'mouse',
  isotype: 'IgG1',
  fluorophore_id: null,
  fluorophore_name: null,
  vendor: null,
  catalog_number: null,
}

const conjugatedAb: Antibody = {
  id: 'ab2',
  target: 'CD4',
  clone: null,
  host: null,
  isotype: null,
  fluorophore_id: 'fl-fitc',
  fluorophore_name: 'FITC',
  vendor: null,
  catalog_number: null,
}

const allFluorophores = [fitcFl, peFl, apcFl]

describe('FluorophorePicker', () => {
  it('only shows compatible fluorophores for a given laser/detector (unconjugated)', () => {
    // Blue laser 488nm, detector 530/30 → FITC compatible, APC not
    render(
      <FluorophorePicker
        laserWavelength={488}
        filterMidpoint={530}
        filterWidth={30}
        assignedFluorophoreIds={new Set()}
        antibody={unconjugatedAb}
        fluorophores={allFluorophores}
        currentAssignmentFluorophoreId={null}
        onSelect={vi.fn()}
        onClear={vi.fn()}
        onClose={vi.fn()}
      />
    )
    expect(screen.getByText('FITC')).toBeInTheDocument()
    expect(screen.queryByText('APC')).not.toBeInTheDocument()
  })

  it('pre-conjugated antibody shows only the conjugated fluorophore', () => {
    // FITC is compatible with 488nm + 530/30
    render(
      <FluorophorePicker
        laserWavelength={488}
        filterMidpoint={530}
        filterWidth={30}
        assignedFluorophoreIds={new Set()}
        antibody={conjugatedAb}
        fluorophores={allFluorophores}
        currentAssignmentFluorophoreId={null}
        onSelect={vi.fn()}
        onClear={vi.fn()}
        onClose={vi.fn()}
      />
    )
    expect(screen.getByText('FITC')).toBeInTheDocument()
    // Should not show other fluorophores
    expect(screen.queryByText('PE')).not.toBeInTheDocument()
    expect(screen.queryByText('APC')).not.toBeInTheDocument()
  })

  it('pre-conjugated antibody with incompatible fluorophore shows warning', () => {
    // FITC is NOT compatible with 637nm red laser + 670/14 detector
    render(
      <FluorophorePicker
        laserWavelength={637}
        filterMidpoint={670}
        filterWidth={14}
        assignedFluorophoreIds={new Set()}
        antibody={conjugatedAb}
        fluorophores={allFluorophores}
        currentAssignmentFluorophoreId={null}
        onSelect={vi.fn()}
        onClear={vi.fn()}
        onClose={vi.fn()}
      />
    )
    expect(screen.getByText(/not compatible/)).toBeInTheDocument()
  })

  it('shows warning icon for already-assigned fluorophores', () => {
    render(
      <FluorophorePicker
        laserWavelength={488}
        filterMidpoint={530}
        filterWidth={30}
        assignedFluorophoreIds={new Set(['fl-fitc'])}
        antibody={unconjugatedAb}
        fluorophores={allFluorophores}
        currentAssignmentFluorophoreId={null}
        onSelect={vi.fn()}
        onClear={vi.fn()}
        onClose={vi.fn()}
      />
    )
    const fitcBtn = screen.getByText('FITC').closest('button')
    expect(fitcBtn?.className).toContain('opacity-50')
  })

  it('selecting a fluorophore calls the onSelect handler', () => {
    const onSelect = vi.fn()
    render(
      <FluorophorePicker
        laserWavelength={488}
        filterMidpoint={530}
        filterWidth={30}
        assignedFluorophoreIds={new Set()}
        antibody={unconjugatedAb}
        fluorophores={allFluorophores}
        currentAssignmentFluorophoreId={null}
        onSelect={onSelect}
        onClear={vi.fn()}
        onClose={vi.fn()}
      />
    )
    fireEvent.click(screen.getByText('FITC'))
    expect(onSelect).toHaveBeenCalledWith('fl-fitc')
  })

  it('"Clear" option appears when cell is already assigned', () => {
    render(
      <FluorophorePicker
        laserWavelength={488}
        filterMidpoint={530}
        filterWidth={30}
        assignedFluorophoreIds={new Set(['fl-fitc'])}
        antibody={unconjugatedAb}
        fluorophores={allFluorophores}
        currentAssignmentFluorophoreId="fl-fitc"
        onSelect={vi.fn()}
        onClear={vi.fn()}
        onClose={vi.fn()}
      />
    )
    expect(screen.getByText('Clear assignment')).toBeInTheDocument()
  })
})
