import { useState } from 'react'
import Modal from '@/components/layout/Modal'
import { useCreateAntibody, useUpdateAntibody } from '@/hooks/useAntibodies'
import type { Antibody, AntibodyCreate, Fluorophore } from '@/types'

interface AntibodyFormProps {
  antibody: Antibody | null
  fluorophores: Fluorophore[]
  onClose: () => void
}

export default function AntibodyForm({
  antibody,
  fluorophores,
  onClose,
}: AntibodyFormProps) {
  const isEdit = antibody !== null

  const [target, setTarget] = useState(antibody?.target ?? '')
  const [clone, setClone] = useState(antibody?.clone ?? '')
  const [host, setHost] = useState(antibody?.host ?? '')
  const [isotype, setIsotype] = useState(antibody?.isotype ?? '')
  const [fluorophoreId, setFluorophoreId] = useState(antibody?.fluorophore_id ?? '')
  const [vendor, setVendor] = useState(antibody?.vendor ?? '')
  const [catalogNumber, setCatalogNumber] = useState(antibody?.catalog_number ?? '')
  const [validationError, setValidationError] = useState('')

  const createMutation = useCreateAntibody()
  const updateMutation = useUpdateAntibody()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!target.trim()) {
      setValidationError('Target is required.')
      return
    }
    setValidationError('')

    const payload: AntibodyCreate = {
      target: target.trim(),
      clone: clone.trim() || null,
      host: host.trim() || null,
      isotype: isotype.trim() || null,
      fluorophore_id: fluorophoreId || null,
      vendor: vendor.trim() || null,
      catalog_number: catalogNumber.trim() || null,
    }

    if (isEdit) {
      updateMutation.mutate(
        { id: antibody.id, data: payload },
        { onSuccess: onClose }
      )
    } else {
      createMutation.mutate(payload, { onSuccess: onClose })
    }
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={isEdit ? 'Edit Antibody' : 'New Antibody'}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="ab-target" className="mb-1 block text-sm font-medium text-gray-700">
            Target <span className="text-red-500">*</span>
          </label>
          <input
            id="ab-target"
            type="text"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
          {validationError && (
            <p className="mt-1 text-sm text-red-600">{validationError}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Clone</label>
            <input
              type="text"
              value={clone}
              onChange={(e) => setClone(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Host</label>
            <input
              type="text"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Isotype</label>
          <input
            type="text"
            value={isotype}
            onChange={(e) => setIsotype(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Conjugate</label>
          <select
            value={fluorophoreId}
            onChange={(e) => setFluorophoreId(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          >
            <option value="">— None (Unconjugated) —</option>
            {fluorophores.map((fl) => (
              <option key={fl.id} value={fl.id}>
                {fl.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-500">
            Leave empty for unconjugated antibodies. Set for pre-conjugated antibodies (e.g., anti-CD3-FITC).
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Vendor</label>
            <input
              type="text"
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Catalog #</label>
            <input
              type="text"
              value={catalogNumber}
              onChange={(e) => setCatalogNumber(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            {isEdit ? 'Save' : 'Create'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
