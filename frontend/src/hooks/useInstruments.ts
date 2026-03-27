import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  listInstruments,
  getInstrument,
  createInstrument,
  updateInstrument,
  deleteInstrument,
} from '@/api/instruments'
import type { InstrumentCreate } from '@/types'

export function useInstruments(skip = 0, limit = 100) {
  return useQuery({
    queryKey: ['instruments', { skip, limit }],
    queryFn: () => listInstruments(skip, limit),
  })
}

export function useInstrument(id: string) {
  return useQuery({
    queryKey: ['instruments', id],
    queryFn: () => getInstrument(id),
    enabled: !!id,
  })
}

export function useCreateInstrument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: InstrumentCreate) => createInstrument(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['instruments'] }),
  })
}

export function useUpdateInstrument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: InstrumentCreate }) =>
      updateInstrument(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['instruments'] }),
  })
}

export function useDeleteInstrument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteInstrument(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['instruments'] }),
  })
}
