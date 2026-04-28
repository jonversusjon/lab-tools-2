/**
 * Tiptap NodeView for the flow_panel block. Embeds PanelDesignerView
 * in instance mode: panel state lives in the Tiptap node's attrs.
 *
 * PERF NOTE — see PERF_NOTES.md at repo root. This component is
 * memoized with a custom comparator to prevent re-renders when other
 * panels in the same editor change. Cross-panel isolation is the
 * load-bearing perf property. Verify with manual testing in the
 * sandbox; render-count tests are deferred.
 */

import { NodeViewWrapper } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import { memo, useCallback, useMemo, useRef, useState } from 'react'
import { arrayMove } from '@dnd-kit/sortable'
import type { DragEndEvent } from '@dnd-kit/core'

import PanelDesignerView from '@/components/panels/PanelDesignerView'
import type {
  PanelDesignerViewHandlers,
  PanelDesignerViewConfig,
} from '@/components/panels/PanelDesignerView'
import { usePanelDesignerInstance } from '@/hooks/usePanelDesigner'
import type { PanelDesignerState } from '@/hooks/usePanelDesigner'

import { useAntibodies } from '@/hooks/useAntibodies'
import { useFluorophores, useBatchSpectra } from '@/hooks/useFluorophores'
import { useSecondaries } from '@/hooks/useSecondaries'
import { useConjugateChemistries } from '@/hooks/useConjugateChemistries'
import { useInstruments } from '@/hooks/useInstruments'
import { useDyeLabels } from '@/hooks/useDyeLabels'

import type {
  Panel,
  PanelTarget,
  PanelAssignment,
  Antibody,
  FluorophoreWithSpectra,
  VolumeParams,
} from '@/types'
import type { TargetSelection } from '@/components/panels/TargetOmnibox'

// ─── State serialization ──────────────────────────────────────────────────────

function attrsToInitialState(attrs: Record<string, unknown>): PanelDesignerState {
  const instrument = (attrs.instrument as Panel['id'] | null) ?? null
  const targets = (attrs.targets as PanelTarget[]) ?? []
  const assignments = (attrs.assignments as PanelAssignment[]) ?? []
  const name = (attrs.name as string) ?? ''
  const sourcePanelId = (attrs.source_panel_id as string | null) ?? null

  const panel: Panel = {
    id: sourcePanelId ?? 'flow-panel-instance',
    name,
    instrument_id: (instrument as unknown as { id?: string } | null)?.id ?? null,
    created_at: null,
    updated_at: null,
    targets,
    assignments,
  }

  return {
    panel,
    instrument: instrument as unknown as PanelDesignerState['instrument'],
    targets,
    assignments,
    isDirty: false,
    past: [],
    future: [],
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

function FlowPanelViewImpl({ node, editor, getPos, updateAttributes }: NodeViewProps) {
  // Initial state computed once at mount from node attrs. Intentionally
  // not re-derived from attrs on re-render — the hook owns state after mount.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initialState = useMemo(() => attrsToInitialState(node.attrs), [])

  // volume_params is not part of PanelDesignerState, preserve from initial attrs
  const volumeParamsRef = useRef<VolumeParams>(
    (node.attrs.volume_params as VolumeParams) ?? {
      num_samples: 1,
      volume_per_sample_ul: 100,
      pipet_error_factor: 1.1,
      dilution_source: 'flow',
    }
  )

  // source_panel_id is not in PanelDesignerState, preserve from initial attrs
  const sourcePanelIdRef = useRef<string | null>(
    (node.attrs.source_panel_id as string | null) ?? null
  )

  // Sync state back to Tiptap attrs on every change
  const onChange = useCallback(
    (newState: PanelDesignerState) => {
      updateAttributes({
        source_panel_id: sourcePanelIdRef.current,
        name: newState.panel?.name ?? '',
        instrument: newState.instrument,
        targets: newState.targets,
        assignments: newState.assignments,
        volume_params: volumeParamsRef.current,
      })
    },
    [updateAttributes]
  )

  const hookOutput = usePanelDesignerInstance(initialState, onChange)

  // ─── Data fetching ──────────────────────────────────────────────────────────

  const { data: antibodiesData } = useAntibodies({ skip: 0, limit: 2000 })
  const { data: fluorophoreData } = useFluorophores({ skip: 0, limit: 2000, has_spectra: true })
  const { data: allFluorophoreData } = useFluorophores({ skip: 0, limit: 2000 })
  const { data: secondariesData } = useSecondaries()
  const { data: conjugateChemistries = [] } = useConjugateChemistries()
  const { data: dyeLabelsData } = useDyeLabels({ limit: 2000 })
  const { data: instrumentsData } = useInstruments(0, 500)

  const antibodies = antibodiesData?.items ?? []
  const fluorophoreList = fluorophoreData?.items ?? []
  const allFluorophores = allFluorophoreData?.items ?? []
  const secondaries = secondariesData?.items ?? []
  const dyeLabels = dyeLabelsData?.items ?? []

  // Batch spectra for compatibility checks and spillover
  const fluorophoreIdsToFetch = useMemo(() => {
    const ids = new Set(fluorophoreList.map((f) => f.id))
    for (const a of hookOutput.state.assignments) {
      if (a?.fluorophore_id) ids.add(a.fluorophore_id)
    }
    return Array.from(ids)
  }, [fluorophoreList, hookOutput.state.assignments])

  const { data: spectraCache } = useBatchSpectra(fluorophoreIdsToFetch)

  const fluorophoresWithSpectra: FluorophoreWithSpectra[] = useMemo(() => {
    return fluorophoreList.map((fl) => ({
      ...fl,
      spectra: spectraCache?.[fl.id] ?? null,
    }))
  }, [fluorophoreList, spectraCache])

  const allFluorophoresForScoring: FluorophoreWithSpectra[] = useMemo(() => {
    return allFluorophores.map((fl) => ({
      ...fl,
      spectra: spectraCache?.[fl.id] ?? null,
    }))
  }, [allFluorophores, spectraCache])

  // ─── Local UI state ─────────────────────────────────────────────────────────

  const [autoAssign, setAutoAssign] = useState(true)
  const [minThreshold, setMinThreshold] = useState(0.20)

  // ─── Lookup maps for handler construction ───────────────────────────────────

  const antibodyMap = useMemo(() => {
    const map = new Map<string, Antibody>()
    for (const ab of antibodies) map.set(ab.id, ab)
    return map
  }, [antibodies])

  const assignmentByAntibody = useMemo(() => {
    const map = new Map<string, PanelAssignment>()
    for (const a of hookOutput.state.assignments) {
      if (a?.antibody_id) map.set(a.antibody_id, a)
    }
    return map
  }, [hookOutput.state.assignments])

  const assignmentByDyeLabel = useMemo(() => {
    const map = new Map<string, PanelAssignment>()
    for (const a of hookOutput.state.assignments) {
      if (a?.dye_label_id) map.set(a.dye_label_id, a)
    }
    return map
  }, [hookOutput.state.assignments])

  // ─── Handlers ───────────────────────────────────────────────────────────────

  const handlers: PanelDesignerViewHandlers = useMemo(
    () => ({
      onAddTarget: async (selection: TargetSelection) => {
        const newId = 'instance-target-' + Date.now()
        let target: PanelTarget
        if (selection.type === 'antibody') {
          const ab = selection.antibody
          target = {
            id: newId,
            panel_id: 'instance',
            antibody_id: ab.id,
            dye_label_id: null,
            dye_label_name: null,
            dye_label_target: null,
            dye_label_fluorophore_id: null,
            dye_label_fluorophore_name: null,
            staining_mode: 'direct',
            secondary_antibody_id: null,
            sort_order: hookOutput.state.targets.length,
            antibody_name: ab.target,
            antibody_target: ab.target,
            secondary_antibody_name: null,
            secondary_fluorophore_id: null,
            secondary_fluorophore_name: null,
          }
        } else {
          const dl = selection.dyeLabel
          target = {
            id: newId,
            panel_id: 'instance',
            antibody_id: null,
            dye_label_id: dl.id,
            dye_label_name: dl.name,
            dye_label_target: dl.label_target,
            dye_label_fluorophore_id: dl.fluorophore_id,
            dye_label_fluorophore_name: dl.fluorophore_name,
            staining_mode: 'direct',
            secondary_antibody_id: null,
            sort_order: hookOutput.state.targets.length,
            antibody_name: null,
            antibody_target: null,
            secondary_antibody_name: null,
            secondary_fluorophore_id: null,
            secondary_fluorophore_name: null,
          }
        }
        hookOutput.addTarget(target)
        if (selection.type === 'dye_label' && selection.dyeLabel.fluorophore_id) {
          return { dyeLabelId: selection.dyeLabel.id, fluorophoreId: selection.dyeLabel.fluorophore_id, targetId: newId }
        }
        return null
      },

      onRemoveTarget: async (targetId: string, _antibodyId: string | null) => {
        // _antibodyId unused in instance mode — cascade is handled by reducer
        hookOutput.removeTarget(targetId, _antibodyId)
      },

      onReplaceTargetAntibody: async (targetId: string, newAntibody: Antibody) => {
        const target = hookOutput.state.targets.find((t) => t.id === targetId)
        if (!target || !target.antibody_id) return
        const oldAntibodyId = target.antibody_id
        if (oldAntibodyId === newAntibody.id) return

        const oldAb = antibodyMap.get(oldAntibodyId)
        const existingAssignment = assignmentByAntibody.get(oldAntibodyId)
        const shouldClearAssignment =
          existingAssignment && oldAb?.fluorophore_id && !target.secondary_antibody_id

        const updatedTarget: PanelTarget = {
          ...target,
          antibody_id: newAntibody.id,
          antibody_name: newAntibody.target,
          antibody_target: newAntibody.target,
          secondary_antibody_id: null,
          secondary_antibody_name: null,
          secondary_fluorophore_id: null,
          secondary_fluorophore_name: null,
        }

        if (shouldClearAssignment) {
          hookOutput.dispatch({ type: 'UPDATE_TARGET', target: updatedTarget })
          hookOutput.dispatch({ type: 'REMOVE_ASSIGNMENT', assignmentId: existingAssignment.id })
        } else {
          hookOutput.dispatch({
            type: 'REPLACE_TARGET_ANTIBODY',
            targetId,
            oldAntibodyId,
            newAntibodyId: newAntibody.id,
            updatedTarget,
          })
        }
      },

      onReorderTargets: (event: DragEndEvent) => {
        const { active, over } = event
        if (!over || active.id === over.id) return

        const oldIndex = hookOutput.state.targets.findIndex((t) => t.id === active.id)
        const newIndex = hookOutput.state.targets.findIndex((t) => t.id === over.id)

        if (oldIndex !== -1 && newIndex !== -1) {
          const newTargets = arrayMove(hookOutput.state.targets, oldIndex, newIndex)
          hookOutput.reorderTargets(newTargets.map((t) => t.id))
        }
      },

      onSetSecondary: async (targetId: string, secondaryId: string) => {
        const target = hookOutput.state.targets.find((t) => t.id === targetId)
        const antibodyId = target?.antibody_id
        const sec = secondaries.find((s) => s.id === secondaryId)

        if (antibodyId && sec?.fluorophore_id) {
          const existing = assignmentByAntibody.get(antibodyId)
          if (existing && existing.fluorophore_id !== sec.fluorophore_id) {
            hookOutput.dispatch({ type: 'REMOVE_ASSIGNMENT', assignmentId: existing.id })
          }
        }

        if (target) {
          const updatedTarget: PanelTarget = {
            ...target,
            staining_mode: 'indirect',
            secondary_antibody_id: secondaryId,
            secondary_antibody_name: sec?.name ?? null,
            secondary_fluorophore_id: sec?.fluorophore_id ?? null,
            secondary_fluorophore_name: sec?.fluorophore_name ?? null,
          }
          hookOutput.dispatch({ type: 'UPDATE_TARGET', target: updatedTarget })
        }
      },

      onClearSecondary: async (targetId: string) => {
        const target = hookOutput.state.targets.find((t) => t.id === targetId)
        const antibodyId = target?.antibody_id

        if (antibodyId) {
          const existing = assignmentByAntibody.get(antibodyId)
          if (existing) {
            hookOutput.dispatch({ type: 'REMOVE_ASSIGNMENT', assignmentId: existing.id })
          }
        }

        if (target) {
          const updatedTarget: PanelTarget = {
            ...target,
            staining_mode: 'direct',
            secondary_antibody_id: null,
            secondary_antibody_name: null,
            secondary_fluorophore_id: null,
            secondary_fluorophore_name: null,
          }
          hookOutput.dispatch({ type: 'UPDATE_TARGET', target: updatedTarget })
        }
      },

      onDirectAssign: async (
        rowId: string,
        fluorophoreId: string,
        detectorId: string,
        isDyeLabel?: boolean
      ) => {
        const instanceId = 'instance-assignment-' + Date.now()
        const optimistic: PanelAssignment = {
          id: instanceId,
          panel_id: 'instance',
          antibody_id: isDyeLabel ? null : rowId,
          dye_label_id: isDyeLabel ? rowId : null,
          fluorophore_id: fluorophoreId,
          detector_id: detectorId,
          notes: null,
        }

        const existing = isDyeLabel
          ? assignmentByDyeLabel.get(rowId)
          : assignmentByAntibody.get(rowId)
        if (existing) {
          hookOutput.dispatch({ type: 'REMOVE_ASSIGNMENT', assignmentId: existing.id })
        }

        hookOutput.dispatch({ type: 'ADD_ASSIGNMENT', assignment: optimistic })
      },

      onUnassign: async (_rowId: string, assignmentId: string, _fluorophoreId: string) => {
        hookOutput.dispatch({ type: 'REMOVE_ASSIGNMENT', assignmentId })
      },

      onPickerSelectFluorophore: async (_fluorophoreId: string) => {
        // The view manages rawFluorophoreOverrides and calls onDirectAssign directly.
      },

      onPickerSelectSecondary: async (_secondaryId: string) => {
        // Handled by view's handleCellPickerSelectSecondary (calls onSetSecondary + onDirectAssign).
      },

      onPickerClear: async () => {
        // The view manages rawFluorophoreOverrides cleanup itself.
      },

      onSaveName: (name: string) => {
        const currentPanel = hookOutput.state.panel
        if (!currentPanel) return
        // SET_PANEL preserves targets/assignments from its panel argument.
        // Clears undo history — acceptable for a name change in instance mode.
        hookOutput.dispatch({
          type: 'SET_PANEL',
          panel: {
            ...currentPanel,
            name,
            targets: hookOutput.state.targets,
            assignments: hookOutput.state.assignments,
          },
        })
      },

      onInstrumentChange: (instrumentId: string) => {
        const newId = instrumentId || null
        const instrument =
          (instrumentsData?.items ?? []).find((i) => i.id === newId) ?? null
        const currentPanel = hookOutput.state.panel
        if (!currentPanel) return

        // SET_PANEL updates instrument_id and clears assignments atomically;
        // SET_INSTRUMENT updates state.instrument for the spectra/grid UI.
        // React 18 batches both dispatches — onChange fires once with final state.
        hookOutput.dispatch({
          type: 'SET_PANEL',
          panel: {
            ...currentPanel,
            instrument_id: newId,
            targets: hookOutput.state.targets,
            assignments: [],
          },
        })
        hookOutput.dispatch({ type: 'SET_INSTRUMENT', instrument })
      },

      onInstrumentChangeCopy: undefined,
      copyInProgress: undefined,

      onUndo: () => {
        hookOutput.undo()
      },
      onRedo: () => {
        hookOutput.redo()
      },
      canUndo: hookOutput.canUndo,
      canRedo: hookOutput.canRedo,

      onDelete: () => {
        const pos = typeof getPos === 'function' ? getPos() : null
        if (pos == null) return
        editor.chain().focus().command(({ tr }) => {
          tr.delete(pos, pos + node.nodeSize)
          return true
        }).run()
      },

      autoAssign,
      minThreshold,
      onAutoAssignToggle: () => {
        setAutoAssign((prev) => !prev)
      },
      onThresholdChange: (e: React.ChangeEvent<HTMLInputElement>) => {
        setMinThreshold(Number(e.target.value) / 100)
      },
    }),
    [
      hookOutput,
      antibodyMap,
      assignmentByAntibody,
      assignmentByDyeLabel,
      secondaries,
      instrumentsData,
      autoAssign,
      minThreshold,
      node.nodeSize,
      getPos,
      editor,
    ]
  )

  const config: PanelDesignerViewConfig = useMemo(
    () => ({
      showBackButton: false,
      showInstrumentSelector: true,
      instruments: instrumentsData?.items ?? [],
      showAutoAssign: true,
      showDelete: true,
    }),
    [instrumentsData]
  )

  return (
    <NodeViewWrapper className="flow-panel-instance my-4 border border-gray-200 dark:border-gray-700 rounded-md p-4">
      <PanelDesignerView
        state={hookOutput.state}
        dispatch={hookOutput.dispatch}
        handlers={handlers}
        config={config}
        antibodies={antibodies}
        dyeLabels={dyeLabels}
        allFluorophores={allFluorophores}
        secondaries={secondaries}
        conjugateChemistries={conjugateChemistries}
        spectraCache={spectraCache ?? null}
        fluorophoresWithSpectra={fluorophoresWithSpectra}
        allFluorophoresForScoring={allFluorophoresForScoring}
      />
    </NodeViewWrapper>
  )
}

/**
 * Memoize on node.attrs identity. Tiptap creates a fresh `node` object on
 * every transaction; default React.memo (shallow equal) sees every
 * transaction as a change. We re-render only when attrs actually change.
 */
export default memo(FlowPanelViewImpl, (prev, next) => {
  if (prev.node.attrs !== next.node.attrs) return false
  return true
})
