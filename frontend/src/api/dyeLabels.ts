import type { DyeLabel, DyeLabelCreate, PaginatedResponse } from '@/types'

export interface DyeLabelListParams {
  skip?: number
  limit?: number
  search?: string
  category?: string
}

export async function listDyeLabels(
  params: DyeLabelListParams = {}
): Promise<PaginatedResponse<DyeLabel>> {
  const searchParams = new URLSearchParams()
  if (params.skip != null) searchParams.set('skip', String(params.skip))
  if (params.limit != null) searchParams.set('limit', String(params.limit))
  if (params.search) searchParams.set('search', params.search)
  if (params.category) searchParams.set('category', params.category)
  const qs = searchParams.toString()
  const res = await fetch('/api/v1/dye-labels' + (qs ? '?' + qs : ''))
  if (!res.ok) throw new Error('Failed to fetch dyes & labels')
  return res.json()
}

export async function getDyeLabel(id: string): Promise<DyeLabel> {
  const res = await fetch('/api/v1/dye-labels/' + id)
  if (!res.ok) throw new Error('Failed to fetch dye/label')
  return res.json()
}

export async function createDyeLabel(data: DyeLabelCreate): Promise<DyeLabel> {
  const res = await fetch('/api/v1/dye-labels', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to create dye/label')
  return res.json()
}

export async function updateDyeLabel(id: string, data: DyeLabelCreate): Promise<DyeLabel> {
  const res = await fetch('/api/v1/dye-labels/' + id, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to update dye/label')
  return res.json()
}

export async function deleteDyeLabel(id: string): Promise<void> {
  const res = await fetch('/api/v1/dye-labels/' + id, { method: 'DELETE' })
  if (!res.ok) throw new Error('Failed to delete dye/label')
}

export async function toggleDyeLabelFavorite(id: string, isFavorite: boolean): Promise<DyeLabel> {
  const res = await fetch('/api/v1/dye-labels/' + id + '/favorite', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_favorite: isFavorite }),
  })
  if (!res.ok) throw new Error('Failed to toggle dye/label favorite')
  return res.json()
}
