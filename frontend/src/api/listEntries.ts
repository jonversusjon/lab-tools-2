import type { ListEntry } from '@/types'

export async function fetchListEntries(listType: string): Promise<ListEntry[]> {
  const res = await fetch('/api/v1/list-entries/' + listType)
  if (!res.ok) throw new Error('Failed to fetch list entries')
  return res.json()
}

export async function createListEntry(
  listType: string,
  value: string,
): Promise<ListEntry> {
  const res = await fetch('/api/v1/list-entries/' + listType, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.detail ?? 'Failed to create entry')
  }
  return res.json()
}

export async function updateListEntry(
  listType: string,
  entryId: string,
  value: string,
): Promise<ListEntry> {
  const res = await fetch('/api/v1/list-entries/' + listType + '/' + entryId, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.detail ?? 'Failed to update entry')
  }
  return res.json()
}

export async function deleteListEntry(
  listType: string,
  entryId: string,
): Promise<void> {
  const res = await fetch('/api/v1/list-entries/' + listType + '/' + entryId, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error('Failed to delete entry')
}
