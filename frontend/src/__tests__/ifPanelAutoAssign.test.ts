import { describe, it, expect } from 'vitest'
import { computeAutoAssignPayload } from '@/utils/ifPanelAutoAssign'
import type { Antibody, IFPanelTarget } from '@/types'

function makeTarget(overrides: Partial<IFPanelTarget> = {}): IFPanelTarget {
  return {
    id: 't1',
    panel_id: 'p1',
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
    dilution_override: null,
    antibody_icc_if_dilution: null,
    ...overrides,
  }
}

function makeAntibody(overrides: Partial<Antibody> = {}): Antibody {
  return {
    id: 'ab1',
    name: 'CD3',
    target: 'CD3',
    clone: null,
    host: null,
    isotype: null,
    fluorophore_id: null,
    conjugate: null,
    vendor: null,
    catalog_number: null,
    confirmed_in_stock: false,
    date_received: null,
    flow_dilution: null,
    icc_if_dilution: null,
    wb_dilution: null,
    flow_dilution_factor: null,
    icc_if_dilution_factor: null,
    wb_dilution_factor: null,
    reacts_with: null,
    storage_temp: null,
    validation_notes: null,
    notes: null,
    website: null,
    physical_location: null,
    fluorophore_name: null,
    is_favorite: false,
    tags: [],
    created_at: null,
    updated_at: null,
    ...overrides,
  }
}

describe('computeAutoAssignPayload (#4 DAPI selector regression)', () => {
  it('returns dye-label assignment when dye-label has fluorophore_id', () => {
    const target = makeTarget({
      dye_label_id: 'dapi-dl',
      dye_label_fluorophore_id: 'dapi-fl',
    })
    expect(computeAutoAssignPayload(target, [])).toEqual({
      dye_label_id: 'dapi-dl',
      fluorophore_id: 'dapi-fl',
      filter_id: null,
    })
  })

  it('returns null for dye-label without fluorophore_id', () => {
    const target = makeTarget({
      dye_label_id: 'dl-1',
      dye_label_fluorophore_id: null,
    })
    expect(computeAutoAssignPayload(target, [])).toBeNull()
  })

  it('returns antibody assignment for pre-conjugated antibody', () => {
    const ab = makeAntibody({ id: 'ab-fitc', fluorophore_id: 'fitc' })
    const target = makeTarget({ antibody_id: 'ab-fitc' })
    expect(computeAutoAssignPayload(target, [ab])).toEqual({
      antibody_id: 'ab-fitc',
      fluorophore_id: 'fitc',
      filter_id: null,
    })
  })

  it('returns null for unconjugated antibody (user picks fluorophore)', () => {
    const ab = makeAntibody({ id: 'ab-unconj', fluorophore_id: null })
    const target = makeTarget({ antibody_id: 'ab-unconj' })
    expect(computeAutoAssignPayload(target, [ab])).toBeNull()
  })

  it('returns null when antibody is missing from the lookup', () => {
    const target = makeTarget({ antibody_id: 'unknown-ab' })
    expect(computeAutoAssignPayload(target, [])).toBeNull()
  })

  it('prefers dye-label over antibody when both are set', () => {
    const target = makeTarget({
      antibody_id: 'ab-fitc',
      dye_label_id: 'dapi-dl',
      dye_label_fluorophore_id: 'dapi-fl',
    })
    const ab = makeAntibody({ id: 'ab-fitc', fluorophore_id: 'fitc' })
    expect(computeAutoAssignPayload(target, [ab])).toEqual({
      dye_label_id: 'dapi-dl',
      fluorophore_id: 'dapi-fl',
      filter_id: null,
    })
  })
})
