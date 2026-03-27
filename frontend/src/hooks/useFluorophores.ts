import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  listFluorophores,
  createFluorophore,
  getFluorophoreSpectra,
  getInstrumentCompatibility,
  batchSpectra,
  fetchFpbase,
  fetchFpbaseCatalog,
  batchFetchFpbase,
} from '@/api/fluorophores'
import type { FluorophoreCreate } from '@/types'
import type { FluorophoreListParams as ApiParams } from '@/api/fluorophores'

export function useFluorophores(params: ApiParams = {}) {
  return useQuery({
    queryKey: ['fluorophores', params],
    queryFn: () => listFluorophores(params),
  })
}

export function useFluorophoreSpectra(id: string) {
  return useQuery({
    queryKey: ['fluorophores', id, 'spectra'],
    queryFn: () => getFluorophoreSpectra(id),
    enabled: !!id,
  })
}

export function useInstrumentCompatibility(id: string) {
  return useQuery({
    queryKey: ['fluorophores', id, 'instrument-compatibility'],
    queryFn: () => getInstrumentCompatibility(id),
    enabled: !!id,
  })
}

export function useBatchSpectra(ids: string[]) {
  const sortedIds = [...ids].sort()
  return useQuery({
    queryKey: ['fluorophores', 'batch-spectra', sortedIds],
    queryFn: () => batchSpectra(sortedIds, ['EX', 'EM']),
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

export function useFpbaseCatalog() {
  return useQuery({
    queryKey: ['fpbase-catalog'],
    queryFn: fetchFpbaseCatalog,
    staleTime: 30 * 60 * 1000,
  })
}

export function useBatchFetchFpbase() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (names: string[]) => batchFetchFpbase(names),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fluorophores'] }),
  })
}
