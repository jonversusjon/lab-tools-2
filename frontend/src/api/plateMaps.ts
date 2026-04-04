import type {
  PlateMap,
  PlateMapListItem,
  PlateMapCreate,
  PlateMapUpdate,
  PaginatedResponse,
} from '@/types'

export async function listPlateMaps(
  skip = 0,
  limit = 100
): Promise<PaginatedResponse<PlateMapListItem>> {
  const res = await fetch(`/api/v1/plate-maps?skip=${skip}&limit=${limit}`)
  if (!res.ok) throw new Error('Failed to fetch plate maps')
  return res.json()
}

export async function getPlateMap(id: string): Promise<PlateMap> {
  const res = await fetch(`/api/v1/plate-maps/${id}`)
  if (!res.ok) throw new Error('Failed to fetch plate map')
  return res.json()
}

export async function createPlateMap(data: PlateMapCreate): Promise<PlateMap> {
  const res = await fetch('/api/v1/plate-maps', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to create plate map')
  return res.json()
}

export async function updatePlateMap(
  id: string,
  data: PlateMapUpdate
): Promise<PlateMap> {
  const res = await fetch(`/api/v1/plate-maps/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to update plate map')
  return res.json()
}

export async function deletePlateMap(id: string): Promise<void> {
  const res = await fetch(`/api/v1/plate-maps/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Failed to delete plate map')
}
