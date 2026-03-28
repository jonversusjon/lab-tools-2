import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { listTags, createTag, updateTag, deleteTag } from '@/api/tags'
import type { TagCreate } from '@/types'

export function useTags() {
  return useQuery({
    queryKey: ['tags'],
    queryFn: listTags,
  })
}

export function useCreateTag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: TagCreate) => createTag(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tags'] }),
  })
}

export function useUpdateTag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: TagCreate }) =>
      updateTag(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tags'] }),
  })
}

export function useDeleteTag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteTag(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tags'] }),
  })
}
