import { describe, it, expect } from 'vitest'
import { ifPanelDesignerReducer } from '../useIFPanelDesigner'
import type { IFPanelDesignerState } from '../useIFPanelDesigner'
import type { IFPanel, IFPanelTarget, IFPanelAssignment } from '@/types'
import { getDetectionStrategy } from '@/utils/conjugates'

// ---------------------------------------------------------------------------
// Test factories
// ---------------------------------------------------------------------------

function makeState(overrides: Partial<IFPanelDesignerState> = {}): IFPanelDesignerState {
  return {
    panel: null,
    microscope: null,
    viewMode: 'simple',
    targets: [],
    assignments: [],
    isDirty: false,
    past: [],
    future: [],
    ...overrides,
  }
}

function makePanel(overrides: Partial<IFPanel> = {}): IFPanel {
  return {
    id: 'panel-1',
    name: 'Test Panel',
    panel_type: 'IF',
    microscope_id: null,
    view_mode: 'simple',
    created_at: null,
    updated_at: null,
    targets: [],
    assignments: [],
    ...overrides,
  }
}

function makeTarget(overrides: Partial<IFPanelTarget> = {}): IFPanelTarget {
  return {
    id: 'target-1',
    panel_id: 'panel-1',
    antibody_id: 'ab-1',
    staining_mode: 'direct',
    secondary_antibody_id: null,
    sort_order: 0,
    antibody_name: 'CD4 Ab',
    antibody_target: 'CD4',
    secondary_antibody_name: null,
    secondary_fluorophore_id: null,
    secondary_fluorophore_name: null,
    dilution_override: null,
    antibody_icc_if_dilution: null,
    ...overrides,
  }
}

function makeAssignment(overrides: Partial<IFPanelAssignment> = {}): IFPanelAssignment {
  return {
    id: 'assign-1',
    panel_id: 'panel-1',
    antibody_id: 'ab-1',
    fluorophore_id: 'fl-1',
    filter_id: null,
    notes: null,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// SET_PANEL
// ---------------------------------------------------------------------------

describe('SET_PANEL', () => {
  it('initializes targets, assignments, viewMode from panel', () => {
    const targets = [makeTarget()]
    const assignments = [makeAssignment()]
    const panel = makePanel({ targets, assignments })
    const state = makeState({ isDirty: true, past: [[]], future: [[]] })

    const next = ifPanelDesignerReducer(state, { type: 'SET_PANEL', panel })

    expect(next.panel).toBe(panel)
    expect(next.targets).toEqual(targets)
    expect(next.assignments).toEqual(assignments)
    expect(next.isDirty).toBe(false)
    expect(next.past).toEqual([])
    expect(next.future).toEqual([])
  })

  it('preserves spectral viewMode from panel', () => {
    const panel = makePanel({ view_mode: 'spectral' })
    const state = makeState()

    const next = ifPanelDesignerReducer(state, { type: 'SET_PANEL', panel })

    expect(next.viewMode).toBe('spectral')
  })
})

// ---------------------------------------------------------------------------
// SET_MICROSCOPE
// ---------------------------------------------------------------------------

describe('SET_MICROSCOPE', () => {
  it('sets microscope without clearing other state', () => {
    const target = makeTarget()
    const state = makeState({ targets: [target], isDirty: true })
    const microscope = {
      id: 'scope-1',
      name: 'Confocal',
      is_favorite: false,
      location: null,
      lasers: [],
    }

    const next = ifPanelDesignerReducer(state, { type: 'SET_MICROSCOPE', microscope })

    expect(next.microscope).toEqual(microscope)
    expect(next.targets).toEqual([target])
    expect(next.isDirty).toBe(true)
  })

  it('can set microscope to null', () => {
    const state = makeState()
    const next = ifPanelDesignerReducer(state, { type: 'SET_MICROSCOPE', microscope: null })
    expect(next.microscope).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// SET_VIEW_MODE
// ---------------------------------------------------------------------------

describe('SET_VIEW_MODE', () => {
  it('changes viewMode and does not clear assignments', () => {
    const assignment = makeAssignment()
    const state = makeState({ assignments: [assignment] })

    const next = ifPanelDesignerReducer(state, { type: 'SET_VIEW_MODE', viewMode: 'spectral' })

    expect(next.viewMode).toBe('spectral')
    expect(next.assignments).toEqual([assignment])
  })
})

// ---------------------------------------------------------------------------
// ADD_TARGET
// ---------------------------------------------------------------------------

describe('ADD_TARGET', () => {
  it('appends target and sets isDirty', () => {
    const state = makeState()
    const target = makeTarget()

    const next = ifPanelDesignerReducer(state, { type: 'ADD_TARGET', target })

    expect(next.targets).toHaveLength(1)
    expect(next.targets[0]).toBe(target)
    expect(next.isDirty).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// REMOVE_TARGET
// ---------------------------------------------------------------------------

describe('REMOVE_TARGET', () => {
  it('removes target and its assignment by antibody_id', () => {
    const target = makeTarget({ id: 'target-1', antibody_id: 'ab-1' })
    const assignment = makeAssignment({ antibody_id: 'ab-1' })
    const otherAssignment = makeAssignment({ id: 'assign-2', antibody_id: 'ab-2' })
    const state = makeState({
      targets: [target],
      assignments: [assignment, otherAssignment],
    })

    const next = ifPanelDesignerReducer(state, {
      type: 'REMOVE_TARGET',
      targetId: 'target-1',
      antibodyId: 'ab-1',
    })

    expect(next.targets).toHaveLength(0)
    expect(next.assignments).toHaveLength(1)
    expect(next.assignments[0].id).toBe('assign-2')
    expect(next.isDirty).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// ADD_ASSIGNMENT
// ---------------------------------------------------------------------------

describe('ADD_ASSIGNMENT', () => {
  it('appends assignment and pushes to undo stack', () => {
    const existing = makeAssignment({ id: 'assign-1' })
    const state = makeState({ assignments: [existing] })
    const newAssignment = makeAssignment({ id: 'assign-2', antibody_id: 'ab-2' })

    const next = ifPanelDesignerReducer(state, { type: 'ADD_ASSIGNMENT', assignment: newAssignment })

    expect(next.assignments).toHaveLength(2)
    expect(next.past).toHaveLength(1)
    expect(next.past[0]).toEqual([existing])
    expect(next.future).toEqual([])
    expect(next.isDirty).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// REMOVE_ASSIGNMENT
// ---------------------------------------------------------------------------

describe('REMOVE_ASSIGNMENT', () => {
  it('removes assignment by id and pushes to undo stack', () => {
    const a1 = makeAssignment({ id: 'assign-1' })
    const a2 = makeAssignment({ id: 'assign-2', antibody_id: 'ab-2' })
    const state = makeState({ assignments: [a1, a2] })

    const next = ifPanelDesignerReducer(state, { type: 'REMOVE_ASSIGNMENT', assignmentId: 'assign-1' })

    expect(next.assignments).toHaveLength(1)
    expect(next.assignments[0].id).toBe('assign-2')
    expect(next.past).toHaveLength(1)
    expect(next.past[0]).toEqual([a1, a2])
    expect(next.isDirty).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// UNDO / REDO
// ---------------------------------------------------------------------------

describe('UNDO', () => {
  it('restores previous assignments snapshot', () => {
    const previous = [makeAssignment({ id: 'old-1' })]
    const current = [makeAssignment({ id: 'current-1' })]
    const state = makeState({ assignments: current, past: [previous] })

    const next = ifPanelDesignerReducer(state, { type: 'UNDO' })

    expect(next.assignments).toEqual(previous)
    expect(next.past).toEqual([])
    expect(next.future[0]).toEqual(current)
    expect(next.isDirty).toBe(true)
  })

  it('returns unchanged state when past stack is empty', () => {
    const state = makeState()
    const next = ifPanelDesignerReducer(state, { type: 'UNDO' })
    expect(next).toBe(state)
  })
})

describe('REDO', () => {
  it('restores next assignments snapshot', () => {
    const next_snapshot = [makeAssignment({ id: 'next-1' })]
    const current = [makeAssignment({ id: 'current-1' })]
    const state = makeState({ assignments: current, future: [next_snapshot] })

    const next = ifPanelDesignerReducer(state, { type: 'REDO' })

    expect(next.assignments).toEqual(next_snapshot)
    expect(next.future).toEqual([])
    expect(next.past[next.past.length - 1]).toEqual(current)
    expect(next.isDirty).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// REORDER_TARGETS
// ---------------------------------------------------------------------------

describe('REORDER_TARGETS', () => {
  it('reorders targets by provided ID order', () => {
    const t1 = makeTarget({ id: 'target-1', sort_order: 0 })
    const t2 = makeTarget({ id: 'target-2', sort_order: 1 })
    const t3 = makeTarget({ id: 'target-3', sort_order: 2 })
    const state = makeState({ targets: [t1, t2, t3] })

    const next = ifPanelDesignerReducer(state, {
      type: 'REORDER_TARGETS',
      targetIds: ['target-3', 'target-1', 'target-2'],
    })

    expect(next.targets.map((t) => t.id)).toEqual(['target-3', 'target-1', 'target-2'])
    expect(next.isDirty).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// CLEAR_ASSIGNMENTS
// ---------------------------------------------------------------------------

describe('CLEAR_ASSIGNMENTS', () => {
  it('empties assignments and clears undo/redo stacks', () => {
    const assignment = makeAssignment()
    const state = makeState({
      assignments: [assignment],
      past: [[assignment]],
      future: [[assignment]],
    })

    const next = ifPanelDesignerReducer(state, { type: 'CLEAR_ASSIGNMENTS' })

    expect(next.assignments).toEqual([])
    expect(next.past).toEqual([])
    expect(next.future).toEqual([])
    expect(next.isDirty).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// UPDATE_ASSIGNMENT_ID
// ---------------------------------------------------------------------------

describe('UPDATE_ASSIGNMENT_ID', () => {
  it('updates id across assignments, past, and future stacks', () => {
    const a = makeAssignment({ id: 'old-id' })
    const state = makeState({
      assignments: [a],
      past: [[{ ...a, id: 'old-id' }]],
      future: [[{ ...a, id: 'old-id' }]],
    })

    const next = ifPanelDesignerReducer(state, {
      type: 'UPDATE_ASSIGNMENT_ID',
      oldId: 'old-id',
      newId: 'new-id',
    })

    expect(next.assignments[0].id).toBe('new-id')
    expect(next.past[0][0].id).toBe('new-id')
    expect(next.future[0][0].id).toBe('new-id')
  })
})

// ---------------------------------------------------------------------------
// REPLACE_TARGET_ANTIBODY
// ---------------------------------------------------------------------------

describe('REPLACE_TARGET_ANTIBODY', () => {
  it('updates target and remaps assignment antibody_id', () => {
    const oldTarget = makeTarget({ id: 'target-1', antibody_id: 'ab-old' })
    const newTarget = makeTarget({ id: 'target-1', antibody_id: 'ab-new' })
    const assignment = makeAssignment({ antibody_id: 'ab-old' })
    const state = makeState({ targets: [oldTarget], assignments: [assignment] })

    const next = ifPanelDesignerReducer(state, {
      type: 'REPLACE_TARGET_ANTIBODY',
      targetId: 'target-1',
      oldAntibodyId: 'ab-old',
      newAntibodyId: 'ab-new',
      updatedTarget: newTarget,
    })

    expect(next.targets[0].antibody_id).toBe('ab-new')
    expect(next.assignments[0].antibody_id).toBe('ab-new')
    expect(next.past).toHaveLength(1)
    expect(next.isDirty).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Merged Secondary/Fluorophore cell — detection strategy branching
// ---------------------------------------------------------------------------

// Helper mirrors the IFPanelDesigner merged-cell branch logic
function mergedCellCase(
  ab: { fluorophore_id: string | null; conjugate: string | null; host: string | null },
  stainingMode: 'direct' | 'indirect',
  isOverridden: boolean,
): 'preconjugated' | 'secondary' | 'picker' {
  const strategy = getDetectionStrategy(ab)
  if (ab.fluorophore_id && !isOverridden) return 'preconjugated'
  if (stainingMode === 'indirect' || strategy.type !== 'direct' || (isOverridden && strategy.type !== 'direct')) {
    return 'secondary'
  }
  return 'picker'
}

describe('mergedCellCase — pre-conjugated antibody', () => {
  const ab = { fluorophore_id: 'fl-fitc', conjugate: null, host: 'mouse' }

  it('shows preconjugated when not overridden', () => {
    expect(mergedCellCase(ab, 'direct', false)).toBe('preconjugated')
  })

  it('shows picker when overridden (direct strategy, no conjugate)', () => {
    expect(mergedCellCase(ab, 'direct', true)).toBe('picker')
  })
})

describe('mergedCellCase — unconjugated antibody with host', () => {
  // getDetectionStrategy returns 'species' for any unfluoresced antibody,
  // so strategy.type !== 'direct' → secondary shown regardless of staining_mode
  const ab = { fluorophore_id: null, conjugate: null, host: 'rabbit' }

  it('shows secondary when staining mode is indirect', () => {
    expect(mergedCellCase(ab, 'indirect', false)).toBe('secondary')
  })

  it('shows secondary when staining mode is direct (strategy is species)', () => {
    expect(mergedCellCase(ab, 'direct', false)).toBe('secondary')
  })
})

// ---------------------------------------------------------------------------
// Host species cross-reactivity conflict computation
// ---------------------------------------------------------------------------

// Mirrors the hostSpeciesConflicts useMemo logic in IFPanelDesigner
function computeHostConflicts(
  targets: Array<{ id: string; antibody_id: string | null; staining_mode: 'direct' | 'indirect'; antibody_target?: string | null }>,
  abMap: Map<string, { host: string | null; fluorophore_id: string | null; conjugate: string | null; target: string }>,
): Map<string, string[]> {
  const hostMap = new Map<string, { names: string[]; hasIndirect: boolean }>()
  for (const t of targets) {
    const ab = t.antibody_id ? abMap.get(t.antibody_id) : undefined
    if (!ab?.host) continue
    const key = ab.host.toLowerCase()
    const strategy = getDetectionStrategy(ab)
    const isIndirect = t.staining_mode === 'indirect' || strategy.type !== 'direct'
    if (!hostMap.has(key)) hostMap.set(key, { names: [], hasIndirect: false })
    const entry = hostMap.get(key)!
    entry.names.push(t.antibody_target ?? ab.target)
    if (isIndirect) entry.hasIndirect = true
  }
  const conflicts = new Map<string, string[]>()
  for (const [host, { names, hasIndirect }] of hostMap) {
    if (names.length > 1 && hasIndirect) conflicts.set(host, names)
  }
  return conflicts
}

describe('computeHostConflicts', () => {
  it('warns when two indirect antibodies share a host', () => {
    const targets = [
      { id: 't1', antibody_id: 'ab1', staining_mode: 'indirect' as const, antibody_target: 'GFAP' },
      { id: 't2', antibody_id: 'ab2', staining_mode: 'indirect' as const, antibody_target: 'NeuN' },
    ]
    const abMap = new Map([
      ['ab1', { host: 'Mouse', fluorophore_id: null, conjugate: null, target: 'GFAP' }],
      ['ab2', { host: 'Mouse', fluorophore_id: null, conjugate: null, target: 'NeuN' }],
    ])
    const conflicts = computeHostConflicts(targets, abMap)
    expect(conflicts.size).toBe(1)
    expect(conflicts.get('mouse')).toEqual(['GFAP', 'NeuN'])
  })

  it('does not warn when only one antibody per host', () => {
    const targets = [
      { id: 't1', antibody_id: 'ab1', staining_mode: 'indirect' as const, antibody_target: 'GFAP' },
      { id: 't2', antibody_id: 'ab2', staining_mode: 'indirect' as const, antibody_target: 'NeuN' },
    ]
    const abMap = new Map([
      ['ab1', { host: 'Mouse', fluorophore_id: null, conjugate: null, target: 'GFAP' }],
      ['ab2', { host: 'Rabbit', fluorophore_id: null, conjugate: null, target: 'NeuN' }],
    ])
    const conflicts = computeHostConflicts(targets, abMap)
    expect(conflicts.size).toBe(0)
  })

  it('does not warn for pre-conjugated antibodies sharing a host (no indirect needed)', () => {
    const targets = [
      { id: 't1', antibody_id: 'ab1', staining_mode: 'direct' as const, antibody_target: 'CD4' },
      { id: 't2', antibody_id: 'ab2', staining_mode: 'direct' as const, antibody_target: 'CD8' },
    ]
    const abMap = new Map([
      ['ab1', { host: 'Mouse', fluorophore_id: 'fl-fitc', conjugate: null, target: 'CD4' }],
      ['ab2', { host: 'Mouse', fluorophore_id: 'fl-pe', conjugate: null, target: 'CD8' }],
    ])
    const conflicts = computeHostConflicts(targets, abMap)
    // Both are direct (have fluorophore_id) → strategy.type === 'direct' → no indirect → no warning
    expect(conflicts.size).toBe(0)
  })

  it('warns when one pre-conjugated and one indirect share a host', () => {
    // pre-conjugated: strategy.type === 'direct' → isIndirect = false
    // indirect: strategy.type !== 'direct' → isIndirect = true
    // Group has 2 names and hasIndirect = true → should warn
    const targets = [
      { id: 't1', antibody_id: 'ab1', staining_mode: 'direct' as const, antibody_target: 'CD4' },
      { id: 't2', antibody_id: 'ab2', staining_mode: 'indirect' as const, antibody_target: 'CD8' },
    ]
    const abMap = new Map([
      ['ab1', { host: 'Mouse', fluorophore_id: 'fl-fitc', conjugate: null, target: 'CD4' }],
      ['ab2', { host: 'Mouse', fluorophore_id: null, conjugate: null, target: 'CD8' }],
    ])
    const conflicts = computeHostConflicts(targets, abMap)
    expect(conflicts.size).toBe(1)
  })

  it('ignores antibodies with null host', () => {
    const targets = [
      { id: 't1', antibody_id: 'ab1', staining_mode: 'indirect' as const, antibody_target: 'GFAP' },
      { id: 't2', antibody_id: 'ab2', staining_mode: 'indirect' as const, antibody_target: 'NeuN' },
    ]
    const abMap = new Map([
      ['ab1', { host: null, fluorophore_id: null, conjugate: null, target: 'GFAP' }],
      ['ab2', { host: null, fluorophore_id: null, conjugate: null, target: 'NeuN' }],
    ])
    const conflicts = computeHostConflicts(targets, abMap)
    expect(conflicts.size).toBe(0)
  })
})

describe('mergedCellCase — biotin-conjugated antibody', () => {
  const ab = { fluorophore_id: null, conjugate: 'biotin', host: null }

  it('shows secondary (conjugate strategy)', () => {
    expect(mergedCellCase(ab, 'direct', false)).toBe('secondary')
  })

  it('still shows secondary when overridden (conjugate strategy)', () => {
    expect(mergedCellCase(ab, 'direct', true)).toBe('secondary')
  })
})

// ---------------------------------------------------------------------------
// Dilution display value logic
// ---------------------------------------------------------------------------

describe('dilution display value', () => {
  // Mirrors the dilutionMap initialization: dilution_override ?? antibody_icc_if_dilution ?? ''
  function dilutionDisplayValue(t: { dilution_override: string | null; antibody_icc_if_dilution: string | null }): string {
    return t.dilution_override ?? t.antibody_icc_if_dilution ?? ''
  }

  it('shows dilution_override when set', () => {
    const t = { dilution_override: '1:500', antibody_icc_if_dilution: '1:200' }
    expect(dilutionDisplayValue(t)).toBe('1:500')
  })

  it('falls back to antibody_icc_if_dilution when no override', () => {
    const t = { dilution_override: null, antibody_icc_if_dilution: '1:200' }
    expect(dilutionDisplayValue(t)).toBe('1:200')
  })

  it('returns empty string when both are null', () => {
    const t = { dilution_override: null, antibody_icc_if_dilution: null }
    expect(dilutionDisplayValue(t)).toBe('')
  })
})
