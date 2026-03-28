import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  listSecondaries,
  getSecondary,
  createSecondary,
  updateSecondary,
  deleteSecondary,
} from '@/api/secondaries'
import type { SecondaryListParams } from '@/api/secondaries'
import type { SecondaryAntibodyCreate } from '@/types'

export function useSecondaries(params: SecondaryListParams = {}) {
  return useQuery({
    queryKey: ['secondary-antibodies', params],
    queryFn: () => listSecondaries(params),
    placeholderData: (prev) => prev,
  })
}

export function useSecondary(id: string) {
  return useQuery({
    queryKey: ['secondary-antibodies', id],
    queryFn: () => getSecondary(id),
    enabled: !!id,
  })
}

export function useCreateSecondary() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: SecondaryAntibodyCreate) => createSecondary(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['secondary-antibodies'] }),
  })
}

export function useUpdateSecondary() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: SecondaryAntibodyCreate }) =>
      updateSecondary(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['secondary-antibodies'] }),
  })
}

export function useDeleteSecondary() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteSecondary(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['secondary-antibodies'] }),
  })
}
