import { useState, useMemo, useRef, useEffect } from 'react'
import { tokenSearch } from '@/utils/search'
import {
  useSecondaries,
  useCreateSecondary,
  useUpdateSecondary,
  useDeleteSecondary,
  useUploadSecondaryCsv,
  useConfirmSecondaryImport,
} from '@/hooks/useSecondaries'
import { useFluorophores } from '@/hooks/useFluorophores'
import Modal from '@/components/layout/Modal'
import HoverActionsRow from '@/components/layout/HoverActionsRow'
import ListEditor from '@/components/shared/ListEditor'
import { useConjugateChemistries } from '@/hooks/useConjugateChemistries'
import type { SecondaryAntibody, SecondaryAntibodyCreate, SecondaryImportItem, Fluorophore } from '@/types'

const COMMON_ISOTYPES = ['IgG', 'IgG1', 'IgG2a', 'IgG2b', 'IgG2c', 'IgG3', 'IgM', 'IgA']

interface FormState {
  name: string
  host: string
  target_species: string
  target_isotype: string
  binding_mode: 'species' | 'conjugate'
  target_conjugate: string
  fluorophore_id: string | null
  fluorophore_name: string
  vendor: string
  catalog_number: string
  lot_number: string
  notes: string
}

const emptyForm: FormState = {
  name: '',
  host: '',
  target_species: '',
  target_isotype: '',
  binding_mode: 'species',
  target_conjugate: '',
  fluorophore_id: null,
  fluorophore_name: '',
  vendor: '',
  catalog_number: '',
  lot_number: '',
  notes: '',
}

function formToCreate(form: FormState): SecondaryAntibodyCreate {
  return {
    name: form.name.trim(),
    host: form.host.trim(),
    target_species: form.target_species.trim(),
    target_isotype: form.target_isotype.trim() || null,
    binding_mode: form.binding_mode,
    target_conjugate: form.binding_mode === 'conjugate'
      ? form.target_conjugate.trim().toLowerCase() || null
      : null,
    fluorophore_id: form.fluorophore_id,
    vendor: form.vendor.trim() || null,
    catalog_number: form.catalog_number.trim() || null,
    lot_number: form.lot_number.trim() || null,
    notes: form.notes.trim() || null,
  }
}

function FluorophoreSearch({
  fluorophores,
  selectedId,
  selectedName,
  onSelect,
  onClear,
}: {
  fluorophores: Fluorophore[]
  selectedId: string | null
  selectedName: string
  onSelect: (id: string, name: string) => void
  onClear: () => void
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const filtered = useMemo(() => {
    if (!query.trim()) return fluorophores.slice(0, 30)
    return tokenSearch(fluorophores, query, (f) => [
      { value: f.name, weight: 3 },
    ]).slice(0, 30)
  }, [fluorophores, query])

  if (selectedId) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-teal-700 dark:text-teal-400">{selectedName}</span>
        <button
          type="button"
          onClick={onClear}
          className="text-xs text-gray-400 hover:text-red-500"
        >
          Clear
        </button>
      </div>
    )
  }

  return (
    <div ref={ref} className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search fluorophores..."
        className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm dark:text-gray-100 focus:border-blue-500 focus:outline-none"
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-50 mt-1 max-h-48 w-full overflow-y-auto rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 shadow-lg">
          {filtered.map((fl) => (
            <li
              key={fl.id}
              className="cursor-pointer px-3 py-1.5 text-sm hover:bg-blue-50 dark:hover:bg-blue-900/30 dark:text-gray-100"
              onClick={() => {
                onSelect(fl.id, fl.name)
                setQuery('')
                setOpen(false)
              }}
            >
              <span className="font-medium">{fl.name}</span>
              {fl.ex_max_nm && fl.em_max_nm && (
                <span className="ml-2 text-xs text-gray-400">
                  {fl.ex_max_nm}/{fl.em_max_nm}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function SecondaryList() {
  const [search, setSearch] = useState('')
  const { data, isLoading, error } = useSecondaries({ skip: 0, limit: 500 })
  const { data: fluorophoreData } = useFluorophores({ skip: 0, limit: 2000 })
  const createMutation = useCreateSecondary()
  const updateMutation = useUpdateSecondary()
  const deleteMutation = useDeleteSecondary()
  const uploadCsvMutation = useUploadSecondaryCsv()
  const confirmImportMutation = useConfirmSecondaryImport()

  const fluorophores = fluorophoreData?.items ?? []
  const allItems = data?.items ?? []
  const { data: conjugateChemistries = [] } = useConjugateChemistries()

  const items = useMemo(() => {
    if (!search.trim()) return allItems
    return tokenSearch(allItems, search, (sa) => [
      { value: sa.name, weight: 2 },
      { value: sa.host, weight: 1 },
      { value: sa.target_species, weight: 1.5 },
      { value: sa.target_isotype, weight: 1 },
      { value: sa.fluorophore_name, weight: 2 },
      { value: sa.vendor, weight: 0.5 },
      { value: sa.catalog_number, weight: 0.5 },
    ])
  }, [allItems, search])

  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Create/Edit modal
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>({ ...emptyForm })

  // CSV import modal
  const [showImport, setShowImport] = useState(false)
  const [importItems, setImportItems] = useState<SecondaryImportItem[] | null>(null)
  const [importResult, setImportResult] = useState<{ created: number; skipped: number } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const openCreate = () => {
    setEditingId(null)
    setForm({ ...emptyForm })
    setShowModal(true)
  }

  const openEdit = (sa: SecondaryAntibody) => {
    setEditingId(sa.id)
    setForm({
      name: sa.name,
      host: sa.host,
      target_species: sa.target_species,
      target_isotype: sa.target_isotype ?? '',
      binding_mode: sa.binding_mode ?? 'species',
      target_conjugate: sa.target_conjugate ?? '',
      fluorophore_id: sa.fluorophore_id,
      fluorophore_name: sa.fluorophore_name ?? '',
      vendor: sa.vendor ?? '',
      catalog_number: sa.catalog_number ?? '',
      lot_number: sa.lot_number ?? '',
      notes: sa.notes ?? '',
    })
    setShowModal(true)
  }

  const handleSubmit = () => {
    const canSubmit = form.name.trim() && form.host.trim() && (
      form.binding_mode === 'species'
        ? form.target_species.trim()
        : form.target_conjugate.trim()
    )
    if (!canSubmit) return
    const payload = formToCreate(form)
    if (editingId) {
      updateMutation.mutate(
        { id: editingId, data: payload },
        { onSuccess: () => { setShowModal(false); setEditingId(null) } }
      )
    } else {
      createMutation.mutate(payload, {
        onSuccess: () => { setShowModal(false) },
      })
    }
  }

  const handleDelete = (sa: SecondaryAntibody) => {
    if (!confirm('Delete secondary "' + sa.name + '"? This cannot be undone.')) return
    deleteMutation.mutate(sa.id)
  }

  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const result = await uploadCsvMutation.mutateAsync(file)
      setImportItems(result.items)
      setImportResult(null)
    } catch {
      // Error handled by mutation state
    }
    // Reset file input so the same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleRemoveImportRow = (rowNumber: number) => {
    setImportItems((prev) => prev ? prev.filter((i) => i.row_number !== rowNumber) : null)
  }

  const handleConfirmImport = async () => {
    if (!importItems) return
    try {
      const result = await confirmImportMutation.mutateAsync(importItems)
      setImportResult({ created: result.created, skipped: result.skipped })
      setImportItems(null)
    } catch {
      // Error handled by mutation state
    }
  }

  const closeImport = () => {
    setShowImport(false)
    setImportItems(null)
    setImportResult(null)
  }

  const setField = (field: keyof FormState, value: string | null) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  if (isLoading) return <p className="text-gray-500 dark:text-gray-400">Loading secondary antibodies...</p>
  if (error) return <p className="text-red-600">Failed to load secondary antibodies.</p>

  const inputClass = "w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm dark:text-gray-100 focus:border-blue-500 focus:outline-none"

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold dark:text-gray-100">Secondary Antibodies</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setShowImport(true)}
            className="rounded border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Import CSV
          </button>
          <button
            onClick={openCreate}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            New Secondary
          </button>
        </div>
      </div>

      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, host, target, fluorophore, vendor..."
          className={inputClass}
        />
      </div>

      {items.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400">
          {search ? 'No matching secondary antibodies.' : 'No secondary antibodies yet. Create one or import from CSV.'}
        </p>
      ) : (
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400">
              <th className="py-2 font-medium">Name</th>
              <th className="py-2 font-medium">Host</th>
              <th className="py-2 font-medium">Target</th>
              <th className="py-2 font-medium">Isotype</th>
              <th className="py-2 font-medium">Fluorophore</th>
              <th className="py-2 font-medium">Vendor</th>
              <th className="w-16 py-2" />
            </tr>
          </thead>
          <tbody>
            {items.map((sa) => (
              <HoverActionsRow
                key={sa.id}
                as="tr"
                className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
                onClick={() => setExpandedId(expandedId === sa.id ? null : sa.id)}
                actions={{
                  onRename: () => openEdit(sa),
                  onDelete: () => handleDelete(sa),
                }}
              >
                <td className="py-2 font-medium text-gray-900 dark:text-gray-100">{sa.name}</td>
                <td className="py-2 text-gray-600 dark:text-gray-400">{sa.host}</td>
              <td className="py-2 text-gray-600 dark:text-gray-400">
                  {sa.binding_mode === 'conjugate' ? (
                    <span className="text-amber-600 dark:text-amber-400" title="Targets conjugate">
                      {sa.target_conjugate ?? '?'}
                    </span>
                  ) : (
                    sa.target_species
                  )}
                </td>
                <td className="py-2 text-gray-600 dark:text-gray-400">{sa.target_isotype ?? '—'}</td>
                <td className="py-2">
                  {sa.fluorophore_name ? (
                    <span className="text-teal-700 dark:text-teal-400">{sa.fluorophore_name}</span>
                  ) : (
                    <span className="text-gray-400 dark:text-gray-500">—</span>
                  )}
                </td>
                <td className="py-2 text-gray-500 dark:text-gray-400">{sa.vendor ?? '—'}</td>
              </HoverActionsRow>
            ))}
          </tbody>
        </table>
      )}

      {/* Expanded detail */}
      {expandedId && (() => {
        const sa = items.find((s) => s.id === expandedId)
        if (!sa) return null
        return <SecondaryDetail secondary={sa} onEdit={openEdit} />
      })()}

      {/* Create / Edit Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => { setShowModal(false); setEditingId(null) }}
        title={editingId ? 'Edit Secondary Antibody' : 'New Secondary Antibody'}
      >
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setField('name', e.target.value)}
              className={inputClass}
              placeholder="e.g. Goat anti-Mouse IgG (H+L) AF488"
              autoFocus
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Binding Mode <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setField('binding_mode', 'species')}
                className={`rounded border px-3 py-1.5 text-sm ${
                  form.binding_mode === 'species'
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 font-medium'
                    : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400'
                }`}
              >
                Anti-Species
              </button>
              <button
                type="button"
                onClick={() => setField('binding_mode', 'conjugate')}
                className={`rounded border px-3 py-1.5 text-sm ${
                  form.binding_mode === 'conjugate'
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 font-medium'
                    : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400'
                }`}
              >
                Conjugate Reagent
              </button>
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {form.binding_mode === 'species'
                ? 'Traditional secondary \u2014 targets host species/isotype of the primary.'
                : 'Conjugate reagent (e.g. Streptavidin) \u2014 targets a non-fluorescent conjugate on the primary.'}
            </p>
          </div>
          {form.binding_mode === 'species' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <ListEditor
                  listType="host"
                  label="Host"
                  value={form.host}
                  onChange={(v) => setField('host', v)}
                  placeholder="e.g. Goat"
                  required
                />
                <ListEditor
                  listType="target_species"
                  label="Target Species"
                  value={form.target_species}
                  onChange={(v) => setField('target_species', v)}
                  placeholder="e.g. Mouse"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Target Isotype
                  </label>
                  <input
                    type="text"
                    list="isotype-list"
                    value={form.target_isotype}
                    onChange={(e) => setField('target_isotype', e.target.value)}
                    className={inputClass}
                    placeholder="e.g. IgG"
                  />
                  <datalist id="isotype-list">
                    {COMMON_ISOTYPES.map((i) => <option key={i} value={i} />)}
                  </datalist>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Vendor
                  </label>
                  <input
                    type="text"
                    value={form.vendor}
                    onChange={(e) => setField('vendor', e.target.value)}
                    className={inputClass}
                    placeholder="e.g. Thermo Fisher"
                  />
                </div>
              </div>
            </>
          )}
          {form.binding_mode === 'conjugate' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <ListEditor
                  listType="host"
                  label="Host"
                  value={form.host}
                  onChange={(v) => setField('host', v)}
                  placeholder="e.g. N/A"
                  required
                />
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Target Conjugate <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    list="target-conjugate-list"
                    value={form.target_conjugate}
                    onChange={(e) => setField('target_conjugate', e.target.value)}
                    className={inputClass}
                    placeholder="e.g. biotin, digoxigenin"
                  />
                  <datalist id="target-conjugate-list">
                    {conjugateChemistries.map((c) => <option key={c.id} value={c.name} />)}
                  </datalist>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Vendor
                  </label>
                  <input
                    type="text"
                    value={form.vendor}
                    onChange={(e) => setField('vendor', e.target.value)}
                    className={inputClass}
                    placeholder="e.g. Thermo Fisher"
                  />
                </div>
              </div>
            </>
          )}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Fluorophore
            </label>
            <FluorophoreSearch
              fluorophores={fluorophores}
              selectedId={form.fluorophore_id}
              selectedName={form.fluorophore_name}
              onSelect={(id, name) => {
                setField('fluorophore_id', id)
                setField('fluorophore_name', name)
              }}
              onClear={() => {
                setField('fluorophore_id', null)
                setField('fluorophore_name', '')
              }}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Catalog Number
              </label>
              <input
                type="text"
                value={form.catalog_number}
                onChange={(e) => setField('catalog_number', e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Lot Number
              </label>
              <input
                type="text"
                value={form.lot_number}
                onChange={(e) => setField('lot_number', e.target.value)}
                className={inputClass}
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Notes
            </label>
            <textarea
              value={form.notes}
              onChange={(e) => setField('notes', e.target.value)}
              className={inputClass}
              rows={2}
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => { setShowModal(false); setEditingId(null) }}
              className="rounded border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!(form.name.trim() && form.host.trim() && (
                form.binding_mode === 'species'
                  ? form.target_species.trim()
                  : form.target_conjugate.trim()
              ))}
              className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {editingId ? 'Save' : 'Create'}
            </button>
          </div>
        </div>
      </Modal>

      {/* CSV Import Modal */}
      <Modal
        isOpen={showImport}
        onClose={closeImport}
        title="Import Secondary Antibodies from CSV"
        wide
      >
        <div className="space-y-4">
          {!importItems && !importResult && (
            <div>
              <p className="mb-3 text-sm text-gray-600 dark:text-gray-400">
                Upload a CSV file with columns: name, host, target_species, target_isotype, fluorophore, vendor, catalog_number.
                Required columns: name, host, target_species.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleCsvUpload}
                className="block w-full text-sm text-gray-500 dark:text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-medium file:bg-blue-50 dark:file:bg-blue-900/30 file:text-blue-700 dark:file:text-blue-400 hover:file:bg-blue-100 dark:hover:file:bg-blue-900/50"
              />
              {uploadCsvMutation.isPending && (
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Parsing CSV...</p>
              )}
              {uploadCsvMutation.isError && (
                <p className="mt-2 text-sm text-red-600">Failed to parse CSV file. Check the format and try again.</p>
              )}
            </div>
          )}

          {importItems && (
            <div>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {importItems.length} rows ready to import
                  {importItems.filter((i) => i.warnings.length > 0).length > 0 && (
                    <span className="ml-1 text-amber-600 dark:text-amber-400">
                      ({importItems.filter((i) => i.warnings.length > 0).length} with warnings)
                    </span>
                  )}
                </p>
                <button
                  onClick={() => { setImportItems(null) }}
                  className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  Back
                </button>
              </div>
              <div className="max-h-96 overflow-y-auto rounded border border-gray-200 dark:border-gray-700">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                      <th className="px-2 py-1.5 font-medium">#</th>
                      <th className="px-2 py-1.5 font-medium">Name</th>
                      <th className="px-2 py-1.5 font-medium">Host</th>
                      <th className="px-2 py-1.5 font-medium">Target</th>
                      <th className="px-2 py-1.5 font-medium">Isotype</th>
                      <th className="px-2 py-1.5 font-medium">Fluorophore</th>
                      <th className="px-2 py-1.5 font-medium">Vendor</th>
                      <th className="px-2 py-1.5 font-medium w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {importItems.map((item) => (
                      <tr
                        key={item.row_number}
                        className={
                          'border-b border-gray-100 dark:border-gray-700' +
                          (item.warnings.length > 0 ? ' bg-amber-50 dark:bg-amber-900/20' : '')
                        }
                      >
                        <td className="px-2 py-1.5 text-gray-400">{item.row_number}</td>
                        <td className="px-2 py-1.5 text-gray-900 dark:text-gray-100">{item.name}</td>
                        <td className="px-2 py-1.5 text-gray-600 dark:text-gray-400">{item.host}</td>
                        <td className="px-2 py-1.5 text-gray-600 dark:text-gray-400">{item.target_species}</td>
                        <td className="px-2 py-1.5 text-gray-600 dark:text-gray-400">{item.target_isotype ?? '—'}</td>
                        <td className="px-2 py-1.5">
                          {item.fluorophore_id ? (
                            <span className="text-teal-700 dark:text-teal-400">{item.fluorophore_name}</span>
                          ) : item.fluorophore_name ? (
                            <span className="text-amber-600 dark:text-amber-400" title="Not matched">{item.fluorophore_name}</span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-gray-500 dark:text-gray-400">{item.vendor ?? '—'}</td>
                        <td className="px-2 py-1.5 text-center">
                          <button
                            onClick={() => handleRemoveImportRow(item.row_number)}
                            className="text-red-400 hover:text-red-600"
                            title="Remove row"
                          >
                            &times;
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {importItems.some((i) => i.warnings.length > 0) && (
                <div className="mt-2 space-y-1">
                  {importItems
                    .filter((i) => i.warnings.length > 0)
                    .map((i) =>
                      i.warnings.map((w, wi) => (
                        <p key={i.row_number + '-' + wi} className="text-xs text-amber-600 dark:text-amber-400">
                          Row {i.row_number}: {w}
                        </p>
                      ))
                    )}
                </div>
              )}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeImport}
                  className="rounded border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmImport}
                  disabled={importItems.length === 0 || confirmImportMutation.isPending}
                  className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {confirmImportMutation.isPending ? 'Importing...' : 'Confirm Import (' + importItems.length + ' rows)'}
                </button>
              </div>
            </div>
          )}

          {importResult && (
            <div>
              <p className="text-sm text-gray-700 dark:text-gray-300">
                Created <span className="font-semibold text-green-600 dark:text-green-400">{importResult.created}</span> secondary antibodies.
                {importResult.skipped > 0 && (
                  <span>
                    {' '}Skipped <span className="font-semibold text-amber-600 dark:text-amber-400">{importResult.skipped}</span> duplicates.
                  </span>
                )}
              </p>
              {confirmImportMutation.data?.errors && confirmImportMutation.data.errors.length > 0 && (
                <div className="mt-2 space-y-1">
                  {confirmImportMutation.data.errors.map((err, i) => (
                    <p key={i} className="text-xs text-red-600">{err}</p>
                  ))}
                </div>
              )}
              <div className="flex justify-end pt-4">
                <button
                  onClick={closeImport}
                  className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}

function SecondaryDetail({
  secondary: sa,
  onEdit,
}: {
  secondary: SecondaryAntibody
  onEdit: (sa: SecondaryAntibody) => void
}) {
  return (
    <div className="mt-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold dark:text-gray-100">
          {sa.name}
        </h3>
        <button
          onClick={() => onEdit(sa)}
          className="rounded border border-gray-300 dark:border-gray-600 px-3 py-1 text-xs text-gray-700 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700"
        >
          Edit
        </button>
      </div>
      <div className="grid grid-cols-3 gap-x-6 gap-y-2 text-xs">
        <DetailField label="Host" value={sa.host} />
        <DetailField label="Target Species" value={sa.target_species} />
        <DetailField label="Target Isotype" value={sa.target_isotype} />
        <DetailField label="Binding Mode" value={sa.binding_mode} />
        <DetailField label="Target Conjugate" value={sa.target_conjugate} />
        <DetailField label="Fluorophore" value={sa.fluorophore_name} />
        <DetailField label="Vendor" value={sa.vendor} />
        <DetailField label="Catalog #" value={sa.catalog_number} />
        <DetailField label="Lot #" value={sa.lot_number} />
      </div>
      {sa.notes && (
        <div className="mt-2">
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Notes:</span>
          <p className="mt-0.5 text-xs text-gray-700 dark:text-gray-300">{sa.notes}</p>
        </div>
      )}
    </div>
  )
}

function DetailField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <span className="text-gray-500 dark:text-gray-400">{label}: </span>
      <span className="text-gray-800 dark:text-gray-200">
        {value || <span className="italic text-gray-400">--</span>}
      </span>
    </div>
  )
}
