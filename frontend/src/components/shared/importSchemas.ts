import type { FieldDef, RawRecord } from '@/components/shared/GenericImportDiffModal'

export const SECONDARIES_SCHEMA: FieldDef[] = [
  { key: 'name', label: 'Name', type: 'text' },
  { key: 'host', label: 'Host', type: 'text' },
  { key: 'target_species', label: 'Target Species', type: 'text' },
  { key: 'target_isotype', label: 'Target Isotype', type: 'text' },
  {
    key: 'binding_mode',
    label: 'Binding Mode',
    type: 'select',
    options: [
      { value: 'species', label: 'Species' },
      { value: 'conjugate', label: 'Conjugate' },
    ],
  },
  { key: 'target_conjugate', label: 'Target Conjugate', type: 'text' },
  { key: 'fluorophore_id', label: 'Fluorophore', type: 'fluorophore' },
  { key: 'vendor', label: 'Vendor', type: 'text' },
  { key: 'catalog_number', label: 'Catalog #', type: 'text' },
  { key: 'lot_number', label: 'Lot #', type: 'text' },
  { key: 'notes', label: 'Notes', type: 'textarea' },
]

export const LIST_ENTRIES_SCHEMA: FieldDef[] = [
  { key: 'list_type', label: 'List Type', type: 'text' },
  { key: 'value', label: 'Value', type: 'text' },
  { key: 'sort_order', label: 'Sort Order', type: 'number' },
]

export const CHEMISTRIES_SCHEMA: FieldDef[] = [
  { key: 'name', label: 'Name (key)', type: 'text', placeholder: 'e.g. biotin' },
  { key: 'label', label: 'Binding Partner Label', type: 'text' },
  { key: 'sort_order', label: 'Sort Order', type: 'number' },
]

export function labelSecondary(r: RawRecord): string {
  const name = (r.name as string | null) || null
  const target = (r.target_species as string | null) || null
  if (name) return name
  return target || String(r.id ?? 'Unknown')
}

export function labelListEntry(r: RawRecord): string {
  const type = (r.list_type as string | null) || ''
  const value = (r.value as string | null) || ''
  return type && value ? type + ': ' + value : value || String(r.id ?? 'Unknown')
}

export function labelChemistry(r: RawRecord): string {
  const name = (r.name as string | null) || ''
  const label = (r.label as string | null) || ''
  return name && label ? name + ' (' + label + ')' : name || label || String(r.id ?? 'Unknown')
}

export const DYE_LABELS_SCHEMA: FieldDef[] = [
  { key: 'name', label: 'Name', type: 'text' },
  { key: 'label_target', label: 'Label Target', type: 'text' },
  { key: 'category', label: 'Category', type: 'text' },
  { key: 'fluorophore_id', label: 'Fluorophore', type: 'fluorophore' },
  { key: 'vendor', label: 'Vendor', type: 'text' },
  { key: 'catalog_number', label: 'Catalog #', type: 'text' },
  { key: 'lot_number', label: 'Lot #', type: 'text' },
  { key: 'flow_dilution', label: 'Flow Dilution', type: 'text' },
  { key: 'icc_if_dilution', label: 'ICC/IF Dilution', type: 'text' },
  { key: 'flow_dilution_factor', label: 'Flow Dilution Factor', type: 'number' },
  { key: 'icc_if_dilution_factor', label: 'ICC/IF Dilution Factor', type: 'number' },
  { key: 'notes', label: 'Notes', type: 'textarea' },
  { key: 'is_favorite', label: 'Favorite', type: 'checkbox' },
]

export const PLATE_MAPS_SCHEMA: FieldDef[] = [
  { key: 'name', label: 'Name', type: 'text' },
  { key: 'description', label: 'Description', type: 'textarea' },
  {
    key: 'plate_type',
    label: 'Plate Type',
    type: 'select',
    options: [
      { value: '96-well', label: '96-well' },
      { value: '384-well', label: '384-well' },
    ],
  },
  { key: 'well_data', label: 'Well Data (JSON)', type: 'textarea', rows: 3 },
  { key: 'legend', label: 'Legend (JSON)', type: 'textarea', rows: 3 },
]

export function labelDyeLabel(r: RawRecord): string {
  const name = (r.name as string | null) || ''
  const target = (r.label_target as string | null) || ''
  return name || target || String(r.id ?? 'Unknown')
}

export function labelPlateMap(r: RawRecord): string {
  return (r.name as string | null) || String(r.id ?? 'Unknown')
}

export function labelExperiment(r: RawRecord): string {
  return (r.name as string | null) || String(r.id ?? 'Unknown')
}
