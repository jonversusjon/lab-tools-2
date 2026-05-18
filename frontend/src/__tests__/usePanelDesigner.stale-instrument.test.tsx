import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { usePanelDesigner } from '@/hooks/usePanelDesigner'
import type { Instrument, Panel } from '@/types'

// Regression test for the stale-cache fix at PanelDesigner.tsx where
// useInstrument(instrumentId ?? '') retains the previously-loaded
// instrument in TanStack Query's cache when the gate flips false.
// The container's job is to coerce to null at the call site; this
// test asserts the hook honors that — when given instrument=null
// after a non-null instrument, state.instrument transitions to null.
//
// If this test fails after refactoring, the stale-cache coercion in
// PanelDesigner.tsx becomes a no-op and the no-instrument banner
// + grid clearing won't react to "None".

function makePanel(overrides: Partial<Panel> = {}): Panel {
  return {
    id: 'p1',
    name: 'P1',
    instrument_id: 'i1',
    created_at: '',
    updated_at: '',
    targets: [],
    assignments: [],
    ...overrides,
  }
}

function makeInstrument(): Instrument {
  return {
    id: 'i1',
    name: 'Test instrument',
    is_favorite: false,
    location: null,
    lasers: [],
  }
}

describe('usePanelDesigner — instrument null transition', () => {
  it('state.instrument becomes null when re-rendered with instrument=null after non-null', () => {
    const panel = makePanel()
    const instrument = makeInstrument()

    const { result, rerender } = renderHook(
      ({ p, i }: { p: Panel | null; i: Instrument | null }) =>
        usePanelDesigner(p, i),
      { initialProps: { p: panel as Panel | null, i: instrument as Instrument | null } },
    )

    expect(result.current.state.instrument).toEqual(instrument)

    // Simulate the container coercing instrument to null (the fix);
    // assert the hook honors it. This is the contract the stale-
    // cache coerce-to-null at the call site depends on.
    rerender({ p: { ...panel, instrument_id: null }, i: null })

    expect(result.current.state.instrument).toBeNull()
  })
})
