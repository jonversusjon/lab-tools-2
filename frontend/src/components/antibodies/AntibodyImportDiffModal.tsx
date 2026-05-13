import { useMemo, useState } from 'react'
import Modal from '@/components/layout/Modal'
import AntibodyFormFields, {
  emptyAntibodyValues,
  type AntibodyFormValues,
} from '@/components/antibodies/AntibodyFormFields'
import { useFluorophores } from '@/hooks/useFluorophores'
import { formatDilution } from '@/utils/dilutions'
import {
  commitImport,
  type ImportPreviewResponse,
} from '@/api/exportImport'

type RawRecord = Record<string, unknown>

type Resolution = 'left' | 'right' | null

interface Props {
  isOpen: boolean
  preview: ImportPreviewResponse<RawRecord> | null
  tagsPayload: unknown[]
  onClose: () => void
  onCompleted: (result: { imported: number }) => void
}

function recordToValues(r: RawRecord | null): AntibodyFormValues {
  if (!r) return emptyAntibodyValues()
  return {
    target: String(r.target ?? ''),
    name: String(r.name ?? ''),
    clone: String(r.clone ?? ''),
    host: String(r.host ?? ''),
    isotype: String(r.isotype ?? ''),
    fluorophore_id: String(r.fluorophore_id ?? ''),
    conjugate: String(r.conjugate ?? ''),
    vendor: String(r.vendor ?? ''),
    catalog_number: String(r.catalog_number ?? ''),
    flow_dilution_factor: (r.flow_dilution_factor as number | null) ?? null,
    icc_if_dilution_factor: (r.icc_if_dilution_factor as number | null) ?? null,
    wb_dilution_factor: (r.wb_dilution_factor as number | null) ?? null,
    storage_temp: String(r.storage_temp ?? ''),
    confirmed_in_stock: Boolean(r.confirmed_in_stock),
    notes: String(r.notes ?? ''),
    website: String(r.website ?? ''),
    physical_location: String(r.physical_location ?? ''),
    is_favorite: Boolean(r.is_favorite),
    flow_dilution_raw: (r.flow_dilution as string | null) ?? null,
    icc_if_dilution_raw: (r.icc_if_dilution as string | null) ?? null,
    wb_dilution_raw: (r.wb_dilution as string | null) ?? null,
  }
}

function valuesToRecord(id: string, values: AntibodyFormValues, source: RawRecord): RawRecord {
  return {
    id,
    target: values.target.trim(),
    name: values.name.trim() || null,
    clone: values.clone.trim() || null,
    host: values.host.trim() || null,
    isotype: values.isotype.trim() || null,
    fluorophore_id: values.fluorophore_id || null,
    conjugate: values.conjugate.trim() || null,
    vendor: values.vendor.trim() || null,
    catalog_number: values.catalog_number.trim() || null,
    flow_dilution: formatDilution(values.flow_dilution_factor) || null,
    icc_if_dilution: formatDilution(values.icc_if_dilution_factor) || null,
    wb_dilution: formatDilution(values.wb_dilution_factor) || null,
    flow_dilution_factor: values.flow_dilution_factor,
    icc_if_dilution_factor: values.icc_if_dilution_factor,
    wb_dilution_factor: values.wb_dilution_factor,
    storage_temp: values.storage_temp || null,
    confirmed_in_stock: values.confirmed_in_stock,
    notes: values.notes.trim() || null,
    website: values.website.trim() || null,
    physical_location: values.physical_location.trim() || null,
    is_favorite: values.is_favorite,
    // Preserve fields the form doesn't manage (e.g. reacts_with, validation_notes, date_received)
    date_received: source.date_received ?? null,
    reacts_with: source.reacts_with ?? null,
    validation_notes: source.validation_notes ?? null,
    tag_ids: source.tag_ids ?? [],
  }
}

function labelFor(r: RawRecord): string {
  const name = (r.name as string | null) || null
  const target = (r.target as string | null) || null
  if (name && target && name !== target) return name + ' (' + target + ')'
  return name || target || String(r.id ?? 'Unknown')
}

export default function AntibodyImportDiffModal({
  isOpen,
  preview,
  tagsPayload,
  onClose,
  onCompleted,
}: Props) {
  const { data: fluorophoresData } = useFluorophores({ limit: 2000 })
  const fluorophores = useMemo(
    () => (fluorophoresData?.items ?? []).map((f) => ({ ...f, spectra: null })),
    [fluorophoresData],
  )

  const [tab, setTab] = useState<'conflicts' | 'new'>('conflicts')
  const [conflictIndex, setConflictIndex] = useState(0)
  const [newIndex, setNewIndex] = useState(0)
  const [resolutions, setResolutions] = useState<Record<string, Resolution>>({})
  // Per-conflict edit buffers for left/right
  const [leftEdits, setLeftEdits] = useState<Record<string, AntibodyFormValues>>({})
  const [rightEdits, setRightEdits] = useState<Record<string, AntibodyFormValues>>({})
  // Per-new-item edit buffers
  const [newEdits, setNewEdits] = useState<Record<string, AntibodyFormValues>>({})
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState('')

  if (!isOpen || !preview) return null

  const conflicts = preview.conflicts
  const newItems = preview.new_items
  const currentConflict = conflicts[conflictIndex]
  const currentNew = newItems[newIndex]

  const getLeftValues = (id: string, existing: RawRecord) =>
    leftEdits[id] ?? recordToValues(existing)
  const getRightValues = (id: string, imported: RawRecord) =>
    rightEdits[id] ?? recordToValues(imported)
  const getNewValues = (id: string, imp: RawRecord) =>
    newEdits[id] ?? recordToValues(imp)

  const setResolution = (id: string, choice: Resolution) => {
    setResolutions((r) => ({ ...r, [id]: choice }))
  }

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

      // New items: always included (user edits respected)
      for (const item of newItems) {
        const id = String(item.id)
        const values = getNewValues(id, item)
        records.push(valuesToRecord(id, values, item))
      }

      // Conflicts: include only if user chose left or right
      for (const c of conflicts) {
        const choice = resolutions[c.id]
        if (choice === 'right') {
          records.push(valuesToRecord(c.id, getRightValues(c.id, c.imported), c.imported))
        } else if (choice === 'left') {
          records.push(valuesToRecord(c.id, getLeftValues(c.id, c.existing), c.existing))
        }
        // null = keep existing DB row unchanged → don't send
      }

      const result = await commitImport('antibodies', { records, tags: tagsPayload })
      onCompleted({ imported: result.imported })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed')
    } finally {
      setApplying(false)
    }
  }

  const unresolvedCount = conflicts.filter((c) => resolutions[c.id] === undefined).length

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Import Antibodies — Review Changes"
      size="xl"
    >
      {/* Summary */}
      <div className="mb-4 rounded border border-accent-soft bg-accent-soft p-3 text-sm">
        <div className="font-medium text-accent-soft-foreground">Summary</div>
        <ul className="mt-1 ml-4 list-disc text-accent-soft-foreground">
          <li>{newItems.length} new item{newItems.length === 1 ? '' : 's'} will be added</li>
          <li>{conflicts.length} conflict{conflicts.length === 1 ? '' : 's'} detected</li>
          {preview.db_only_props.length > 0 && (
            <li>
              {preview.db_only_props.length} DB field{preview.db_only_props.length === 1 ? '' : 's'} missing from import:{' '}
              <span className="font-mono text-xs">{preview.db_only_props.join(', ')}</span>{' '}
              (new items will have these empty — edit each in the New Items tab if needed)
            </li>
          )}
          {preview.import_only_props.length > 0 && (
            <li>
              {preview.import_only_props.length} import field{preview.import_only_props.length === 1 ? '' : 's'} ignored:{' '}
              <span className="font-mono text-xs">{preview.import_only_props.join(', ')}</span>
            </li>
          )}
        </ul>
      </div>

      {/* Tab switcher */}
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

      {/* Conflict pane */}
      {tab === 'conflicts' && (
        <>
          {conflicts.length === 0 ? (
            <div className="py-8 text-center text-sm text-foreground-muted">
              No conflicts. All matched records are identical to the import.
            </div>
          ) : currentConflict ? (
            <>
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm text-foreground-muted">
                  <span className="font-medium">
                    Item {conflictIndex + 1} of {conflicts.length}:
                  </span>{' '}
                  {labelFor(currentConflict.imported)}
                  {resolutions[currentConflict.id] && (
                    <span className="ml-2 rounded bg-success-soft px-1.5 py-0.5 text-xs text-success-soft-foreground">
                      {resolutions[currentConflict.id] === 'right' ? 'Imported chosen' : 'Existing chosen'}
                    </span>
                  )}
                  {resolutions[currentConflict.id] === null && (
                    <span className="ml-2 rounded bg-surface px-1.5 py-0.5 text-xs text-foreground-muted">
                      Keep existing (skip)
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

              <div className="grid grid-cols-2 gap-4">
                <div className="rounded border border-border bg-surface p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
                      Existing (your DB)
                    </span>
                    <button
                      onClick={() => setResolution(currentConflict.id, 'left')}
                      className={
                        'rounded px-2 py-1 text-xs font-medium ' +
                        (resolutions[currentConflict.id] === 'left'
                          ? 'bg-accent text-accent-foreground'
                          : 'border border-border text-foreground-muted hover:bg-hover')
                      }
                    >
                      Keep this version
                    </button>
                  </div>
                  <AntibodyFormFields
                    values={getLeftValues(currentConflict.id, currentConflict.existing)}
                    onChange={(patch) =>
                      setLeftEdits((m) => ({
                        ...m,
                        [currentConflict.id]: { ...getLeftValues(currentConflict.id, currentConflict.existing), ...patch },
                      }))
                    }
                    fluorophores={fluorophores}
                    highlightFields={new Set(currentConflict.diff_fields)}
                    idPrefix={'diff-l-' + currentConflict.id}
                  />
                </div>
                <div className="rounded border border-warning bg-warning-soft p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
                      Imported (from file)
                    </span>
                    <button
                      onClick={() => setResolution(currentConflict.id, 'right')}
                      className={
                        'rounded px-2 py-1 text-xs font-medium ' +
                        (resolutions[currentConflict.id] === 'right'
                          ? 'bg-accent text-accent-foreground'
                          : 'border border-border text-foreground-muted hover:bg-hover')
                      }
                    >
                      Use this version
                    </button>
                  </div>
                  <AntibodyFormFields
                    values={getRightValues(currentConflict.id, currentConflict.imported)}
                    onChange={(patch) =>
                      setRightEdits((m) => ({
                        ...m,
                        [currentConflict.id]: { ...getRightValues(currentConflict.id, currentConflict.imported), ...patch },
                      }))
                    }
                    fluorophores={fluorophores}
                    highlightFields={new Set(currentConflict.diff_fields)}
                    idPrefix={'diff-r-' + currentConflict.id}
                  />
                </div>
              </div>

              {/* Global conflict actions */}
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
                  <span className="ml-auto self-center text-xs text-warning-soft-foreground">
                    {unresolvedCount} unresolved — unresolved conflicts keep the existing row.
                  </span>
                )}
              </div>
            </>
          ) : null}
        </>
      )}

      {/* New items pane */}
      {tab === 'new' && (
        <>
          {newItems.length === 0 ? (
            <div className="py-8 text-center text-sm text-foreground-muted">
              No new items.
            </div>
          ) : currentNew ? (
            <>
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm text-foreground-muted">
                  <span className="font-medium">
                    Item {newIndex + 1} of {newItems.length}:
                  </span>{' '}
                  {labelFor(currentNew)}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setNewIndex((i) => Math.max(0, i - 1))}
                    disabled={newIndex === 0}
                    className="rounded border border-border-strong px-2 py-1 text-xs disabled:opacity-40"
                  >
                    ← Prev
                  </button>
                  <button
                    onClick={() => setNewIndex((i) => Math.min(newItems.length - 1, i + 1))}
                    disabled={newIndex >= newItems.length - 1}
                    className="rounded border border-border-strong px-2 py-1 text-xs disabled:opacity-40"
                  >
                    Next →
                  </button>
                </div>
              </div>
              <div className="rounded border border-border p-3">
                <AntibodyFormFields
                  values={getNewValues(String(currentNew.id), currentNew)}
                  onChange={(patch) =>
                    setNewEdits((m) => ({
                      ...m,
                      [String(currentNew.id)]: {
                        ...getNewValues(String(currentNew.id), currentNew),
                        ...patch,
                      },
                    }))
                  }
                  fluorophores={fluorophores}
                  highlightFields={new Set(preview.db_only_props)}
                  idPrefix={'new-' + String(currentNew.id)}
                />
              </div>
              <p className="mt-2 text-xs text-foreground-muted">
                Fields highlighted in amber are present in your database but missing from the import file.
                You may fill them in before applying, or leave them empty.
              </p>
            </>
          ) : null}
        </>
      )}

      {error && (
        <div className="mt-3 rounded border border-danger bg-danger-soft p-2 text-sm text-danger-soft-foreground">
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
