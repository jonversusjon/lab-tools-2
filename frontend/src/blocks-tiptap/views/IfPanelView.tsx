/**
 * Tiptap NodeView for the if_panel block. Embeds IFPanelDesignerView
 * in instance mode: panel state lives in the Tiptap node's attrs.
 *
 * Parallels FlowPanelView; see PERF_NOTES.md for cross-panel
 * isolation rationale.
 */

import { NodeViewWrapper } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import { memo, useCallback, useMemo, useRef } from 'react'
import { arrayMove } from '@dnd-kit/sortable'
import type { DragEndEvent } from '@dnd-kit/core'

import IFPanelDesignerView from '@/components/if-panels/IFPanelDesignerView'
import type {
  IFPanelDesignerViewHandlers,
  IFPanelDesignerViewConfig,
} from '@/components/if-panels/IFPanelDesignerView'
import { useIFPanelDesignerInstance } from '@/hooks/useIFPanelDesigner'
import type { IFPanelDesignerState } from '@/hooks/useIFPanelDesigner'

import { useAntibodies } from '@/hooks/useAntibodies'
import { useFluorophores } from '@/hooks/useFluorophores'
import { useSecondaries } from '@/hooks/useSecondaries'
import { useConjugateChemistries } from '@/hooks/useConjugateChemistries'
import { useMicroscopes } from '@/hooks/useMicroscopes'
import { useDyeLabels } from '@/hooks/useDyeLabels'

import type {
  IFPanel,
  IFPanelTarget,
  IFPanelAssignment,
  Antibody,
  VolumeParams,
} from '@/types'
import type { TargetSelection } from '@/components/panels/TargetOmnibox'

// ─── State serialization ──────────────────────────────────────────────────────

function defaultIfVolumeParams(): VolumeParams {
  return {
    num_samples: 1,
    volume_per_sample_ul: 200,
    pipet_error_factor: 1.1,
    dilution_source: 'icc_if',
  }
}

function attrsToInitialIfState(attrs: Record<string, unknown>): IFPanelDesignerState {
  const microscopeAttr = (attrs.microscope as { id?: string; name?: string } | null) ?? null
  const targets = (attrs.targets as IFPanelTarget[]) ?? []
  const assignments = (attrs.assignments as IFPanelAssignment[]) ?? []
  const name = (attrs.name as string) ?? ''
  const sourcePanelId = (attrs.source_panel_id as string | null) ?? null
  const viewMode = ((attrs.view_mode as string) ?? 'simple') as 'simple' | 'spectral'

  const panel: IFPanel = {
    id: sourcePanelId ?? 'if-panel-instance',
    name,
    panel_type: (attrs.panel_type as string) ?? 'IF',
    microscope_id: microscopeAttr?.id ?? null,
    view_mode: viewMode,
    created_at: null,
    updated_at: null,
    targets,
    assignments,
  }

  return {
    panel,
    microscope: microscopeAttr as IFPanelDesignerState['microscope'],
    viewMode,
    targets,
    assignments,
    isDirty: false,
    past: [],
    future: [],
  }
}

function stateToIfAttrs(
  state: IFPanelDesignerState,
  refs: {
    view_mode: 'simple' | 'spectral'
    volume_params: VolumeParams
    source_panel_id: string | null
    panel_type: string
  }
): Record<string, unknown> {
  return {
    source_panel_id: refs.source_panel_id,
    name: state.panel?.name ?? '',
    panel_type: refs.panel_type,
    microscope: state.microscope,
    view_mode: refs.view_mode,
    targets: state.targets,
    assignments: state.assignments,
    volume_params: refs.volume_params,
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

function IfPanelViewImpl({ node, editor, getPos, updateAttributes }: NodeViewProps) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initialState = useMemo(() => attrsToInitialIfState(node.attrs), [])

  const viewModeRef = useRef<'simple' | 'spectral'>(
    ((node.attrs.view_mode as string) ?? 'simple') as 'simple' | 'spectral'
  )
  const volumeParamsRef = useRef<VolumeParams>(
    (node.attrs.volume_params as VolumeParams) ?? defaultIfVolumeParams()
  )
  const sourcePanelIdRef = useRef<string | null>(
    (node.attrs.source_panel_id as string | null) ?? null
  )
  const panelTypeRef = useRef<string>(
    (node.attrs.panel_type as string) ?? 'IF'
  )

  const onChange = useCallback(
    (newState: IFPanelDesignerState) => {
      updateAttributes(stateToIfAttrs(newState, {
        view_mode: viewModeRef.current,
        volume_params: volumeParamsRef.current,
        source_panel_id: sourcePanelIdRef.current,
        panel_type: panelTypeRef.current,
      }))
    },
    [updateAttributes]
  )

  const hookOutput = useIFPanelDesignerInstance(initialState, onChange)

  // ─── Data fetching ──────────────────────────────────────────────────────────

  const { data: antibodiesData } = useAntibodies({ skip: 0, limit: 2000 })
  const { data: fluorophoreData } = useFluorophores({ skip: 0, limit: 2000 })
  const { data: secondariesData } = useSecondaries({ skip: 0, limit: 500 })
  const { data: conjugateChemistries = [] } = useConjugateChemistries()
  const { data: microscopesData } = useMicroscopes(0, 500)
  const { data: dyeLabelsData } = useDyeLabels({ limit: 2000 })

  const antibodies = antibodiesData?.items ?? []
  const fluorophores = fluorophoreData?.items ?? []
  const secondaries = secondariesData?.items ?? []
  const dyeLabels = dyeLabelsData?.items ?? []

  // ─── Lookup maps ────────────────────────────────────────────────────────────

  const antibodyMap = useMemo(() => {
    const map = new Map<string, Antibody>()
    for (const ab of antibodies) map.set(ab.id, ab)
    return map
  }, [antibodies])

  const assignmentByAntibody = useMemo(() => {
    const map = new Map<string, IFPanelAssignment>()
    for (const a of hookOutput.state.assignments) {
      if (a?.antibody_id) map.set(a.antibody_id, a)
    }
    return map
  }, [hookOutput.state.assignments])

  const assignmentByDyeLabel = useMemo(() => {
    const map = new Map<string, IFPanelAssignment>()
    for (const a of hookOutput.state.assignments) {
      if (a?.dye_label_id) map.set(a.dye_label_id, a)
    }
    return map
  }, [hookOutput.state.assignments])

  // ─── Handlers ───────────────────────────────────────────────────────────────

  const handlers: IFPanelDesignerViewHandlers = useMemo(
    () => ({
      onAddTarget: async (selection: TargetSelection) => {
        const newId = 'instance-target-' + Date.now()
        let target: IFPanelTarget
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
            dilution_override: null,
            antibody_icc_if_dilution: null,
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
            dilution_override: null,
            antibody_icc_if_dilution: null,
          }
        }
        hookOutput.addTarget(target)
        return undefined
      },

      onRemoveTarget: async (targetId: string, antibodyId: string | null) => {
        hookOutput.removeTarget(targetId, antibodyId)
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

        const updatedTarget: IFPanelTarget = {
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

      onAssignFluorophore: async (antibodyId: string, fluorophoreId: string) => {
        const instanceId = 'instance-assignment-' + Date.now()
        const existing = assignmentByAntibody.get(antibodyId)
        if (existing) {
          hookOutput.dispatch({ type: 'REMOVE_ASSIGNMENT', assignmentId: existing.id })
        }
        const optimistic: IFPanelAssignment = {
          id: instanceId,
          panel_id: 'instance',
          antibody_id: antibodyId,
          dye_label_id: null,
          fluorophore_id: fluorophoreId,
          filter_id: null,
          notes: null,
        }
        hookOutput.dispatch({ type: 'ADD_ASSIGNMENT', assignment: optimistic })
      },

      onClearFluorophore: async (antibodyId: string) => {
        const existing = assignmentByAntibody.get(antibodyId)
        if (!existing) return
        hookOutput.dispatch({ type: 'REMOVE_ASSIGNMENT', assignmentId: existing.id })
      },

      onSelectSecondary: async (targetId: string, secondaryId: string) => {
        const target = hookOutput.state.targets.find((t) => t.id === targetId)
        if (!target) return
        const sec = secondaries.find((s) => s.id === secondaryId)
        const updatedTarget: IFPanelTarget = {
          ...target,
          staining_mode: 'indirect',
          secondary_antibody_id: secondaryId,
          secondary_antibody_name: sec?.name ?? null,
          secondary_fluorophore_id: sec?.fluorophore_id ?? null,
          secondary_fluorophore_name: sec?.fluorophore_name ?? null,
        }
        hookOutput.dispatch({ type: 'UPDATE_TARGET', target: updatedTarget })
        // Auto-assign secondary fluorophore if available
        if (sec?.fluorophore_id && target.antibody_id) {
          const existing = assignmentByAntibody.get(target.antibody_id)
          if (existing && existing.fluorophore_id !== sec.fluorophore_id) {
            hookOutput.dispatch({ type: 'REMOVE_ASSIGNMENT', assignmentId: existing.id })
          }
          const optimistic: IFPanelAssignment = {
            id: 'instance-assignment-' + Date.now(),
            panel_id: 'instance',
            antibody_id: target.antibody_id,
            dye_label_id: null,
            fluorophore_id: sec.fluorophore_id,
            filter_id: null,
            notes: null,
          }
          hookOutput.dispatch({ type: 'ADD_ASSIGNMENT', assignment: optimistic })
        }
      },

      onSelectFluorophoreFromSecondary: async (targetId: string, fluorophoreId: string) => {
        const target = hookOutput.state.targets.find((t) => t.id === targetId)
        if (!target?.antibody_id) return
        const existing = assignmentByAntibody.get(target.antibody_id)
        if (existing) {
          hookOutput.dispatch({ type: 'REMOVE_ASSIGNMENT', assignmentId: existing.id })
        }
        const optimistic: IFPanelAssignment = {
          id: 'instance-assignment-' + Date.now(),
          panel_id: 'instance',
          antibody_id: target.antibody_id,
          dye_label_id: null,
          fluorophore_id: fluorophoreId,
          filter_id: null,
          notes: null,
        }
        hookOutput.dispatch({ type: 'ADD_ASSIGNMENT', assignment: optimistic })
      },

      onClearSecondary: async (targetId: string) => {
        const target = hookOutput.state.targets.find((t) => t.id === targetId)
        if (!target) return
        const antibodyId = target.antibody_id
        if (antibodyId) {
          const existing = assignmentByAntibody.get(antibodyId)
          if (existing) {
            hookOutput.dispatch({ type: 'REMOVE_ASSIGNMENT', assignmentId: existing.id })
          }
        }
        const updatedTarget: IFPanelTarget = {
          ...target,
          staining_mode: 'direct',
          secondary_antibody_id: null,
          secondary_antibody_name: null,
          secondary_fluorophore_id: null,
          secondary_fluorophore_name: null,
        }
        hookOutput.dispatch({ type: 'UPDATE_TARGET', target: updatedTarget })
      },

      onUpdateChannel: async (
        rowId: string,
        isDyeLabel: boolean,
        oldAssignment: IFPanelAssignment | null,
        newFilterId: string | null,
        fluorophoreId: string,
      ) => {
        if (oldAssignment) {
          hookOutput.dispatch({ type: 'REMOVE_ASSIGNMENT', assignmentId: oldAssignment.id })
        }
        const optimistic: IFPanelAssignment = {
          id: 'instance-assignment-' + Date.now(),
          panel_id: oldAssignment?.panel_id ?? '',
          antibody_id: isDyeLabel ? null : rowId,
          dye_label_id: isDyeLabel ? rowId : null,
          fluorophore_id: oldAssignment?.fluorophore_id ?? fluorophoreId,
          filter_id: newFilterId,
          notes: oldAssignment?.notes ?? null,
        }
        hookOutput.dispatch({ type: 'ADD_ASSIGNMENT', assignment: optimistic })
      },

      onSaveDilution: (targetId: string, dilutionOverride: string | null) => {
        const target = hookOutput.state.targets.find((t) => t.id === targetId)
        if (!target) return
        if (dilutionOverride === target.dilution_override) return
        hookOutput.dispatch({
          type: 'UPDATE_TARGET',
          target: { ...target, dilution_override: dilutionOverride },
        })
      },

      onSaveName: (name: string) => {
        const currentPanel = hookOutput.state.panel
        if (!currentPanel) return
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

      onViewModeToggle: (mode: 'simple' | 'spectral') => {
        viewModeRef.current = mode
        hookOutput.dispatch({ type: 'SET_VIEW_MODE', viewMode: mode })
        // Also persist the new view_mode to attrs directly so it survives a cold-mount
        updateAttributes({ ...node.attrs, view_mode: mode })
      },

      onMicroscopeChange: (microscopeId: string) => {
        const newId = microscopeId || null
        const microscope = (microscopesData?.items ?? []).find((m) => m.id === newId) ?? null
        hookOutput.dispatch({ type: 'SET_MICROSCOPE', microscope })
      },

      onDelete: () => {
        const pos = typeof getPos === 'function' ? getPos() : null
        if (pos == null) return
        editor.chain().focus().command(({ tr }) => {
          tr.delete(pos, pos + node.nodeSize)
          return true
        }).run()
      },
    }),
    [
      hookOutput,
      antibodyMap,
      assignmentByAntibody,
      assignmentByDyeLabel,
      secondaries,
      microscopesData,
      node.attrs,
      node.nodeSize,
      getPos,
      editor,
      updateAttributes,
    ]
  )

  const config: IFPanelDesignerViewConfig = useMemo(
    () => ({
      showBackButton: false,
      showMicroscopeSelector: true,
      showDelete: true,
      showViewModeToggle: true,
      showUndoRedo: false,
    }),
    []
  )

  return (
    <NodeViewWrapper className="if-panel-instance my-4 border border-border rounded-md p-4">
      <IFPanelDesignerView
        state={hookOutput.state}
        dispatch={hookOutput.dispatch}
        handlers={handlers}
        config={config}
        antibodies={antibodies}
        dyeLabels={dyeLabels}
        fluorophores={fluorophores}
        secondaries={secondaries}
        conjugateChemistries={conjugateChemistries}
        microscopes={microscopesData?.items ?? []}
        compatibilityData={null}
      />
    </NodeViewWrapper>
  )
}

/**
 * Memoize on node.attrs identity. Tiptap creates a fresh `node` object on
 * every transaction; default React.memo (shallow equal) sees every
 * transaction as a change. We re-render only when attrs actually change.
 */
export default memo(IfPanelViewImpl, (prev, next) => {
  if (prev.node.attrs !== next.node.attrs) return false
  return true
})
