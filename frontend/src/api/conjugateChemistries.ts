import type { ConjugateChemistry } from '@/types'

const BASE = '/api/v1/conjugate-chemistries'

export async function fetchConjugateChemistries(): Promise<ConjugateChemistry[]> {
  const res = await fetch(BASE + '/')
  if (!res.ok) throw new Error('Failed to fetch conjugate chemistries')
  return res.json()
}

export async function createConjugateChemistry(
  name: string,
  label: string,
): Promise<ConjugateChemistry> {
  const res = await fetch(BASE + '/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, label }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.detail ?? 'Failed to create entry')
  }
  return res.json()
}

export async function updateConjugateChemistry(
  id: string,
  data: { name?: string; label?: string },
): Promise<ConjugateChemistry> {
  const res = await fetch(BASE + '/' + id, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.detail ?? 'Failed to update entry')
  }
  return res.json()
}

export async function deleteConjugateChemistry(id: string): Promise<void> {
  const res = await fetch(BASE + '/' + id, { method: 'DELETE' })
  if (!res.ok) throw new Error('Failed to delete entry')
}
