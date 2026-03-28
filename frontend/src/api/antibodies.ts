import type {
  Antibody,
  AntibodyCreate,
  CsvImportResponse,
  ImportAntibodyItem,
  ImportConfirmResponse,
  PaginatedResponse,
} from '@/types'

export interface AntibodyListParams {
  skip?: number
  limit?: number
  search?: string
  favorites?: boolean
  tags?: string
  host?: string
  vendor?: string
  conjugate?: string
  in_stock?: boolean
  storage_temp?: string
}

export async function listAntibodies(
  params: AntibodyListParams = {}
): Promise<PaginatedResponse<Antibody>> {
  const searchParams = new URLSearchParams()
  if (params.skip != null) searchParams.set('skip', String(params.skip))
  if (params.limit != null) searchParams.set('limit', String(params.limit))
  if (params.search) searchParams.set('search', params.search)
  if (params.favorites) searchParams.set('favorites', 'true')
  if (params.tags) searchParams.set('tags', params.tags)
  if (params.host) searchParams.set('host', params.host)
  if (params.vendor) searchParams.set('vendor', params.vendor)
  if (params.conjugate) searchParams.set('conjugate', params.conjugate)
  if (params.in_stock != null) searchParams.set('in_stock', String(params.in_stock))
  if (params.storage_temp) searchParams.set('storage_temp', params.storage_temp)

  const qs = searchParams.toString()
  const res = await fetch(`/api/v1/antibodies${qs ? '?' + qs : ''}`)
  if (!res.ok) throw new Error('Failed to fetch antibodies')
  return res.json()
}

export async function getAntibody(id: string): Promise<Antibody> {
  const res = await fetch(`/api/v1/antibodies/${id}`)
  if (!res.ok) throw new Error('Failed to fetch antibody')
  return res.json()
}

export async function createAntibody(
  data: AntibodyCreate
): Promise<Antibody> {
  const res = await fetch('/api/v1/antibodies', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to create antibody')
  return res.json()
}

export async function updateAntibody(
  id: string,
  data: AntibodyCreate
): Promise<Antibody> {
  const res = await fetch(`/api/v1/antibodies/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to update antibody')
  return res.json()
}

export async function deleteAntibody(id: string): Promise<void> {
  const res = await fetch(`/api/v1/antibodies/${id}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error('Failed to delete antibody')
}

export async function toggleAntibodyFavorite(
  id: string,
  is_favorite: boolean
): Promise<Antibody> {
  const res = await fetch(`/api/v1/antibodies/${id}/favorite`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_favorite }),
  })
  if (!res.ok) throw new Error('Failed to toggle favorite')
  return res.json()
}

export async function assignTags(
  antibodyId: string,
  tagIds: string[]
): Promise<Antibody> {
  const res = await fetch(`/api/v1/antibodies/${antibodyId}/tags`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tag_ids: tagIds }),
  })
  if (!res.ok) throw new Error('Failed to assign tags')
  return res.json()
}

export async function removeTag(
  antibodyId: string,
  tagId: string
): Promise<void> {
  const res = await fetch(`/api/v1/antibodies/${antibodyId}/tags/${tagId}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error('Failed to remove tag')
}

export async function uploadCsvForImport(
  file: File
): Promise<CsvImportResponse> {
  const formData = new FormData()
  formData.append('file', file)
  const res = await fetch('/api/v1/antibodies/import-csv', {
    method: 'POST',
    body: formData,
  })
  if (!res.ok) throw new Error('Failed to parse CSV')
  return res.json()
}

export async function confirmImport(
  antibodies: ImportAntibodyItem[]
): Promise<ImportConfirmResponse> {
  const res = await fetch('/api/v1/antibodies/import-confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ antibodies }),
  })
  if (!res.ok) throw new Error('Failed to import antibodies')
  return res.json()
}
