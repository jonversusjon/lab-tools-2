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
