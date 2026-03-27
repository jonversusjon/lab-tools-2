import type { Antibody, AntibodyCreate, PaginatedResponse } from '@/types'

export async function listAntibodies(
  skip = 0,
  limit = 100
): Promise<PaginatedResponse<Antibody>> {
  const res = await fetch(
    `/api/v1/antibodies?skip=${skip}&limit=${limit}`
  )
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
