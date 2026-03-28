import type {
  Panel,
  PanelListItem,
  PanelAssignment,
  PanelAssignmentCreate,
  PanelCreate,
  PanelTarget,
  PanelTargetCreate,
  PanelTargetUpdate,
  PaginatedResponse,
} from '@/types'

export async function listPanels(
  skip = 0,
  limit = 100
): Promise<PaginatedResponse<PanelListItem>> {
  const res = await fetch(`/api/v1/panels?skip=${skip}&limit=${limit}`)
  if (!res.ok) throw new Error('Failed to fetch panels')
  return res.json()
}

export async function getPanel(id: string): Promise<Panel> {
  const res = await fetch(`/api/v1/panels/${id}`)
  if (!res.ok) throw new Error('Failed to fetch panel')
  return res.json()
}

export async function createPanel(data: PanelCreate): Promise<Panel> {
  const res = await fetch('/api/v1/panels', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to create panel')
  return res.json()
}

export async function updatePanel(
  id: string,
  data: PanelCreate
): Promise<Panel> {
  const res = await fetch(`/api/v1/panels/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to update panel')
  return res.json()
}

export async function deletePanel(id: string): Promise<void> {
  const res = await fetch(`/api/v1/panels/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Failed to delete panel')
}

export async function addTarget(
  panelId: string,
  data: PanelTargetCreate = {}
): Promise<PanelTarget> {
  const res = await fetch(`/api/v1/panels/${panelId}/targets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    if (res.status === 409) {
      const body = await res.json()
      throw new Error(body.detail ?? 'Antibody already a target in this panel')
    }
    throw new Error('Failed to add target')
  }
  return res.json()
}

export async function updateTarget(
  panelId: string,
  targetId: string,
  data: PanelTargetUpdate
): Promise<PanelTarget> {
  const res = await fetch(`/api/v1/panels/${panelId}/targets/${targetId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    if (res.status === 409) {
      const body = await res.json()
      throw new Error(body.detail ?? 'Target conflict')
    }
    throw new Error('Failed to update target')
  }
  return res.json()
}

export async function reorderTargets(
  panelId: string,
  targetIds: string[]
): Promise<PanelTarget[]> {
  const res = await fetch(`/api/v1/panels/${panelId}/targets/reorder`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target_ids: targetIds }),
  })
  if (!res.ok) throw new Error('Failed to reorder targets')
  return res.json()
}

export async function removeTarget(
  panelId: string,
  targetId: string
): Promise<void> {
  const res = await fetch(
    `/api/v1/panels/${panelId}/targets/${targetId}`,
    { method: 'DELETE' }
  )
  if (!res.ok) throw new Error('Failed to remove target')
}

export async function addAssignment(
  panelId: string,
  data: PanelAssignmentCreate
): Promise<PanelAssignment> {
  const res = await fetch(`/api/v1/panels/${panelId}/assignments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    if (res.status === 409) {
      const body = await res.json()
      throw new Error(body.detail ?? 'Assignment conflict')
    }
    throw new Error('Failed to add assignment')
  }
  return res.json()
}

export async function removeAssignment(
  panelId: string,
  assignmentId: string
): Promise<void> {
  const res = await fetch(
    `/api/v1/panels/${panelId}/assignments/${assignmentId}`,
    { method: 'DELETE' }
  )
  if (!res.ok) throw new Error('Failed to remove assignment')
}
