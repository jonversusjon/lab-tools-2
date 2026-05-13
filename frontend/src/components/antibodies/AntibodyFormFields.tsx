import ConjugateOmnibox from '@/components/antibodies/ConjugateOmnibox'
import DilutionInput from '@/components/antibodies/DilutionInput'
import ListEditor from '@/components/shared/ListEditor'
import type { Fluorophore } from '@/types'

export interface AntibodyFormValues {
  target: string
  name: string
  clone: string
  host: string
  isotype: string
  fluorophore_id: string
  conjugate: string
  vendor: string
  catalog_number: string
  flow_dilution_factor: number | null
  icc_if_dilution_factor: number | null
  wb_dilution_factor: number | null
  storage_temp: string
  confirmed_in_stock: boolean
  notes: string
  website: string
  physical_location: string
  is_favorite: boolean
  flow_dilution_raw?: string | null
  icc_if_dilution_raw?: string | null
  wb_dilution_raw?: string | null
}

export function emptyAntibodyValues(): AntibodyFormValues {
  return {
    target: '',
    name: '',
    clone: '',
    host: '',
    isotype: '',
    fluorophore_id: '',
    conjugate: '',
    vendor: '',
    catalog_number: '',
    flow_dilution_factor: null,
    icc_if_dilution_factor: null,
    wb_dilution_factor: null,
    storage_temp: '',
    confirmed_in_stock: false,
    notes: '',
    website: '',
    physical_location: '',
    is_favorite: false,
    flow_dilution_raw: null,
    icc_if_dilution_raw: null,
    wb_dilution_raw: null,
  }
}

interface Props {
  values: AntibodyFormValues
  onChange: (patch: Partial<AntibodyFormValues>) => void
  fluorophores: Fluorophore[]
  highlightFields?: Set<string>
  disabled?: boolean
  validationError?: string
  /** Prefix for input ids so multiple instances on one page don't collide. */
  idPrefix?: string
}

const inputClass =
  'w-full rounded border border-border bg-elevated text-foreground px-3 py-2 text-sm focus:border-blue-500 focus:outline-none disabled:opacity-60'

function highlightClass(field: string, highlight?: Set<string>): string {
  return highlight?.has(field)
    ? 'rounded ring-2 ring-warning ring-offset-1 dark:ring-offset-gray-800' // theme-exempt: ring-offset needs explicit dark bg color
    : ''
}

export default function AntibodyFormFields({
  values,
  onChange,
  fluorophores,
  highlightFields,
  disabled,
  validationError,
  idPrefix = 'ab',
}: Props) {
  const hl = highlightFields
  const targetId = idPrefix + '-target'
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className={highlightClass('target', hl)}>
          <label htmlFor={targetId} className="mb-1 block text-sm font-medium text-foreground-muted">
            Target <span className="text-danger">*</span>
          </label>
          <input
            id={targetId}
            type="text"
            value={values.target}
            disabled={disabled}
            onChange={(e) => onChange({ target: e.target.value })}
            className={inputClass}
          />
          {validationError && (
            <p className="mt-1 text-sm text-danger">{validationError}</p>
          )}
        </div>
        <div className={highlightClass('name', hl)}>
          <label className="mb-1 block text-sm font-medium text-foreground-muted">
            Display Name
          </label>
          <input
            type="text"
            value={values.name}
            disabled={disabled}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="e.g. TUJ1 chk Millipore"
            className={inputClass}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className={highlightClass('clone', hl)}>
          <label className="mb-1 block text-sm font-medium text-foreground-muted">Clone</label>
          <input
            type="text"
            value={values.clone}
            disabled={disabled}
            onChange={(e) => onChange({ clone: e.target.value })}
            className={inputClass}
          />
        </div>
        <div className={highlightClass('host', hl)}>
          <ListEditor
            listType="host"
            label="Host"
            value={values.host}
            onChange={(v) => onChange({ host: v })}
          />
        </div>
        <div className={highlightClass('isotype', hl)}>
          <ListEditor
            listType="isotype"
            label="Isotype"
            value={values.isotype}
            onChange={(v) => onChange({ isotype: v })}
          />
        </div>
      </div>

      <div
        className={
          hl?.has('fluorophore_id') || hl?.has('conjugate')
            ? 'rounded ring-2 ring-warning ring-offset-1 dark:ring-offset-gray-800' // theme-exempt: ring-offset needs explicit dark bg color
            : ''
        }
      >
        <label className="mb-1 block text-sm font-medium text-foreground-muted">
          Conjugate / Fluorophore
        </label>
        <ConjugateOmnibox
          fluorophores={fluorophores}
          currentFluorophoreId={values.fluorophore_id || null}
          currentConjugateText={values.conjugate || null}
          onSelect={(flId, displayName) => onChange({ fluorophore_id: flId, conjugate: displayName })}
          onClear={() => onChange({ fluorophore_id: '', conjugate: '' })}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className={highlightClass('vendor', hl)}>
          <label className="mb-1 block text-sm font-medium text-foreground-muted">Vendor</label>
          <input
            type="text"
            value={values.vendor}
            disabled={disabled}
            onChange={(e) => onChange({ vendor: e.target.value })}
            className={inputClass}
          />
        </div>
        <div className={highlightClass('catalog_number', hl)}>
          <label className="mb-1 block text-sm font-medium text-foreground-muted">Catalog #</label>
          <input
            type="text"
            value={values.catalog_number}
            disabled={disabled}
            onChange={(e) => onChange({ catalog_number: e.target.value })}
            className={inputClass}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className={highlightClass('flow_dilution_factor', hl)}>
          <DilutionInput
            label="Flow Dilution"
            value={values.flow_dilution_factor}
            rawText={values.flow_dilution_raw ?? null}
            onChange={(v) => onChange({ flow_dilution_factor: v })}
          />
        </div>
        <div className={highlightClass('icc_if_dilution_factor', hl)}>
          <DilutionInput
            label="ICC/IF Dilution"
            value={values.icc_if_dilution_factor}
            rawText={values.icc_if_dilution_raw ?? null}
            onChange={(v) => onChange({ icc_if_dilution_factor: v })}
          />
        </div>
        <div className={highlightClass('wb_dilution_factor', hl)}>
          <DilutionInput
            label="WB Dilution"
            value={values.wb_dilution_factor}
            rawText={values.wb_dilution_raw ?? null}
            onChange={(v) => onChange({ wb_dilution_factor: v })}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className={highlightClass('storage_temp', hl)}>
          <label className="mb-1 block text-sm font-medium text-foreground-muted">Storage Temp</label>
          <select
            value={values.storage_temp}
            disabled={disabled}
            onChange={(e) => onChange({ storage_temp: e.target.value })}
            className={inputClass}
          >
            <option value="">--</option>
            <option value="4C">4C</option>
            <option value="-20C">-20C</option>
          </select>
        </div>
        <div className={highlightClass('website', hl)}>
          <label className="mb-1 block text-sm font-medium text-foreground-muted">Website</label>
          <input
            type="url"
            value={values.website}
            disabled={disabled}
            onChange={(e) => onChange({ website: e.target.value })}
            className={inputClass}
          />
        </div>
        <div className={highlightClass('physical_location', hl)}>
          <label className="mb-1 block text-sm font-medium text-foreground-muted">Location</label>
          <input
            type="text"
            value={values.physical_location}
            disabled={disabled}
            onChange={(e) => onChange({ physical_location: e.target.value })}
            className={inputClass}
          />
        </div>
      </div>

      <div className="flex items-center gap-4">
        <label
          className={
            'flex items-center gap-2 text-sm text-foreground-muted ' +
            (hl?.has('confirmed_in_stock') ? 'px-1 ring-2 ring-warning rounded' : '')
          }
        >
          <input
            type="checkbox"
            checked={values.confirmed_in_stock}
            disabled={disabled}
            onChange={(e) => onChange({ confirmed_in_stock: e.target.checked })}
          />
          Confirmed in stock
        </label>
        <label
          className={
            'flex items-center gap-2 text-sm text-foreground-muted ' +
            (hl?.has('is_favorite') ? 'px-1 ring-2 ring-warning rounded' : '')
          }
        >
          <input
            type="checkbox"
            checked={values.is_favorite}
            disabled={disabled}
            onChange={(e) => onChange({ is_favorite: e.target.checked })}
          />
          Favorite
        </label>
      </div>

      <div className={highlightClass('notes', hl)}>
        <label className="mb-1 block text-sm font-medium text-foreground-muted">Notes</label>
        <textarea
          value={values.notes}
          disabled={disabled}
          onChange={(e) => onChange({ notes: e.target.value })}
          rows={2}
          className={inputClass}
        />
      </div>
    </div>
  )
}
