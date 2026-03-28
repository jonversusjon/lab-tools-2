import type { AntibodyTag, AntibodyTagWithCount, TagCreate } from '@/types'

export async function listTags(): Promise<AntibodyTagWithCount[]> {
  const res = await fetch('/api/v1/tags')
  if (!res.ok) throw new Error('Failed to fetch tags')
  return res.json()
}

export async function createTag(data: TagCreate): Promise<AntibodyTag> {
  const res = await fetch('/api/v1/tags', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to create tag')
  return res.json()
}

export async function updateTag(
  id: string,
  data: TagCreate
): Promise<AntibodyTag> {
  const res = await fetch(`/api/v1/tags/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to update tag')
  return res.json()
}

export async function deleteTag(id: string): Promise<void> {
  const res = await fetch(`/api/v1/tags/${id}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error('Failed to delete tag')
}
