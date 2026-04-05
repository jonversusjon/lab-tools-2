import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  listMicroscopes,
  getMicroscope,
  createMicroscope,
  updateMicroscope,
  deleteMicroscope,
  importMicroscope,
  toggleMicroscopeFavorite,
  recordMicroscopeView,
  getRecentMicroscopes,
  getMicroscopeFluorophoreCompatibility,
} from '@/api/microscopes'
import type { MicroscopeCreate } from '@/types'

export function useMicroscopes(skip = 0, limit = 100) {
  return useQuery({
    queryKey: ['microscopes', { skip, limit }],
    queryFn: () => listMicroscopes(skip, limit),
  })
}

export function useMicroscope(id: string) {
  return useQuery({
    queryKey: ['microscopes', id],
    queryFn: () => getMicroscope(id),
    enabled: !!id,
  })
}

export function useCreateMicroscope() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: MicroscopeCreate) => createMicroscope(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['microscopes'] }),
  })
}

export function useUpdateMicroscope() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: MicroscopeCreate }) =>
      updateMicroscope(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['microscopes'] }),
  })
}

export function useDeleteMicroscope() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteMicroscope(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['microscopes'] }),
  })
}

export function useImportMicroscope() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: MicroscopeCreate) => importMicroscope(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['microscopes'] }),
  })
}

export function useToggleMicroscopeFavorite() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, is_favorite }: { id: string; is_favorite: boolean }) =>
      toggleMicroscopeFavorite(id, is_favorite),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['microscopes'] })
    },
  })
}

export function useRecordMicroscopeView() {
  return useMutation({
    mutationFn: (id: string) => recordMicroscopeView(id),
  })
}

export function useRecentMicroscopes() {
  return useQuery({
    queryKey: ['microscopes', 'recent'],
    queryFn: () => getRecentMicroscopes(),
    staleTime: 5 * 60 * 1000,
  })
}

export function useMicroscopeFluorophoreCompatibility(
  microscopeId: string | null,
  minEx?: number,
  minDet?: number
) {
  return useQuery({
    queryKey: ['microscope-compatibility', microscopeId, minEx, minDet],
    queryFn: () => getMicroscopeFluorophoreCompatibility(microscopeId!, minEx, minDet),
    enabled: !!microscopeId,
    staleTime: 5 * 60 * 1000,
  })
}
