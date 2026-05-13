import { useState } from 'react'
import Modal from '@/components/layout/Modal'
import AntibodyFormFields, {
  emptyAntibodyValues,
  type AntibodyFormValues,
} from '@/components/antibodies/AntibodyFormFields'
import { formatDilution } from '@/utils/dilutions'
import { useCreateAntibody, useUpdateAntibody } from '@/hooks/useAntibodies'
import type { Antibody, AntibodyCreate, Fluorophore } from '@/types'

interface AntibodyFormProps {
  antibody: Antibody | null
  fluorophores: Fluorophore[]
  onClose: () => void
}

function antibodyToValues(ab: Antibody | null): AntibodyFormValues {
  if (!ab) return emptyAntibodyValues()
  return {
    target: ab.target ?? '',
    name: ab.name ?? '',
    clone: ab.clone ?? '',
    host: ab.host ?? '',
    isotype: ab.isotype ?? '',
    fluorophore_id: ab.fluorophore_id ?? '',
    conjugate: ab.conjugate ?? '',
    vendor: ab.vendor ?? '',
    catalog_number: ab.catalog_number ?? '',
    flow_dilution_factor: ab.flow_dilution_factor ?? null,
    icc_if_dilution_factor: ab.icc_if_dilution_factor ?? null,
    wb_dilution_factor: ab.wb_dilution_factor ?? null,
    storage_temp: ab.storage_temp ?? '',
    confirmed_in_stock: ab.confirmed_in_stock ?? false,
    notes: ab.notes ?? '',
    website: ab.website ?? '',
    physical_location: ab.physical_location ?? '',
    is_favorite: ab.is_favorite ?? false,
    flow_dilution_raw: ab.flow_dilution ?? null,
    icc_if_dilution_raw: ab.icc_if_dilution ?? null,
    wb_dilution_raw: ab.wb_dilution ?? null,
  }
}

export default function AntibodyForm({ antibody, fluorophores, onClose }: AntibodyFormProps) {
  const isEdit = antibody !== null
  const [values, setValues] = useState<AntibodyFormValues>(() => antibodyToValues(antibody))
  const [validationError, setValidationError] = useState('')

  const createMutation = useCreateAntibody()
  const updateMutation = useUpdateAntibody()
  const submitError =
    (createMutation.error as Error | null)?.message ??
    (updateMutation.error as Error | null)?.message ??
    null
  const isSubmitting = createMutation.isPending || updateMutation.isPending

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!values.target.trim()) {
      setValidationError('Target is required.')
      return
    }
    setValidationError('')

    const payload: AntibodyCreate = {
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
    }

    if (isEdit && antibody) {
      updateMutation.mutate({ id: antibody.id, data: payload }, { onSuccess: onClose })
    } else {
      createMutation.mutate(payload, { onSuccess: onClose })
    }
  }

  return (
    <Modal isOpen onClose={onClose} title={isEdit ? 'Edit Antibody' : 'New Antibody'} wide>
      <form onSubmit={handleSubmit} className="space-y-4">
        <AntibodyFormFields
          values={values}
          onChange={(patch) => setValues((v) => ({ ...v, ...patch }))}
          fluorophores={fluorophores}
          validationError={validationError}
        />
        {submitError && (
          <div className="rounded border border-danger bg-danger-soft px-3 py-2 text-sm text-danger-soft-foreground">
            {submitError}
          </div>
        )}
        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-border-strong px-4 py-2 text-sm text-foreground-muted hover:bg-hover"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded bg-accent hover:bg-accent-hover text-accent-foreground px-4 py-2 text-sm font-medium disabled:opacity-60"
          >
            {isEdit ? 'Save' : 'Create'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
