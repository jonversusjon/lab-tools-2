import type {
  BatchFetchFpbaseResult,
  Fluorophore,
  FluorophoreCreate,
  FluorophoreImportConfirmResponse,
  FluorophoreImportItem,
  FluorophoreImportPreview,
  FluorophoreSpectra,
  FpbaseCatalogItem,
  InstrumentCompatibilityResponse,
  PaginatedResponse,
  SpectraData,
} from '@/types'

export interface FluorophoreListParams {
  skip?: number
  limit?: number
  type?: string
  search?: string
  has_spectra?: boolean
}

export async function listFluorophores(
  params: FluorophoreListParams = {}
): Promise<PaginatedResponse<Fluorophore>> {
  const query = new URLSearchParams()
  if (params.skip !== undefined) query.set('skip', String(params.skip))
  if (params.limit !== undefined) query.set('limit', String(params.limit))
  if (params.type) query.set('type', params.type)
  if (params.search) query.set('search', params.search)
  if (params.has_spectra !== undefined) query.set('has_spectra', String(params.has_spectra))
  const res = await fetch(`/api/v1/fluorophores?${query}`)
  if (!res.ok) throw new Error('Failed to fetch fluorophores')
  return res.json()
}

export async function createFluorophore(
  data: FluorophoreCreate
): Promise<Fluorophore> {
  const res = await fetch('/api/v1/fluorophores', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to create fluorophore')
  return res.json()
}

export async function getFluorophoreSpectra(
  id: string,
  types = 'EX,EM'
): Promise<FluorophoreSpectra> {
  const res = await fetch(`/api/v1/fluorophores/${id}/spectra?types=${types}`)
  if (!res.ok) throw new Error('Failed to fetch spectra')
  return res.json()
}

export async function getInstrumentCompatibility(
  id: string
): Promise<InstrumentCompatibilityResponse> {
  const res = await fetch(`/api/v1/fluorophores/${id}/instrument-compatibility`)
  if (!res.ok) throw new Error('Failed to fetch instrument compatibility')
  return res.json()
}

export async function fetchFpbase(name: string): Promise<Fluorophore> {
  const res = await fetch('/api/v1/fluorophores/fetch-fpbase', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.detail ?? 'Failed to fetch from FPbase')
  }
  return res.json()
}

export async function fetchFpbaseCatalog(): Promise<FpbaseCatalogItem[]> {
  const res = await fetch('/api/v1/fluorophores/fpbase-catalog')
  if (!res.ok) throw new Error('Failed to fetch FPbase catalog')
  return res.json()
}

export async function batchFetchFpbase(
  names: string[]
): Promise<BatchFetchFpbaseResult> {
  const res = await fetch('/api/v1/fluorophores/batch-fetch-fpbase', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ names }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.detail ?? 'Failed to batch fetch from FPbase')
  }
  return res.json()
}

export async function batchSpectra(
  ids: string[],
  types: string[] = ['EX', 'EM']
): Promise<Record<string, SpectraData>> {
  const res = await fetch('/api/v1/fluorophores/spectra/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids, types }),
  })
  if (!res.ok) throw new Error('Failed to fetch batch spectra')
  return res.json()
}

export async function toggleFluorophoreFavorite(
  id: string,
  is_favorite: boolean
): Promise<{ id: string; name: string; is_favorite: boolean }> {
  const res = await fetch(`/api/v1/fluorophores/${id}/favorite`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_favorite }),
  })
  if (!res.ok) throw new Error('Failed to toggle fluorophore favorite')
  return res.json()
}

export async function getRecentFluorophores(): Promise<string[]> {
  const res = await fetch('/api/v1/fluorophores/recent')
  if (!res.ok) throw new Error('Failed to fetch recent fluorophores')
  return res.json()
}

export async function uploadFluorophoresForImport(
  file: File
): Promise<FluorophoreImportPreview> {
  const formData = new FormData()
  formData.append('file', file)
  const res = await fetch('/api/v1/fluorophores/import/upload', {
    method: 'POST',
    body: formData,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.detail ?? 'Failed to parse fluorophore file')
  }
  return res.json()
}

export async function confirmFluorophoreImport(
  items: FluorophoreImportItem[]
): Promise<FluorophoreImportConfirmResponse> {
  const res = await fetch('/api/v1/fluorophores/import/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.detail ?? 'Failed to confirm fluorophore import')
  }
  return res.json()
}
