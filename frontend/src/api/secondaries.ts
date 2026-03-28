import type {
  SecondaryAntibody,
  SecondaryAntibodyCreate,
  PaginatedResponse,
} from '@/types'

export interface SecondaryListParams {
  skip?: number
  limit?: number
  search?: string
  host?: string
  target_species?: string
  target_isotype?: string
}

export async function listSecondaries(
  params: SecondaryListParams = {}
): Promise<PaginatedResponse<SecondaryAntibody>> {
  const searchParams = new URLSearchParams()
  if (params.skip != null) searchParams.set('skip', String(params.skip))
  if (params.limit != null) searchParams.set('limit', String(params.limit))
  if (params.search) searchParams.set('search', params.search)
  if (params.host) searchParams.set('host', params.host)
  if (params.target_species) searchParams.set('target_species', params.target_species)
  if (params.target_isotype) searchParams.set('target_isotype', params.target_isotype)
  const qs = searchParams.toString()
  const res = await fetch(`/api/v1/secondary-antibodies${qs ? `?${qs}` : ''}`)
  if (!res.ok) throw new Error('Failed to fetch secondary antibodies')
  return res.json()
}

export async function getSecondary(id: string): Promise<SecondaryAntibody> {
  const res = await fetch(`/api/v1/secondary-antibodies/${id}`)
  if (!res.ok) throw new Error('Failed to fetch secondary antibody')
  return res.json()
}

export async function createSecondary(
  data: SecondaryAntibodyCreate
): Promise<SecondaryAntibody> {
  const res = await fetch('/api/v1/secondary-antibodies', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to create secondary antibody')
  return res.json()
}

export async function updateSecondary(
  id: string,
  data: SecondaryAntibodyCreate
): Promise<SecondaryAntibody> {
  const res = await fetch(`/api/v1/secondary-antibodies/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to update secondary antibody')
  return res.json()
}

export async function deleteSecondary(id: string): Promise<void> {
  const res = await fetch(`/api/v1/secondary-antibodies/${id}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error('Failed to delete secondary antibody')
}
