import type {
  Experiment,
  ExperimentCreate,
  ExperimentUpdate,
  ExperimentListItem,
  ExperimentBlock,
  ExperimentBlockCreate,
  ExperimentBlockUpdate,
  ExperimentBlockReorderItem,
  SnapshotPanelRequest,
  PaginatedResponse,
} from '@/types'

const BASE = '/api/v1/experiments'

export class ExperimentApiError extends Error {
  readonly status: number
  readonly statusText: string

  constructor(message: string, status: number, statusText: string) {
    super(message)
    this.name = 'ExperimentApiError'
    this.status = status
    this.statusText = statusText
  }
}

function failed(action: string, res: Response): ExperimentApiError {
  const message = 'Failed to ' + action + ': ' + String(res.status) + ' ' + res.statusText
  return new ExperimentApiError(message, res.status, res.statusText)
}

export async function listExperiments(
  skip = 0,
  limit = 100
): Promise<PaginatedResponse<ExperimentListItem>> {
  const res = await fetch(`${BASE}?skip=${skip}&limit=${limit}`)
  if (!res.ok) throw failed('fetch experiments', res)
  return res.json()
}

export async function createExperiment(
  data: ExperimentCreate
): Promise<Experiment> {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw failed('create experiment', res)
  return res.json()
}

export async function getExperiment(id: string): Promise<Experiment> {
  const res = await fetch(`${BASE}/${id}`)
  if (!res.ok) throw failed('fetch experiment', res)
  return res.json()
}

export async function updateExperiment(
  id: string,
  data: ExperimentUpdate
): Promise<Experiment> {
  const res = await fetch(`${BASE}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw failed('update experiment', res)
  return res.json()
}

export async function deleteExperiment(id: string): Promise<void> {
  const res = await fetch(`${BASE}/${id}`, { method: 'DELETE' })
  if (!res.ok) throw failed('delete experiment', res)
}

export async function createBlock(
  experimentId: string,
  data: ExperimentBlockCreate
): Promise<ExperimentBlock> {
  const res = await fetch(`${BASE}/${experimentId}/blocks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw failed('create block', res)
  return res.json()
}

export async function updateBlock(
  experimentId: string,
  blockId: string,
  data: ExperimentBlockUpdate
): Promise<ExperimentBlock> {
  const res = await fetch(`${BASE}/${experimentId}/blocks/${blockId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw failed('update block', res)
  return res.json()
}

export async function deleteBlock(
  experimentId: string,
  blockId: string
): Promise<void> {
  const res = await fetch(`${BASE}/${experimentId}/blocks/${blockId}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw failed('delete block', res)
}

export async function reorderBlocks(
  experimentId: string,
  blocks: ExperimentBlockReorderItem[]
): Promise<Experiment> {
  const res = await fetch(`${BASE}/${experimentId}/blocks/reorder`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ blocks }),
  })
  if (!res.ok) throw failed('reorder blocks', res)
  return res.json()
}

export async function snapshotPanel(
  experimentId: string,
  data: SnapshotPanelRequest
): Promise<ExperimentBlock> {
  const res = await fetch(`${BASE}/${experimentId}/snapshot-panel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw failed('snapshot panel', res)
  return res.json()
}
