import type {
  DetectorCompatibilityResponse,
  Microscope,
  MicroscopeCreate,
  PaginatedResponse,
} from '@/types'

export async function listMicroscopes(
  skip = 0,
  limit = 100
): Promise<PaginatedResponse<Microscope>> {
  const res = await fetch(
    `/api/v1/microscopes?skip=${skip}&limit=${limit}`
  )
  if (!res.ok) throw new Error('Failed to fetch microscopes')
  return res.json()
}

export async function getMicroscope(id: string): Promise<Microscope> {
  const res = await fetch(`/api/v1/microscopes/${id}`)
  if (!res.ok) throw new Error('Failed to fetch microscope')
  return res.json()
}

export async function createMicroscope(
  data: MicroscopeCreate
): Promise<Microscope> {
  const res = await fetch('/api/v1/microscopes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to create microscope')
  return res.json()
}

export async function updateMicroscope(
  id: string,
  data: MicroscopeCreate
): Promise<Microscope> {
  const res = await fetch(`/api/v1/microscopes/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    const detail = body?.detail ?? 'Failed to update microscope'
    throw new Error(detail)
  }
  return res.json()
}

export async function deleteMicroscope(id: string): Promise<void> {
  const res = await fetch(`/api/v1/microscopes/${id}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error('Failed to delete microscope')
}

export async function exportMicroscope(
  id: string
): Promise<MicroscopeCreate> {
  const res = await fetch(`/api/v1/microscopes/${id}/export`)
  if (!res.ok) throw new Error('Failed to export microscope')
  return res.json()
}

export async function importMicroscope(
  data: MicroscopeCreate
): Promise<Microscope> {
  const res = await fetch('/api/v1/microscopes/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to import microscope')
  return res.json()
}

export async function toggleMicroscopeFavorite(
  id: string,
  is_favorite: boolean
): Promise<Microscope> {
  const res = await fetch(`/api/v1/microscopes/${id}/favorite`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_favorite }),
  })
  if (!res.ok) throw new Error('Failed to toggle microscope favorite')
  return res.json()
}

export async function recordMicroscopeView(id: string): Promise<void> {
  await fetch(`/api/v1/microscopes/${id}/view`, { method: 'POST' })
}

export async function getRecentMicroscopes(limit = 10): Promise<string[]> {
  const res = await fetch(`/api/v1/microscopes/recent?limit=${limit}`)
  if (!res.ok) throw new Error('Failed to fetch recent microscopes')
  return res.json()
}

export async function getMicroscopeFluorophoreCompatibility(
  id: string,
  min_excitation_pct?: number,
  min_detection_pct?: number
): Promise<DetectorCompatibilityResponse> {
  const query = new URLSearchParams()
  if (min_excitation_pct !== undefined) query.set('min_excitation_pct', String(min_excitation_pct))
  if (min_detection_pct !== undefined) query.set('min_detection_pct', String(min_detection_pct))
  const qs = query.toString()
  const url = `/api/v1/microscopes/${id}/fluorophore-compatibility${qs ? '?' + qs : ''}`
  const res = await fetch(url)
  if (!res.ok) throw new Error('Failed to fetch microscope fluorophore compatibility')
  return res.json()
}
