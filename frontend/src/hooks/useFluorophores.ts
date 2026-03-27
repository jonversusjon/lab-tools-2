import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  listFluorophores,
  createFluorophore,
  getFluorophoreSpectra,
  batchSpectra,
  fetchFpbase,
} from '@/api/fluorophores'
import type { FluorophoreCreate } from '@/types'

export function useFluorophores(skip = 0, limit = 100) {
  return useQuery({
    queryKey: ['fluorophores', { skip, limit }],
    queryFn: () => listFluorophores(skip, limit),
  })
}

export function useFluorophoreSpectra(id: string) {
  return useQuery({
    queryKey: ['fluorophores', id, 'spectra'],
    queryFn: () => getFluorophoreSpectra(id),
    enabled: !!id,
  })
}

export function useBatchSpectra(ids: string[]) {
  return useQuery({
    queryKey: ['fluorophores', 'batch-spectra'],
    queryFn: () => batchSpectra(ids),
    enabled: ids.length > 0,
    staleTime: 5 * 60 * 1000,
  })
}

export function useCreateFluorophore() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: FluorophoreCreate) => createFluorophore(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fluorophores'] }),
  })
}

export function useFetchFromFpbase() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => fetchFpbase(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fluorophores'] }),
  })
}
