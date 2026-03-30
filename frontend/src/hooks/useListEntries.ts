import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchListEntries,
  createListEntry,
  updateListEntry,
  deleteListEntry,
} from '@/api/listEntries'

export function useListEntries(listType: string) {
  return useQuery({
    queryKey: ['list-entries', listType],
    queryFn: () => fetchListEntries(listType),
  })
}

export function useCreateListEntry(listType: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (value: string) => createListEntry(listType, value),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['list-entries', listType] }),
  })
}

export function useUpdateListEntry(listType: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, value }: { id: string; value: string }) =>
      updateListEntry(listType, id, value),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['list-entries', listType] }),
  })
}

export function useDeleteListEntry(listType: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteListEntry(listType, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['list-entries', listType] }),
  })
}
