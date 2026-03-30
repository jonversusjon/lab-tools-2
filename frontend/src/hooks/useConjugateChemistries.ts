import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchConjugateChemistries,
  createConjugateChemistry,
  updateConjugateChemistry,
  deleteConjugateChemistry,
} from '@/api/conjugateChemistries'

const KEY = ['conjugate-chemistries']

export function useConjugateChemistries() {
  return useQuery({
    queryKey: KEY,
    queryFn: fetchConjugateChemistries,
  })
}

export function useCreateConjugateChemistry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ name, label }: { name: string; label: string }) =>
      createConjugateChemistry(name, label),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

export function useUpdateConjugateChemistry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name?: string; label?: string } }) =>
      updateConjugateChemistry(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

export function useDeleteConjugateChemistry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteConjugateChemistry(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}
