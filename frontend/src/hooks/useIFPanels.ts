import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  listIFPanels,
  getIFPanel,
  createIFPanel,
  updateIFPanel,
  deleteIFPanel,
  addIFTarget,
  updateIFTarget,
  reorderIFTargets,
  removeIFTarget,
  addIFAssignment,
  removeIFAssignment,
} from '@/api/if_panels'
import type {
  IFPanelCreate,
  IFPanelUpdate,
  IFPanelTargetCreate,
  IFPanelTargetUpdate,
  IFPanelAssignmentCreate,
} from '@/types'

export function useIFPanels(skip = 0, limit = 100) {
  return useQuery({
    queryKey: ['if-panels', { skip, limit }],
    queryFn: () => listIFPanels(skip, limit),
  })
}

export function useIFPanel(id: string) {
  return useQuery({
    queryKey: ['if-panels', id],
    queryFn: () => getIFPanel(id),
    enabled: !!id,
    // Prevent background refetches from resetting the local designer state
    // (SET_PANEL fires on every panel prop change and wipes optimistic assignments).
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })
}

export function useCreateIFPanel() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: IFPanelCreate) => createIFPanel(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['if-panels'] }),
  })
}

export function useUpdateIFPanel() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: IFPanelUpdate }) =>
      updateIFPanel(id, data),
    // Only invalidate list queries, not the detail query being actively edited.
    // Detail is refreshed via explicit refetchPanel() calls from the designer.
    onSuccess: () => qc.invalidateQueries({
      queryKey: ['if-panels'],
      predicate: (query) => typeof query.queryKey[1] !== 'string',
    }),
  })
}

export function useDeleteIFPanel() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteIFPanel(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['if-panels'] }),
  })
}

export function useAddIFTarget() {
  return useMutation({
    mutationFn: ({ panelId, antibodyId, data }: { panelId: string; antibodyId?: string; data?: IFPanelTargetCreate }) =>
      addIFTarget(panelId, data ?? (antibodyId != null ? { antibody_id: antibodyId } : {})),
  })
}

export function useUpdateIFTarget() {
  return useMutation({
    mutationFn: ({ panelId, targetId, data }: { panelId: string; targetId: string; data: IFPanelTargetUpdate }) =>
      updateIFTarget(panelId, targetId, data),
  })
}

export function useReorderIFTargets() {
  return useMutation({
    mutationFn: ({ panelId, targetIds }: { panelId: string; targetIds: string[] }) =>
      reorderIFTargets(panelId, targetIds),
  })
}

export function useRemoveIFTarget() {
  return useMutation({
    mutationFn: ({ panelId, targetId }: { panelId: string; targetId: string }) =>
      removeIFTarget(panelId, targetId),
  })
}

export function useAddIFAssignment() {
  return useMutation({
    mutationFn: ({ panelId, data }: { panelId: string; data: IFPanelAssignmentCreate }) =>
      addIFAssignment(panelId, data),
  })
}

export function useRemoveIFAssignment() {
  return useMutation({
    mutationFn: ({ panelId, assignmentId }: { panelId: string; assignmentId: string }) =>
      removeIFAssignment(panelId, assignmentId),
  })
}
