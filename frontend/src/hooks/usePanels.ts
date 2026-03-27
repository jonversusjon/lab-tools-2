import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  listPanels,
  getPanel,
  createPanel,
  updatePanel,
  deletePanel,
  addTarget,
  removeTarget,
  addAssignment,
  removeAssignment,
} from '@/api/panels'
import type { PanelCreate, PanelAssignmentCreate } from '@/types'

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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['panels'] }),
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
    mutationFn: ({ panelId, antibodyId }: { panelId: string; antibodyId: string }) =>
      addTarget(panelId, antibodyId),
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
