import { useState } from 'react'
import Modal from '@/components/layout/Modal'
import ConjugateOmnibox from '@/components/antibodies/ConjugateOmnibox'
import DilutionInput from '@/components/antibodies/DilutionInput'
import ListEditor from '@/components/shared/ListEditor'
import { formatDilution } from '@/utils/dilutions'
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
  const [name, setName] = useState(antibody?.name ?? '')
  const [clone, setClone] = useState(antibody?.clone ?? '')
  const [host, setHost] = useState(antibody?.host ?? '')
  const [isotype, setIsotype] = useState(antibody?.isotype ?? '')
  const [fluorophoreId, setFluorophoreId] = useState(antibody?.fluorophore_id ?? '')
  const [conjugate, setConjugate] = useState(antibody?.conjugate ?? '')
  const [vendor, setVendor] = useState(antibody?.vendor ?? '')
  const [catalogNumber, setCatalogNumber] = useState(antibody?.catalog_number ?? '')
  const [flowDilutionFactor, setFlowDilutionFactor] = useState<number | null>(antibody?.flow_dilution_factor ?? null)
  const [iccIfDilutionFactor, setIccIfDilutionFactor] = useState<number | null>(antibody?.icc_if_dilution_factor ?? null)
  const [wbDilutionFactor, setWbDilutionFactor] = useState<number | null>(antibody?.wb_dilution_factor ?? null)
  const [storageTemp, setStorageTemp] = useState(antibody?.storage_temp ?? '')
  const [confirmedInStock, setConfirmedInStock] = useState(antibody?.confirmed_in_stock ?? false)
  const [notes, setNotes] = useState(antibody?.notes ?? '')
  const [website, setWebsite] = useState(antibody?.website ?? '')
  const [physicalLocation, setPhysicalLocation] = useState(antibody?.physical_location ?? '')
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
      name: name.trim() || null,
      clone: clone.trim() || null,
      host: host.trim() || null,
      isotype: isotype.trim() || null,
      fluorophore_id: fluorophoreId || null,
      conjugate: conjugate.trim() || null,
      vendor: vendor.trim() || null,
      catalog_number: catalogNumber.trim() || null,
      flow_dilution: formatDilution(flowDilutionFactor) || null,
      icc_if_dilution: formatDilution(iccIfDilutionFactor) || null,
      wb_dilution: formatDilution(wbDilutionFactor) || null,
      flow_dilution_factor: flowDilutionFactor,
      icc_if_dilution_factor: iccIfDilutionFactor,
      wb_dilution_factor: wbDilutionFactor,
      storage_temp: storageTemp || null,
      confirmed_in_stock: confirmedInStock,
      notes: notes.trim() || null,
      website: website.trim() || null,
      physical_location: physicalLocation.trim() || null,
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

  const inputClass =
    'w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm dark:text-gray-100 focus:border-blue-500 focus:outline-none'

  return (
    <Modal isOpen onClose={onClose} title={isEdit ? 'Edit Antibody' : 'New Antibody'} wide>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="ab-target" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Target <span className="text-red-500">*</span>
            </label>
            <input
              id="ab-target"
              type="text"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className={inputClass}
            />
            {validationError && (
              <p className="mt-1 text-sm text-red-600">{validationError}</p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Display Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. TUJ1 chk Millipore"
              className={inputClass}
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Clone</label>
            <input type="text" value={clone} onChange={(e) => setClone(e.target.value)} className={inputClass} />
          </div>
          <ListEditor
            listType="host"
            label="Host"
            value={host}
            onChange={setHost}
          />
          <ListEditor
            listType="isotype"
            label="Isotype"
            value={isotype}
            onChange={setIsotype}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Conjugate / Fluorophore
          </label>
          <ConjugateOmnibox
            fluorophores={fluorophores}
            currentFluorophoreId={fluorophoreId || null}
            currentConjugateText={conjugate || null}
            onSelect={(flId, displayName) => {
              setFluorophoreId(flId)
              setConjugate(displayName)
            }}
            onClear={() => {
              setFluorophoreId('')
              setConjugate('')
            }}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Vendor</label>
            <input type="text" value={vendor} onChange={(e) => setVendor(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Catalog #</label>
            <input type="text" value={catalogNumber} onChange={(e) => setCatalogNumber(e.target.value)} className={inputClass} />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <DilutionInput
            label="Flow Dilution"
            value={flowDilutionFactor}
            rawText={antibody?.flow_dilution ?? null}
            onChange={setFlowDilutionFactor}
          />
          <DilutionInput
            label="ICC/IF Dilution"
            value={iccIfDilutionFactor}
            rawText={antibody?.icc_if_dilution ?? null}
            onChange={setIccIfDilutionFactor}
          />
          <DilutionInput
            label="WB Dilution"
            value={wbDilutionFactor}
            rawText={antibody?.wb_dilution ?? null}
            onChange={setWbDilutionFactor}
          />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Storage Temp</label>
            <select value={storageTemp} onChange={(e) => setStorageTemp(e.target.value)} className={inputClass}>
              <option value="">--</option>
              <option value="4C">4C</option>
              <option value="-20C">-20C</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Website</label>
            <input type="url" value={website} onChange={(e) => setWebsite(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Location</label>
            <input type="text" value={physicalLocation} onChange={(e) => setPhysicalLocation(e.target.value)} className={inputClass} />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="ab-in-stock"
            checked={confirmedInStock}
            onChange={(e) => setConfirmedInStock(e.target.checked)}
          />
          <label htmlFor="ab-in-stock" className="text-sm text-gray-700 dark:text-gray-300">
            Confirmed in stock
          </label>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className={inputClass}
          />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
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
