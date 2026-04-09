import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  listPanels,
  getPanel,
  createPanel,
  updatePanel,
  deletePanel,
  addTarget,
  updateTarget,
  reorderTargets,
  removeTarget,
  addAssignment,
  removeAssignment,
} from '@/api/panels'
import type { PanelCreate, PanelTargetCreate, PanelTargetUpdate, PanelAssignmentCreate } from '@/types'

export function usePanels(skip = 0, limit = 100) {
  return useQuery({
    queryKey: ['panels', { skip, limit }],
    queryFn: () => listPanels(skip, limit),
  })
}

export function usePanel(id: string) {
  return useQuery({
    queryKey: ['panels', id],
    queryFn: () => getPanel(id),
    enabled: !!id,
    // Prevent background refetches from resetting the local designer state
    // (SET_PANEL fires on every panel prop change and wipes optimistic assignments).
    // The designer manages its own state via dispatches; explicit refetchPanel() calls
    // handle intentional reloads (name save, instrument change).
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })
}

export function useCreatePanel() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: PanelCreate) => createPanel(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['panels'] }),
  })
}

export function useUpdatePanel() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: PanelCreate }) =>
      updatePanel(id, data),
    // Only invalidate list queries, not the detail query being actively edited.
    // Detail is refreshed via explicit refetchPanel() calls from the designer.
    // Invalidating the detail triggers SET_PANEL which wipes optimistic state.
    onSuccess: () => qc.invalidateQueries({
      queryKey: ['panels'],
      predicate: (query) => typeof query.queryKey[1] !== 'string',
    }),
  })
}

export function useDeletePanel() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deletePanel(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['panels'] }),
  })
}

export function useAddTarget() {
  return useMutation({
    mutationFn: ({ panelId, antibodyId, data }: { panelId: string; antibodyId?: string; data?: PanelTargetCreate }) =>
      addTarget(panelId, data ?? (antibodyId != null ? { antibody_id: antibodyId } : {})),
  })
}

export function useUpdateTarget() {
  return useMutation({
    mutationFn: ({ panelId, targetId, data }: { panelId: string; targetId: string; data: PanelTargetUpdate }) =>
      updateTarget(panelId, targetId, data),
  })
}

export function useReorderTargets() {
  return useMutation({
    mutationFn: ({ panelId, targetIds }: { panelId: string; targetIds: string[] }) =>
      reorderTargets(panelId, targetIds),
  })
}

export function useRemoveTarget() {
  return useMutation({
    mutationFn: ({ panelId, targetId }: { panelId: string; targetId: string }) =>
      removeTarget(panelId, targetId),
  })
}

export function useAddAssignment() {
  return useMutation({
    mutationFn: ({ panelId, data }: { panelId: string; data: PanelAssignmentCreate }) =>
      addAssignment(panelId, data),
  })
}

export function useRemoveAssignment() {
  return useMutation({
    mutationFn: ({ panelId, assignmentId }: { panelId: string; assignmentId: string }) =>
      removeAssignment(panelId, assignmentId),
  })
}
