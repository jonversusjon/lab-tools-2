import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  listAntibodies,
  getAntibody,
  createAntibody,
  updateAntibody,
  deleteAntibody,
} from '@/api/antibodies'
import type { AntibodyCreate } from '@/types'

export function useAntibodies(skip = 0, limit = 100) {
  return useQuery({
    queryKey: ['antibodies', { skip, limit }],
    queryFn: () => listAntibodies(skip, limit),
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
