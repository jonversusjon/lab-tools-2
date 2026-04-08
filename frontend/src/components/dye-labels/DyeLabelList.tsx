import { useState, useMemo } from 'react'
import { tokenSearch } from '@/utils/search'
import {
  useDyeLabels,
  useCreateDyeLabel,
  useUpdateDyeLabel,
  useDeleteDyeLabel,
} from '@/hooks/useDyeLabels'
import { useFluorophores } from '@/hooks/useFluorophores'
import Modal from '@/components/layout/Modal'
import HoverActionsRow from '@/components/layout/HoverActionsRow'
import FluorophoreSearch from '@/components/shared/FluorophoreSearch'
import type { DyeLabel, DyeLabelCreate } from '@/types'

interface FormState {
  name: string
  label_target: string
  category: string
  fluorophore_id: string | null
  fluorophore_name: string
  vendor: string
  catalog_number: string
  lot_number: string
  flow_dilution: string
  icc_if_dilution: string
  notes: string
}

const emptyForm: FormState = {
  name: '',
  label_target: '',
  category: '',
  fluorophore_id: null,
  fluorophore_name: '',
  vendor: '',
  catalog_number: '',
  lot_number: '',
  flow_dilution: '',
  icc_if_dilution: '',
  notes: '',
}

function formToCreate(form: FormState): DyeLabelCreate {
  return {
    name: form.name.trim(),
    label_target: form.label_target.trim(),
    category: form.category.trim() || null,
    fluorophore_id: form.fluorophore_id,
    vendor: form.vendor.trim() || null,
    catalog_number: form.catalog_number.trim() || null,
    lot_number: form.lot_number.trim() || null,
    flow_dilution: form.flow_dilution.trim() || null,
    icc_if_dilution: form.icc_if_dilution.trim() || null,
    notes: form.notes.trim() || null,
  }
}

export default function DyeLabelList() {
  const [search, setSearch] = useState('')
  const { data, isLoading, error } = useDyeLabels({ skip: 0, limit: 500 })
  const { data: fluorophoreData } = useFluorophores({ skip: 0, limit: 2000 })
  const createMutation = useCreateDyeLabel()
  const updateMutation = useUpdateDyeLabel()
  const deleteMutation = useDeleteDyeLabel()

  const fluorophores = fluorophoreData?.items ?? []
  const allItems = data?.items ?? []

  const items = useMemo(() => {
    if (!search.trim()) return allItems
    return tokenSearch(allItems, search, (dl) => [
      { value: dl.name, weight: 3 },
      { value: dl.label_target, weight: 2 },
      { value: dl.category, weight: 1.5 },
      { value: dl.fluorophore_name, weight: 1.5 },
      { value: dl.vendor, weight: 0.5 },
      { value: dl.catalog_number, weight: 0.5 },
    ])
  }, [allItems, search])

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>({ ...emptyForm })

  const openCreate = () => {
    setEditingId(null)
    setForm({ ...emptyForm })
    setShowModal(true)
  }

  const openEdit = (dl: DyeLabel) => {
    setEditingId(dl.id)
    setForm({
      name: dl.name,
      label_target: dl.label_target,
      category: dl.category ?? '',
      fluorophore_id: dl.fluorophore_id,
      fluorophore_name: dl.fluorophore_name ?? '',
      vendor: dl.vendor ?? '',
      catalog_number: dl.catalog_number ?? '',
      lot_number: dl.lot_number ?? '',
      flow_dilution: dl.flow_dilution ?? '',
      icc_if_dilution: dl.icc_if_dilution ?? '',
      notes: dl.notes ?? '',
    })
    setShowModal(true)
  }

  const handleSubmit = () => {
    if (!form.name.trim() || !form.label_target.trim()) return
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

  const handleDelete = (dl: DyeLabel) => {
    if (!confirm('Delete "' + dl.name + '"? This cannot be undone.')) return
    deleteMutation.mutate(dl.id)
  }

  const setField = (field: keyof FormState, value: string | null) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  if (isLoading) return <p className="text-gray-500 dark:text-gray-400">Loading dyes & labels...</p>
  if (error) return <p className="text-red-600">Failed to load dyes & labels.</p>

  const inputClass = "w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm dark:text-gray-100 focus:border-blue-500 focus:outline-none"

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold dark:text-gray-100">Dyes & Labels</h1>
        <button
          onClick={openCreate}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          New Dye/Label
        </button>
      </div>

      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, target, category, fluorophore, vendor..."
          className={inputClass}
        />
      </div>

      {items.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400">
          {search ? 'No matching dyes or labels.' : 'No dyes or labels yet. Create one to get started.'}
        </p>
      ) : (
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400">
              <th className="py-2 font-medium">Name</th>
              <th className="py-2 font-medium">Label Target</th>
              <th className="py-2 font-medium">Category</th>
              <th className="py-2 font-medium">Fluorophore</th>
              <th className="py-2 font-medium">Vendor</th>
              <th className="w-16 py-2" />
            </tr>
          </thead>
          <tbody>
            {items.map((dl) => (
              <HoverActionsRow
                key={dl.id}
                as="tr"
                className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
                onClick={() => setExpandedId(expandedId === dl.id ? null : dl.id)}
                actions={{
                  onRename: () => openEdit(dl),
                  onDelete: () => handleDelete(dl),
                }}
              >
                <td className="py-2 font-medium text-gray-900 dark:text-gray-100">{dl.name}</td>
                <td className="py-2 text-gray-600 dark:text-gray-400">{dl.label_target}</td>
                <td className="py-2 text-gray-500 dark:text-gray-400">{dl.category ?? '—'}</td>
                <td className="py-2">
                  {dl.fluorophore_name ? (
                    <span className="text-teal-700 dark:text-teal-400">{dl.fluorophore_name}</span>
                  ) : (
                    <span className="text-gray-400 dark:text-gray-500">—</span>
                  )}
                </td>
                <td className="py-2 text-gray-500 dark:text-gray-400">{dl.vendor ?? '—'}</td>
              </HoverActionsRow>
            ))}
          </tbody>
        </table>
      )}

      {expandedId && (() => {
        const dl = items.find((d) => d.id === expandedId)
        if (!dl) return null
        return <DyeLabelDetail dyeLabel={dl} onEdit={openEdit} />
      })()}

      <Modal
        isOpen={showModal}
        onClose={() => { setShowModal(false); setEditingId(null) }}
        title={editingId ? 'Edit Dye/Label' : 'New Dye/Label'}
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
              placeholder="e.g. MitoSOX Red, DAPI, CellTrace Violet"
              autoFocus
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Label Target <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.label_target}
              onChange={(e) => setField('label_target', e.target.value)}
              className={inputClass}
              placeholder="e.g. Nuclei, Viability, Mitochondrial Superoxide"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Category
            </label>
            <input
              type="text"
              value={form.category}
              onChange={(e) => setField('category', e.target.value)}
              className={inputClass}
              placeholder="e.g. viability, organelle, cell tracking, nucleic acid"
            />
          </div>
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
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Catalog #
              </label>
              <input
                type="text"
                value={form.catalog_number}
                onChange={(e) => setField('catalog_number', e.target.value)}
                className={inputClass}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Lot #
              </label>
              <input
                type="text"
                value={form.lot_number}
                onChange={(e) => setField('lot_number', e.target.value)}
                className={inputClass}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Flow Dilution
              </label>
              <input
                type="text"
                value={form.flow_dilution}
                onChange={(e) => setField('flow_dilution', e.target.value)}
                className={inputClass}
                placeholder="e.g. 1:200"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                ICC/IF Dilution
              </label>
              <input
                type="text"
                value={form.icc_if_dilution}
                onChange={(e) => setField('icc_if_dilution', e.target.value)}
                className={inputClass}
                placeholder="e.g. 1:500"
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
              disabled={!form.name.trim() || !form.label_target.trim()}
              className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {editingId ? 'Save' : 'Create'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function DyeLabelDetail({
  dyeLabel: dl,
  onEdit,
}: {
  dyeLabel: DyeLabel
  onEdit: (dl: DyeLabel) => void
}) {
  return (
    <div className="mt-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold dark:text-gray-100">{dl.name}</h3>
        <button
          onClick={() => onEdit(dl)}
          className="rounded border border-gray-300 dark:border-gray-600 px-3 py-1 text-xs text-gray-700 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700"
        >
          Edit
        </button>
      </div>
      <div className="grid grid-cols-3 gap-x-6 gap-y-2 text-xs">
        <DetailField label="Label Target" value={dl.label_target} />
        <DetailField label="Category" value={dl.category} />
        <DetailField label="Fluorophore" value={dl.fluorophore_name} />
        <DetailField label="Vendor" value={dl.vendor} />
        <DetailField label="Catalog #" value={dl.catalog_number} />
        <DetailField label="Lot #" value={dl.lot_number} />
        <DetailField label="Flow Dilution" value={dl.flow_dilution} />
        <DetailField label="ICC/IF Dilution" value={dl.icc_if_dilution} />
      </div>
      {dl.notes && (
        <div className="mt-2">
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Notes:</span>
          <p className="mt-0.5 text-xs text-gray-700 dark:text-gray-300">{dl.notes}</p>
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
