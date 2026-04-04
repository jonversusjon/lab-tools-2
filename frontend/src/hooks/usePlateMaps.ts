import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  listPlateMaps,
  getPlateMap,
  createPlateMap,
  updatePlateMap,
  deletePlateMap,
} from '@/api/plateMaps'
import type { PlateMapCreate, PlateMapUpdate } from '@/types'

export function usePlateMaps(skip = 0, limit = 100) {
  return useQuery({
    queryKey: ['plate-maps', { skip, limit }],
    queryFn: () => listPlateMaps(skip, limit),
  })
}

export function usePlateMap(id: string) {
  return useQuery({
    queryKey: ['plate-maps', id],
    queryFn: () => getPlateMap(id),
    enabled: !!id,
  })
}

export function useCreatePlateMap() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: PlateMapCreate) => createPlateMap(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['plate-maps'] }),
  })
}

export function useUpdatePlateMap() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: PlateMapUpdate }) =>
      updatePlateMap(id, data),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['plate-maps'] })
      qc.invalidateQueries({ queryKey: ['plate-maps', variables.id] })
    },
  })
}

export function useDeletePlateMap() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deletePlateMap(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['plate-maps'] }),
  })
}
