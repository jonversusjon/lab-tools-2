import type {
  IFPanel,
  IFPanelListItem,
  IFPanelAssignment,
  IFPanelAssignmentCreate,
  IFPanelCreate,
  IFPanelUpdate,
  IFPanelTarget,
  IFPanelTargetCreate,
  IFPanelTargetUpdate,
  PaginatedResponse,
} from '@/types'

export async function listIFPanels(
  skip = 0,
  limit = 100
): Promise<PaginatedResponse<IFPanelListItem>> {
  const res = await fetch(`/api/v1/if-panels?skip=${skip}&limit=${limit}`)
  if (!res.ok) throw new Error('Failed to fetch IF panels')
  return res.json()
}

export async function getIFPanel(id: string): Promise<IFPanel> {
  const res = await fetch(`/api/v1/if-panels/${id}`)
  if (!res.ok) throw new Error('Failed to fetch IF panel')
  return res.json()
}

export async function createIFPanel(data: IFPanelCreate): Promise<IFPanel> {
  const res = await fetch('/api/v1/if-panels', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to create IF panel')
  return res.json()
}

export async function updateIFPanel(
  id: string,
  data: IFPanelUpdate
): Promise<IFPanel> {
  const res = await fetch(`/api/v1/if-panels/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    const detail = body?.detail ?? 'Failed to update IF panel'
    throw new Error(detail)
  }
  return res.json()
}

export async function deleteIFPanel(id: string): Promise<void> {
  const res = await fetch(`/api/v1/if-panels/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Failed to delete IF panel')
}

export async function addIFTarget(
  panelId: string,
  data: IFPanelTargetCreate = {}
): Promise<IFPanelTarget> {
  const res = await fetch(`/api/v1/if-panels/${panelId}/targets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    if (res.status === 409) {
      const body = await res.json()
      throw new Error(body.detail ?? 'Antibody already a target in this panel')
    }
    throw new Error('Failed to add IF target')
  }
  return res.json()
}

export async function updateIFTarget(
  panelId: string,
  targetId: string,
  data: IFPanelTargetUpdate
): Promise<IFPanelTarget> {
  const res = await fetch(
    `/api/v1/if-panels/${panelId}/targets/${targetId}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }
  )
  if (!res.ok) {
    if (res.status === 409) {
      const body = await res.json()
      throw new Error(body.detail ?? 'Target conflict')
    }
    throw new Error('Failed to update IF target')
  }
  return res.json()
}

export async function reorderIFTargets(
  panelId: string,
  targetIds: string[]
): Promise<IFPanelTarget[]> {
  const res = await fetch(
    `/api/v1/if-panels/${panelId}/targets/reorder`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_ids: targetIds }),
    }
  )
  if (!res.ok) throw new Error('Failed to reorder IF targets')
  return res.json()
}

export async function removeIFTarget(
  panelId: string,
  targetId: string
): Promise<void> {
  const res = await fetch(
    `/api/v1/if-panels/${panelId}/targets/${targetId}`,
    { method: 'DELETE' }
  )
  if (!res.ok) throw new Error('Failed to remove IF target')
}

export async function addIFAssignment(
  panelId: string,
  data: IFPanelAssignmentCreate
): Promise<IFPanelAssignment> {
  const res = await fetch(`/api/v1/if-panels/${panelId}/assignments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    if (res.status === 409) {
      const body = await res.json()
      throw new Error(body.detail ?? 'Assignment conflict')
    }
    throw new Error('Failed to add IF assignment')
  }
  return res.json()
}

export async function removeIFAssignment(
  panelId: string,
  assignmentId: string
): Promise<void> {
  const res = await fetch(
    `/api/v1/if-panels/${panelId}/assignments/${assignmentId}`,
    { method: 'DELETE' }
  )
  if (!res.ok) throw new Error('Failed to remove IF assignment')
}
