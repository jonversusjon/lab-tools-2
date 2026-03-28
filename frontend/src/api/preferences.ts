import type { UserPreference } from '@/types'

export async function getPreferences(): Promise<Record<string, string>> {
  const res = await fetch('/api/v1/preferences')
  if (!res.ok) throw new Error('Failed to fetch preferences')
  return res.json()
}

export async function updatePreference(key: string, value: string): Promise<UserPreference> {
  const res = await fetch(`/api/v1/preferences/${key}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value }),
  })
  if (!res.ok) throw new Error('Failed to update preference')
  return res.json()
}
