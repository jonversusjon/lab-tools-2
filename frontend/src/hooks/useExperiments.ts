import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  listExperiments,
  getExperiment,
  createExperiment,
  updateExperiment,
  deleteExperiment,
} from '@/api/experiments'
import type { ExperimentCreate, ExperimentUpdate } from '@/types'

export function useExperiments(skip = 0, limit = 100) {
  return useQuery({
    queryKey: ['experiments', { skip, limit }],
    queryFn: () => listExperiments(skip, limit),
  })
}

export function useExperiment(id: string) {
  return useQuery({
    queryKey: ['experiments', id],
    queryFn: () => getExperiment(id),
    enabled: !!id,
  })
}

export function useCreateExperiment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: ExperimentCreate) => createExperiment(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['experiments'] }),
  })
}

export function useUpdateExperiment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: ExperimentUpdate }) =>
      updateExperiment(id, data),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['experiments'] })
      qc.invalidateQueries({ queryKey: ['experiments', variables.id] })
    },
  })
}

export function useDeleteExperiment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteExperiment(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['experiments'] }),
  })
}
