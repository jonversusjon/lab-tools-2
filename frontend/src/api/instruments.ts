import type { Instrument, InstrumentCreate, PaginatedResponse } from '@/types'

export async function listInstruments(
  skip = 0,
  limit = 100
): Promise<PaginatedResponse<Instrument>> {
  const res = await fetch(
    `/api/v1/instruments?skip=${skip}&limit=${limit}`
  )
  if (!res.ok) throw new Error('Failed to fetch instruments')
  return res.json()
}

export async function getInstrument(id: string): Promise<Instrument> {
  const res = await fetch(`/api/v1/instruments/${id}`)
  if (!res.ok) throw new Error('Failed to fetch instrument')
  return res.json()
}

export async function createInstrument(
  data: InstrumentCreate
): Promise<Instrument> {
  const res = await fetch('/api/v1/instruments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to create instrument')
  return res.json()
}

export async function updateInstrument(
  id: string,
  data: InstrumentCreate
): Promise<Instrument> {
  const res = await fetch(`/api/v1/instruments/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    const detail = body?.detail ?? 'Failed to update instrument'
    throw new Error(detail)
  }
  return res.json()
}

export async function deleteInstrument(id: string): Promise<void> {
  const res = await fetch(`/api/v1/instruments/${id}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error('Failed to delete instrument')
}
