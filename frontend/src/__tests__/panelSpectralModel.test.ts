import { describe, it, expect } from 'vitest'
import {
  buildRowFluorophoreMap,
  buildPanelSpectralModel,
} from '@/utils/panelSpectralModel'
import type {
  Antibody,
  FluorophoreWithSpectra,
  Instrument,
  PanelAssignment,
  PanelTarget,
  SecondaryAntibody,
} from '@/types'

// ── Fixture helpers ──────────────────────────────────────────────────────────

function gaussian(center: number, sigma: number, start = 400, end = 700): number[][] {
  return Array.from({ length: end - start + 1 }, (_, i) => {
    const wl = start + i
    return [wl, Math.exp(-((wl - center) ** 2) / (2 * sigma ** 2))]
  })
}

function fluor(
  id: string,
  name: string,
  opts: { ex?: number; em?: number; withSpectra?: boolean } = {}
): FluorophoreWithSpectra {
  const withSpectra = opts.withSpectra ?? true
  return {
    id,
    name,
    fluor_type: null,
    source: 'seed',
    ex_max_nm: opts.ex ?? 488,
    em_max_nm: opts.em ?? 520,
    ext_coeff: null,
    qy: null,
    lifetime_ns: null,
    oligomerization: null,
    switch_type: null,
    has_spectra: withSpectra,
    is_favorite: false,
    spectra: withSpectra
      ? { EX: gaussian(opts.ex ?? 488, 20), EM: gaussian(opts.em ?? 520, 25) }
      : null,
  }
}

function target(partial: Partial<PanelTarget> & { id: string }): PanelTarget {
  return {
    panel_id: 'panel',
    antibody_id: null,
    dye_label_id: null,
    dye_label_name: null,
    dye_label_target: null,
    dye_label_fluorophore_id: null,
    dye_label_fluorophore_name: null,
    staining_mode: 'direct',
    secondary_antibody_id: null,
    sort_order: 0,
    antibody_name: null,
    antibody_target: null,
    secondary_antibody_name: null,
    secondary_fluorophore_id: null,
    secondary_fluorophore_name: null,
    ...partial,
  }
}

function assignment(partial: Partial<PanelAssignment> & { id: string; fluorophore_id: string; detector_id: string }): PanelAssignment {
  return {
    panel_id: 'panel',
    antibody_id: null,
    dye_label_id: null,
    notes: null,
    ...partial,
  }
}

function antibody(partial: Partial<Antibody> & { id: string }): Antibody {
  return { target: 'X', fluorophore_id: null, ...(partial as object) } as unknown as Antibody
}

const instrument: Instrument = {
  id: 'inst',
  name: 'Test Cytometer',
  is_favorite: false,
  location: null,
  lasers: [
    {
      id: 'laser-488',
      instrument_id: 'inst',
      wavelength_nm: 488,
      name: 'Blue',
      detectors: [
        { id: 'det-530', laser_id: 'laser-488', filter_midpoint: 530, filter_width: 30, name: '530/30' },
        { id: 'det-585', laser_id: 'laser-488', filter_midpoint: 585, filter_width: 42, name: '585/42' },
      ],
    },
  ],
}

// ── buildRowFluorophoreMap ───────────────────────────────────────────────────

describe('buildRowFluorophoreMap', () => {
  const antibodyMap = new Map<string, Antibody>([
    ['ab-conj', antibody({ id: 'ab-conj', fluorophore_id: 'fl-conj' })],
    ['ab-unconj', antibody({ id: 'ab-unconj', fluorophore_id: null })],
  ])
  const secondaries: SecondaryAntibody[] = [
    { id: 'sec-1', fluorophore_id: 'fl-sec' } as unknown as SecondaryAntibody,
  ]

  it('prefers a live assignment fluorophore over everything', () => {
    const map = buildRowFluorophoreMap({
      targets: [target({ id: 't1', antibody_id: 'ab-conj' })],
      assignments: [assignment({ id: 'a1', antibody_id: 'ab-conj', fluorophore_id: 'fl-assigned', detector_id: 'det-530' })],
      antibodyMap,
      secondaries,
    })
    expect(map.get('ab-conj')).toBe('fl-assigned')
  })

  it("falls back to the secondary's fluorophore when no assignment", () => {
    const map = buildRowFluorophoreMap({
      targets: [target({ id: 't1', antibody_id: 'ab-unconj', secondary_antibody_id: 'sec-1' })],
      assignments: [],
      antibodyMap,
      secondaries,
    })
    expect(map.get('ab-unconj')).toBe('fl-sec')
  })

  it('uses a raw override when present and no assignment/secondary', () => {
    const map = buildRowFluorophoreMap({
      targets: [target({ id: 't1', antibody_id: 'ab-unconj' })],
      assignments: [],
      antibodyMap,
      secondaries,
      overrides: new Map([['ab-unconj', 'fl-override']]),
    })
    expect(map.get('ab-unconj')).toBe('fl-override')
  })

  it('falls back to a pre-conjugated antibody fluorophore', () => {
    const map = buildRowFluorophoreMap({
      targets: [target({ id: 't1', antibody_id: 'ab-conj' })],
      assignments: [],
      antibodyMap,
      secondaries,
    })
    expect(map.get('ab-conj')).toBe('fl-conj')
  })

  it('resolves a dye-label row from its baked fluorophore', () => {
    const map = buildRowFluorophoreMap({
      targets: [target({ id: 't1', dye_label_id: 'dye-1', dye_label_fluorophore_id: 'fl-dye' })],
      assignments: [],
      antibodyMap,
      secondaries,
    })
    expect(map.get('dye-1')).toBe('fl-dye')
  })
})

// ── buildPanelSpectralModel ──────────────────────────────────────────────────

describe('buildPanelSpectralModel', () => {
  const allFluorophoresForScoring = [
    fluor('fl-a', 'Alexa 488', { ex: 488, em: 520 }),
    fluor('fl-b', 'PE', { ex: 488, em: 578 }),
    fluor('fl-no', 'NoSpectra', { withSpectra: false }),
  ]

  it('lists active targets with their assigned detector (or null)', () => {
    const targets = [
      target({ id: 't1', antibody_id: 'ab-a' }),
      target({ id: 't2', antibody_id: 'ab-b' }),
    ]
    const rowFluorophoreMap = new Map([
      ['ab-a', 'fl-a'],
      ['ab-b', 'fl-b'],
    ])
    const assignments = [
      assignment({ id: 'a1', antibody_id: 'ab-a', fluorophore_id: 'fl-a', detector_id: 'det-530' }),
    ]

    const model = buildPanelSpectralModel({
      instrument,
      targets,
      assignments,
      allFluorophoresForScoring,
      rowFluorophoreMap,
    })

    const byId = new Map(model.activeTargets.map((t) => [t.id, t]))
    expect(byId.get('ab-a')?.detector_id).toBe('det-530')
    expect(byId.get('ab-b')?.detector_id).toBeNull()
    expect(model.activeTargets).toHaveLength(2)
  })

  it('builds a spillover matrix labelled by assigned fluorophore, diagonal 1', () => {
    const assignments = [
      assignment({ id: 'a1', antibody_id: 'ab-a', fluorophore_id: 'fl-a', detector_id: 'det-530' }),
      assignment({ id: 'a2', antibody_id: 'ab-b', fluorophore_id: 'fl-b', detector_id: 'det-585' }),
    ]
    const model = buildPanelSpectralModel({
      instrument,
      targets: [target({ id: 't1', antibody_id: 'ab-a' }), target({ id: 't2', antibody_id: 'ab-b' })],
      assignments,
      allFluorophoresForScoring,
      rowFluorophoreMap: new Map([['ab-a', 'fl-a'], ['ab-b', 'fl-b']]),
    })
    expect(model.spillover.labels).toEqual(['Alexa 488', 'PE'])
    expect(model.spillover.matrix[0][0]).toBe(1)
    expect(model.spillover.matrix[1][1]).toBe(1)
  })

  it('orders spillover labels by target-table order, not assignment order', () => {
    // Assignments are supplied PE-first, but the targets list CD3→Alexa,
    // CD4→PE. The matrix must follow the target order.
    const assignments = [
      assignment({ id: 'a2', antibody_id: 'ab-b', fluorophore_id: 'fl-b', detector_id: 'det-585' }),
      assignment({ id: 'a1', antibody_id: 'ab-a', fluorophore_id: 'fl-a', detector_id: 'det-530' }),
    ]
    const model = buildPanelSpectralModel({
      instrument,
      targets: [target({ id: 't1', antibody_id: 'ab-a' }), target({ id: 't2', antibody_id: 'ab-b' })],
      assignments,
      allFluorophoresForScoring,
      rowFluorophoreMap: new Map([['ab-a', 'fl-a'], ['ab-b', 'fl-b']]),
    })
    expect(model.spillover.labels).toEqual(['Alexa 488', 'PE'])

    // Reversing the target order reverses the matrix labels.
    const reordered = buildPanelSpectralModel({
      instrument,
      targets: [target({ id: 't2', antibody_id: 'ab-b' }), target({ id: 't1', antibody_id: 'ab-a' })],
      assignments,
      allFluorophoresForScoring,
      rowFluorophoreMap: new Map([['ab-a', 'fl-a'], ['ab-b', 'fl-b']]),
    })
    expect(reordered.spillover.labels).toEqual(['PE', 'Alexa 488'])
  })

  it('returns an empty spillover when spectra are not ready', () => {
    const model = buildPanelSpectralModel({
      instrument,
      targets: [target({ id: 't1', antibody_id: 'ab-a' })],
      assignments: [assignment({ id: 'a1', antibody_id: 'ab-a', fluorophore_id: 'fl-a', detector_id: 'det-530' })],
      allFluorophoresForScoring,
      rowFluorophoreMap: new Map([['ab-a', 'fl-a']]),
      spectraReady: false,
    })
    expect(model.spillover.labels).toEqual([])
    expect(model.spillover.matrix).toEqual([])
  })

  it('warns for assigned fluorophores missing emission spectra', () => {
    const model = buildPanelSpectralModel({
      instrument,
      targets: [target({ id: 't1', antibody_id: 'ab-no' })],
      assignments: [assignment({ id: 'a1', antibody_id: 'ab-no', fluorophore_id: 'fl-no', detector_id: 'det-530' })],
      allFluorophoresForScoring,
      rowFluorophoreMap: new Map([['ab-no', 'fl-no']]),
    })
    expect(model.missingSpectraWarnings).toContain('NoSpectra')
  })
})
