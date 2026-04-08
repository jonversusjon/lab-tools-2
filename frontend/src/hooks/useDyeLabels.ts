import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  listDyeLabels,
  getDyeLabel,
  createDyeLabel,
  updateDyeLabel,
  deleteDyeLabel,
  toggleDyeLabelFavorite,
} from '@/api/dyeLabels'
import type { DyeLabelListParams } from '@/api/dyeLabels'
import type { DyeLabelCreate } from '@/types'

export function useDyeLabels(params: DyeLabelListParams = {}) {
  return useQuery({
    queryKey: ['dye-labels', params],
    queryFn: () => listDyeLabels(params),
    placeholderData: (prev) => prev,
  })
}

export function useDyeLabel(id: string) {
  return useQuery({
    queryKey: ['dye-labels', id],
    queryFn: () => getDyeLabel(id),
    enabled: !!id,
  })
}

export function useCreateDyeLabel() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: DyeLabelCreate) => createDyeLabel(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dye-labels'] }),
  })
}

export function useUpdateDyeLabel() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: DyeLabelCreate }) =>
      updateDyeLabel(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dye-labels'] }),
  })
}

export function useDeleteDyeLabel() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteDyeLabel(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dye-labels'] }),
  })
}

export function useToggleDyeLabelFavorite() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, isFavorite }: { id: string; isFavorite: boolean }) =>
      toggleDyeLabelFavorite(id, isFavorite),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dye-labels'] }),
  })
}
