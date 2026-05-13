import { useState } from 'react'
import Modal from '@/components/layout/Modal'
import {
  commitImport,
  type ExportResource,
  type ImportPreviewResponse,
} from '@/api/exportImport'

type RawRecord = Record<string, unknown>
type Resolution = 'left' | 'right' | null

export interface NestedPreviewExtra {
  fk_warnings?: { id: string; assignments_at_risk: number }[]
}

interface Props {
  isOpen: boolean
  preview: (ImportPreviewResponse<RawRecord> & NestedPreviewExtra) | null
  resource: ExportResource
  title: string
  childKeys: string[]
  labelFor: (r: RawRecord) => string
  onClose: () => void
  onCompleted: (result: { imported: number }) => void
}

function countChildren(r: RawRecord, childKeys: string[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const k of childKeys) {
    const v = r[k]
    out[k] = Array.isArray(v) ? v.length : 0
  }
  return out
}

function countNestedLeaves(r: RawRecord, parentKey: string, leafKey: string): number {
  const parent = r[parentKey]
  if (!Array.isArray(parent)) return 0
  return parent.reduce((sum, child) => {
    const leaves = (child as RawRecord)[leafKey]
    return sum + (Array.isArray(leaves) ? leaves.length : 0)
  }, 0)
}

function summaryLine(r: RawRecord, childKeys: string[]): string {
  const counts = countChildren(r, childKeys)
  const parts = Object.entries(counts).map(([k, n]) => n + ' ' + k)
  // Also mention depth-2 if lasers→detectors/filters
  if (childKeys.includes('lasers')) {
    const detectors = countNestedLeaves(r, 'lasers', 'detectors')
    const filters = countNestedLeaves(r, 'lasers', 'filters')
    if (detectors) parts.push(detectors + ' detectors')
    if (filters) parts.push(filters + ' filters')
  }
  return parts.join(', ')
}

function RecordSummary({
  record,
  schemaKeys,
  childKeys,
  highlight,
}: {
  record: RawRecord
  schemaKeys: string[]
  childKeys: string[]
  highlight: Set<string>
}) {
  return (
    <div className="space-y-2 text-sm">
      {schemaKeys.map((k) => {
        const v = record[k]
        const isChild = childKeys.includes(k)
        const rowClass = highlight.has(k)
          ? 'rounded ring-2 ring-amber-400 dark:ring-amber-500 ring-offset-1 dark:ring-offset-gray-800 px-1' // theme-exempt: ring-offset-gray-800 has no token equivalent
          : ''
        if (isChild && Array.isArray(v)) {
          return (
            <div key={k} className={rowClass}>
              <div className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
                {k} ({v.length})
              </div>
              <ul className="mt-1 ml-4 list-disc text-xs text-foreground-muted">
                {(v as RawRecord[]).slice(0, 20).map((child, i) => (
                  <li key={i}>
                    <NestedChildLine child={child} />
                  </li>
                ))}
                {v.length > 20 && <li className="italic text-foreground-subtle">… and {v.length - 20} more</li>}
              </ul>
            </div>
          )
        }
        return (
          <div key={k} className={rowClass + ' flex items-baseline gap-2'}>
            <span className="w-28 shrink-0 text-xs font-medium text-foreground-muted">{k}</span>
            <span className="text-sm text-foreground break-all">
              {v === null || v === undefined || v === ''
                ? <span className="text-foreground-subtle italic">null</span>
                : typeof v === 'boolean' ? String(v) : String(v)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function NestedChildLine({ child }: { child: RawRecord }) {
  // Pretty-print a child: prefer name, else key fields
  const bits: string[] = []
  if (child.name) bits.push(String(child.name))
  if (child.wavelength_nm) bits.push(child.wavelength_nm + 'nm')
  if (child.filter_midpoint) bits.push(child.filter_midpoint + '/' + child.filter_width)
  if (child.antibody_id) bits.push('ab=' + String(child.antibody_id).slice(0, 8))
  if (child.fluorophore_id) bits.push('fl=' + String(child.fluorophore_id))
  if (child.detector_id) bits.push('det=' + String(child.detector_id).slice(0, 8))
  if (child.filter_id) bits.push('filt=' + String(child.filter_id).slice(0, 8))
  const nested =
    (Array.isArray(child.detectors) && child.detectors.length) ||
    (Array.isArray(child.filters) && child.filters.length)
  const label = bits.join(' · ') || '(row)'
  return (
    <>
      {label}
      {nested ? (
        <ul className="ml-4 list-[circle] text-foreground-muted">
          {(child.detectors as RawRecord[] | undefined)?.map((d, i) => (
            <li key={'d-' + i}>
              <NestedChildLine child={d} />
            </li>
          ))}
          {(child.filters as RawRecord[] | undefined)?.map((f, i) => (
            <li key={'f-' + i}>
              <NestedChildLine child={f} />
            </li>
          ))}
        </ul>
      ) : null}
    </>
  )
}

export default function NestedImportDiffModal({
  isOpen,
  preview,
  resource,
  title,
  childKeys,
  labelFor,
  onClose,
  onCompleted,
}: Props) {
  const [tab, setTab] = useState<'conflicts' | 'new'>('conflicts')
  const [conflictIndex, setConflictIndex] = useState(0)
  const [resolutions, setResolutions] = useState<Record<string, Resolution>>({})
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState('')

  if (!isOpen || !preview) return null

  const conflicts = preview.conflicts
  const newItems = preview.new_items
  const currentConflict = conflicts[conflictIndex]

  const setResolution = (id: string, choice: Resolution) =>
    setResolutions((r) => ({ ...r, [id]: choice }))

  const acceptAllImported = () => {
    const next: Record<string, Resolution> = {}
    for (const c of conflicts) next[c.id] = 'right'
    setResolutions(next)
  }
  const keepAllExisting = () => {
    const next: Record<string, Resolution> = {}
    for (const c of conflicts) next[c.id] = null
    setResolutions(next)
  }

  const handleApply = async () => {
    setError('')
    setApplying(true)
    try {
      const records: RawRecord[] = []
      for (const item of newItems) records.push(item)
      for (const c of conflicts) {
        const choice = resolutions[c.id]
        if (choice === 'right') records.push(c.imported)
        else if (choice === 'left') records.push(c.existing)
        // null = skip, don't send
      }
      const result = await commitImport(resource, { records })
      onCompleted({ imported: result.imported })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed')
    } finally {
      setApplying(false)
    }
  }

  const unresolvedCount = conflicts.filter((c) => resolutions[c.id] === undefined).length
  const fkWarnings = preview.fk_warnings ?? []
  const currentFkWarning =
    currentConflict && fkWarnings.find((w) => w.id === currentConflict.id)

  const schemaKeys = currentConflict
    ? Object.keys({ ...currentConflict.existing, ...currentConflict.imported })
    : newItems[0] ? Object.keys(newItems[0]) : []
  const highlight = new Set(currentConflict?.diff_fields ?? [])

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="xl">
      <div className="mb-4 rounded border border-blue-200 bg-blue-50 p-3 text-sm dark:border-blue-900 dark:bg-blue-950"> {/* theme-exempt: info summary banner, no info-soft token */}
        <div className="font-medium text-blue-900 dark:text-blue-200">Summary</div> {/* theme-exempt: info banner heading */}
        <ul className="mt-1 ml-4 list-disc text-blue-800 dark:text-blue-300"> {/* theme-exempt: info banner list */}
          <li>{newItems.length} new item{newItems.length === 1 ? '' : 's'} will be added</li>
          <li>{conflicts.length} conflict{conflicts.length === 1 ? '' : 's'} detected</li>
          {fkWarnings.length > 0 && (
            <li className="text-warning-soft-foreground">
              {fkWarnings.length} conflict{fkWarnings.length === 1 ? '' : 's'} will cascade-delete panel assignments if you accept imported (see per-item warning)
            </li>
          )}
          {preview.db_only_props.length > 0 && (
            <li>
              DB-only fields: <span className="font-mono text-xs">{preview.db_only_props.join(', ')}</span>
            </li>
          )}
          {preview.import_only_props.length > 0 && (
            <li>
              Ignored import fields: <span className="font-mono text-xs">{preview.import_only_props.join(', ')}</span>
            </li>
          )}
        </ul>
      </div>

      <div className="mb-3 flex gap-2 border-b border-border">
        <button
          onClick={() => setTab('conflicts')}
          className={
            'border-b-2 px-4 py-2 text-sm font-medium ' +
            (tab === 'conflicts'
              ? 'border-accent text-accent'
              : 'border-transparent text-foreground-muted hover:text-foreground')
          }
        >
          Conflicts ({conflicts.length})
        </button>
        <button
          onClick={() => setTab('new')}
          className={
            'border-b-2 px-4 py-2 text-sm font-medium ' +
            (tab === 'new'
              ? 'border-accent text-accent'
              : 'border-transparent text-foreground-muted hover:text-foreground')
          }
        >
          New Items ({newItems.length})
        </button>
      </div>

      {tab === 'conflicts' && (
        <>
          {conflicts.length === 0 ? (
            <div className="py-8 text-center text-sm text-foreground-muted">
              No conflicts.
            </div>
          ) : currentConflict ? (
            <>
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm text-foreground-muted">
                  <span className="font-medium">
                    Item {conflictIndex + 1} of {conflicts.length}:
                  </span>{' '}
                  {labelFor(currentConflict.imported)}
                  {resolutions[currentConflict.id] === 'right' && (
                    <span className="ml-2 rounded bg-success-soft px-1.5 py-0.5 text-xs text-success-soft-foreground">
                      Imported chosen
                    </span>
                  )}
                  {resolutions[currentConflict.id] === 'left' && (
                    <span className="ml-2 rounded bg-success-soft px-1.5 py-0.5 text-xs text-success-soft-foreground">
                      Existing chosen
                    </span>
                  )}
                  {resolutions[currentConflict.id] === null && (
                    <span className="ml-2 rounded bg-surface px-1.5 py-0.5 text-xs text-foreground-muted">
                      Skip
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setConflictIndex((i) => Math.max(0, i - 1))}
                    disabled={conflictIndex === 0}
                    className="rounded border border-border-strong px-2 py-1 text-xs disabled:opacity-40"
                  >
                    ← Prev
                  </button>
                  <button
                    onClick={() => setConflictIndex((i) => Math.min(conflicts.length - 1, i + 1))}
                    disabled={conflictIndex >= conflicts.length - 1}
                    className="rounded border border-border-strong px-2 py-1 text-xs disabled:opacity-40"
                  >
                    Next →
                  </button>
                </div>
              </div>

              <div className="mb-2 text-xs text-foreground-muted">
                Differing fields: {currentConflict.diff_fields.join(', ')}
              </div>

              {currentFkWarning && (
                <div className="mb-3 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
                  ⚠ Accepting imported will cascade-delete{' '}
                  <strong>{currentFkWarning.assignments_at_risk}</strong> panel assignment{currentFkWarning.assignments_at_risk === 1 ? '' : 's'}{' '}
                  that reference detectors on this instrument.
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="rounded border border-border bg-surface p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
                      Existing · {summaryLine(currentConflict.existing, childKeys)}
                    </span>
                    <button
                      onClick={() => setResolution(currentConflict.id, 'left')}
                      className={
                        'rounded px-2 py-1 text-xs font-medium ' +
                        (resolutions[currentConflict.id] === 'left'
                          ? 'bg-accent text-accent-foreground'
                          : 'border border-border-strong text-foreground-muted hover:bg-hover')
                      }
                    >
                      Keep this version
                    </button>
                  </div>
                  <RecordSummary
                    record={currentConflict.existing}
                    schemaKeys={schemaKeys}
                    childKeys={childKeys}
                    highlight={highlight}
                  />
                </div>
                <div className="rounded border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
                      Imported · {summaryLine(currentConflict.imported, childKeys)}
                    </span>
                    <button
                      onClick={() => setResolution(currentConflict.id, 'right')}
                      className={
                        'rounded px-2 py-1 text-xs font-medium ' +
                        (resolutions[currentConflict.id] === 'right'
                          ? 'bg-accent text-accent-foreground'
                          : 'border border-border-strong text-foreground-muted hover:bg-hover')
                      }
                    >
                      Use this version
                    </button>
                  </div>
                  <RecordSummary
                    record={currentConflict.imported}
                    schemaKeys={schemaKeys}
                    childKeys={childKeys}
                    highlight={highlight}
                  />
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3">
                <button
                  onClick={acceptAllImported}
                  className="rounded bg-accent hover:bg-accent-hover text-accent-foreground px-3 py-1.5 text-xs font-medium"
                >
                  Accept all imported
                </button>
                <button
                  onClick={keepAllExisting}
                  className="rounded border border-border-strong px-3 py-1.5 text-xs font-medium text-foreground-muted hover:bg-hover"
                >
                  Keep all existing
                </button>
                {unresolvedCount > 0 && (
                  <span className="ml-auto self-center text-xs text-amber-700 dark:text-amber-300">
                    {unresolvedCount} unresolved — unresolved conflicts keep existing rows unchanged.
                  </span>
                )}
              </div>
            </>
          ) : null}
        </>
      )}

      {tab === 'new' && (
        <>
          {newItems.length === 0 ? (
            <div className="py-8 text-center text-sm text-foreground-muted">
              No new items.
            </div>
          ) : (
            <div className="space-y-3">
              {newItems.map((item, idx) => (
                <div
                  key={String(item.id ?? idx)}
                  className="rounded border border-border p-3"
                >
                  <div className="mb-1 text-sm font-medium text-foreground">
                    {labelFor(item)}
                  </div>
                  <div className="text-xs text-foreground-muted">
                    {summaryLine(item, childKeys)}
                  </div>
                </div>
              ))}
              <p className="text-xs text-foreground-muted">
                All new items will be imported as-is.
              </p>
            </div>
          )}
        </>
      )}

      {error && (
        <div className="mt-3 rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="mt-5 flex justify-end gap-2 border-t border-border pt-4">
        <button
          onClick={onClose}
          disabled={applying}
          className="rounded border border-border-strong px-4 py-2 text-sm text-foreground-muted hover:bg-hover disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onClick={handleApply}
          disabled={applying}
          className="rounded bg-success px-4 py-2 text-sm font-medium text-success-foreground hover:opacity-90 disabled:opacity-50"
        >
          {applying ? 'Applying...' : 'Apply'}
        </button>
      </div>
    </Modal>
  )
}
