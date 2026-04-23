export type ExportResource =
  | 'antibodies'
  | 'secondaries'
  | 'instruments'
  | 'microscopes'
  | 'list-entries'
  | 'conjugate-chemistries'
  | 'flow-panels'
  | 'if-panels'

export async function downloadExport(resource: ExportResource): Promise<void> {
  const res = await fetch('/api/v1/export/' + resource)
  if (!res.ok) throw new Error('Export failed: ' + res.statusText)
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = resource + '-export.json'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export async function uploadImport(
  resource: ExportResource,
  file: File,
): Promise<{ imported: number }> {
  const text = await file.text()
  const payload = JSON.parse(text)
  const res = await fetch('/api/v1/import/' + resource, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.detail ?? 'Import failed: ' + res.statusText)
  }
  return res.json()
}

// ── Preview + commit (diff flow) ─────────────────────────────────────────────

export interface ImportPreviewConflict<T = Record<string, unknown>> {
  id: string
  existing: T
  imported: T
  diff_fields: string[]
}

export interface ImportPreviewResponse<T = Record<string, unknown>> {
  resource: string
  new_items: T[]
  conflicts: ImportPreviewConflict<T>[]
  db_only_props: string[]
  import_only_props: string[]
  tags?: { new: unknown[]; existing_count: number }
}

export interface ImportCommitResponse {
  imported: number
  tags_imported?: number
  nulled_fluorophore_refs?: number
  skipped_tag_refs?: number
}

export async function previewImport<T = Record<string, unknown>>(
  resource: ExportResource,
  payload: unknown,
): Promise<ImportPreviewResponse<T>> {
  const res = await fetch('/api/v1/import/' + resource + '/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.detail ?? 'Preview failed: ' + res.statusText)
  }
  return res.json()
}

export async function commitImport(
  resource: ExportResource,
  payload: { records: unknown[]; tags?: unknown[] },
): Promise<ImportCommitResponse> {
  const res = await fetch('/api/v1/import/' + resource + '/commit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.detail ?? 'Import failed: ' + res.statusText)
  }
  return res.json()
}

export async function readImportFile(file: File): Promise<{ records: unknown[]; tags?: unknown[] } & Record<string, unknown>> {
  const text = await file.text()
  return JSON.parse(text)
}
