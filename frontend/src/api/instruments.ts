import type { 
  Instrument, 
  InstrumentCreate, 
  PaginatedResponse,
  DetectorCompatibilityResponse 
} from '@/types'

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

export async function exportInstrument(
  id: string
): Promise<InstrumentCreate> {
  const res = await fetch(`/api/v1/instruments/${id}/export`)
  if (!res.ok) throw new Error('Failed to export instrument')
  return res.json()
}

export async function importInstrument(
  data: InstrumentCreate
): Promise<Instrument> {
  const res = await fetch('/api/v1/instruments/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to import instrument')
  return res.json()
}

export async function getFluorophoreCompatibility(
  id: string,
  min_excitation_pct?: number,
  min_detection_pct?: number
): Promise<DetectorCompatibilityResponse> {
  const query = new URLSearchParams()
  if (min_excitation_pct !== undefined) query.set('min_excitation_pct', String(min_excitation_pct))
  if (min_detection_pct !== undefined) query.set('min_detection_pct', String(min_detection_pct))
  
  const url = `/api/v1/instruments/${id}/fluorophore-compatibility${query.toString() ? '?' + query.toString() : ''}`
  const res = await fetch(url)
  if (!res.ok) throw new Error('Failed to fetch instrument fluorophore compatibility')
  return res.json()
}
