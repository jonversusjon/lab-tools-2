import type {
  Fluorophore,
  FluorophoreCreate,
  FluorophoreSpectra,
  PaginatedResponse,
} from '@/types'

export async function listFluorophores(
  skip = 0,
  limit = 100
): Promise<PaginatedResponse<Fluorophore>> {
  const res = await fetch(
    `/api/v1/fluorophores?skip=${skip}&limit=${limit}`
  )
  if (!res.ok) throw new Error('Failed to fetch fluorophores')
  return res.json()
}

export async function createFluorophore(
  data: FluorophoreCreate
): Promise<Fluorophore> {
  const res = await fetch('/api/v1/fluorophores', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to create fluorophore')
  return res.json()
}

export async function getFluorophoreSpectra(
  id: string
): Promise<FluorophoreSpectra> {
  const res = await fetch(`/api/v1/fluorophores/${id}/spectra`)
  if (!res.ok) throw new Error('Failed to fetch spectra')
  return res.json()
}

export async function fetchFpbase(name: string): Promise<Fluorophore> {
  const res = await fetch('/api/v1/fluorophores/fetch-fpbase', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.detail ?? 'Failed to fetch from FPbase')
  }
  return res.json()
}

export async function batchSpectra(
  ids: string[]
): Promise<Record<string, { excitation: number[][]; emission: number[][] }>> {
  const res = await fetch('/api/v1/fluorophores/batch-spectra', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  })
  if (!res.ok) throw new Error('Failed to fetch batch spectra')
  return res.json()
}
