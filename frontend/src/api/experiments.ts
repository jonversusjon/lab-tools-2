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

export async function listExperiments(
  skip = 0,
  limit = 100
): Promise<PaginatedResponse<ExperimentListItem>> {
  const res = await fetch(`${BASE}?skip=${skip}&limit=${limit}`)
  if (!res.ok) throw new Error('Failed to fetch experiments')
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
  if (!res.ok) throw new Error('Failed to create experiment')
  return res.json()
}

export async function getExperiment(id: string): Promise<Experiment> {
  const res = await fetch(`${BASE}/${id}`)
  if (!res.ok) throw new Error('Failed to fetch experiment')
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
  if (!res.ok) throw new Error('Failed to update experiment')
  return res.json()
}

export async function deleteExperiment(id: string): Promise<void> {
  const res = await fetch(`${BASE}/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Failed to delete experiment')
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
  if (!res.ok) throw new Error('Failed to create block')
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
  if (!res.ok) throw new Error('Failed to update block')
  return res.json()
}

export async function deleteBlock(
  experimentId: string,
  blockId: string
): Promise<void> {
  const res = await fetch(`${BASE}/${experimentId}/blocks/${blockId}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error('Failed to delete block')
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
  if (!res.ok) throw new Error('Failed to reorder blocks')
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
  if (!res.ok) throw new Error('Failed to snapshot panel')
  return res.json()
}
