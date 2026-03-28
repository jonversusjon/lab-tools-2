import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  listAntibodies,
  getAntibody,
  createAntibody,
  updateAntibody,
  deleteAntibody,
  toggleAntibodyFavorite,
  assignTags,
  removeTag,
  uploadCsvForImport,
  confirmImport,
} from '@/api/antibodies'
import type { AntibodyListParams } from '@/api/antibodies'
import type { AntibodyCreate, ImportAntibodyItem } from '@/types'

export function useAntibodies(params: AntibodyListParams = {}) {
  return useQuery({
    queryKey: ['antibodies', params],
    queryFn: () => listAntibodies(params),
    placeholderData: (prev) => prev,
  })
}

export function useAntibody(id: string) {
  return useQuery({
    queryKey: ['antibodies', id],
    queryFn: () => getAntibody(id),
    enabled: !!id,
  })
}

export function useCreateAntibody() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: AntibodyCreate) => createAntibody(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['antibodies'] }),
  })
}

export function useUpdateAntibody() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: AntibodyCreate }) =>
      updateAntibody(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['antibodies'] }),
  })
}

export function useDeleteAntibody() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteAntibody(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['antibodies'] }),
  })
}

export function useToggleAntibodyFavorite() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, is_favorite }: { id: string; is_favorite: boolean }) =>
      toggleAntibodyFavorite(id, is_favorite),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['antibodies'] }),
  })
}

export function useAssignTags() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ antibodyId, tagIds }: { antibodyId: string; tagIds: string[] }) =>
      assignTags(antibodyId, tagIds),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['antibodies'] }),
  })
}

export function useRemoveTag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ antibodyId, tagId }: { antibodyId: string; tagId: string }) =>
      removeTag(antibodyId, tagId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['antibodies'] }),
  })
}

export function useUploadCsv() {
  return useMutation({
    mutationFn: (file: File) => uploadCsvForImport(file),
  })
}

export function useConfirmImport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (antibodies: ImportAntibodyItem[]) => confirmImport(antibodies),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['antibodies'] }),
  })
}
