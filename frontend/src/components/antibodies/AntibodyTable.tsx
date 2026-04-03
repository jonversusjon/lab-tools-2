import { useMemo, useState } from 'react'
import {
  useAntibodies,
  useDeleteAntibody,
  useToggleAntibodyFavorite,
} from '@/hooks/useAntibodies'
import { useFluorophores } from '@/hooks/useFluorophores'
import { useTags } from '@/hooks/useTags'
import AntibodyForm from './AntibodyForm'
import ImportWizard from './ImportWizard'
import FavoriteButton from './FavoriteButton'
import TagBadge from './TagBadge'
import TagManager from './TagManager'
import type { Antibody } from '@/types'
import HoverActionsRow from '@/components/layout/HoverActionsRow'

type SortField = 'target' | 'host' | 'vendor' | 'conjugate'
type SortDir = 'asc' | 'desc'

export default function AntibodyTable() {
  const [search, setSearch] = useState('')
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false)
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])
  const [hostFilter, setHostFilter] = useState('')
  const [vendorFilter, setVendorFilter] = useState('')
  const [inStockFilter, setInStockFilter] = useState<boolean | null>(null)

  const { data, isLoading, error } = useAntibodies({
    skip: 0,
    limit: 500,
    search: search || undefined,
    favorites: showFavoritesOnly || undefined,
    tags: selectedTagIds.length > 0 ? selectedTagIds.join(',') : undefined,
    host: hostFilter || undefined,
    vendor: vendorFilter || undefined,
    in_stock: inStockFilter ?? undefined,
  })
  // Unfiltered fetch for dropdown options — TanStack Query dedupes when no filters are active
  const { data: unfilteredData } = useAntibodies({ skip: 0, limit: 500 })
  const allItemsForDropdowns = unfilteredData?.items ?? []

  const { data: fluorophoreData } = useFluorophores({ skip: 0, limit: 2000 })
  const { data: allTags } = useTags()
  const deleteMutation = useDeleteAntibody()
  const favoriteMutation = useToggleAntibodyFavorite()

  const [sortField, setSortField] = useState<SortField>('target')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [editingAntibody, setEditingAntibody] = useState<Antibody | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [tagManagerId, setTagManagerId] = useState<string | null>(null)

  const items = data?.items ?? []
  const fluorophores = fluorophoreData?.items ?? []
  const tags = allTags ?? []

  // Unique values for filter dropdowns — derived from unfiltered data
  const uniqueHosts = useMemo(() => {
    const hosts = new Set<string>()
    allItemsForDropdowns.forEach((ab) => ab.host && hosts.add(ab.host))
    return Array.from(hosts).sort()
  }, [allItemsForDropdowns])

  const uniqueVendors = useMemo(() => {
    const vendors = new Set<string>()
    allItemsForDropdowns.forEach((ab) => ab.vendor && vendors.add(ab.vendor))
    return Array.from(vendors).sort()
  }, [allItemsForDropdowns])

  const sorted = useMemo(() => {
    const copy = [...items]
    copy.sort((a, b) => {
      const aVal = (a[sortField] ?? '').toLowerCase()
      const bVal = (b[sortField] ?? '').toLowerCase()
      return sortDir === 'asc'
        ? aVal.localeCompare(bVal)
        : bVal.localeCompare(aVal)
    })
    return copy
  }, [items, sortField, sortDir])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  const sortIndicator = (field: SortField) =>
    sortField === field ? (sortDir === 'asc' ? ' \u25B2' : ' \u25BC') : ''

  const handleDelete = (ab: Antibody) => {
    if (
      !confirm(
        'Deleting this antibody will also remove it from any panels where it is a target or has assignments. Continue?'
      )
    )
      return
    deleteMutation.mutate(ab.id)
  }

  const toggleTagFilter = (tagId: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold dark:text-gray-100">Antibodies</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowImport(true)}
            className="rounded border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Import CSV
          </button>
          <button
            onClick={() => setShowNew(true)}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            New Antibody
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4 space-y-2">
        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder="Search by target, name, catalog #, vendor..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm dark:text-gray-100 focus:border-blue-500 focus:outline-none"
          />
          <button
            onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
            className={`rounded border px-3 py-2 text-sm ${
              showFavoritesOnly
                ? 'border-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300'
                : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            &#9733; Favorites
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={hostFilter}
            onChange={(e) => setHostFilter(e.target.value)}
            className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1 text-xs dark:text-gray-100"
          >
            <option value="">All hosts</option>
            {uniqueHosts.map((h) => (
              <option key={h} value={h}>{h}</option>
            ))}
          </select>

          <select
            value={vendorFilter}
            onChange={(e) => setVendorFilter(e.target.value)}
            className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1 text-xs dark:text-gray-100"
          >
            <option value="">All vendors</option>
            {uniqueVendors.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>

          <select
            value={inStockFilter === null ? '' : String(inStockFilter)}
            onChange={(e) =>
              setInStockFilter(
                e.target.value === '' ? null : e.target.value === 'true'
              )
            }
            className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1 text-xs dark:text-gray-100"
          >
            <option value="">In stock: Any</option>
            <option value="true">In stock</option>
            <option value="false">Not in stock</option>
          </select>

          {/* Tag filters */}
          {tags.map((tag) => (
            <button
              key={tag.id}
              onClick={() => toggleTagFilter(tag.id)}
              className={`rounded-full px-2 py-0.5 text-xs font-medium transition-all ${
                selectedTagIds.includes(tag.id)
                  ? 'ring-2 ring-offset-1 dark:ring-offset-gray-900'
                  : 'opacity-60 hover:opacity-100'
              }`}
              style={{
                backgroundColor: tag.color ? tag.color + '20' : '#6b728020',
                color: tag.color ?? '#6b7280',
                borderColor: tag.color ?? '#6b7280',
                ...(selectedTagIds.includes(tag.id) ? { ringColor: tag.color ?? '#6b7280' } : {}),
              }}
            >
              {tag.name}
            </button>
          ))}

          {(hostFilter || vendorFilter || inStockFilter !== null || selectedTagIds.length > 0) && (
            <button
              onClick={() => {
                setHostFilter('')
                setVendorFilter('')
                setInStockFilter(null)
                setSelectedTagIds([])
              }}
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400">
            <th className="w-8 py-2" />
            <th
              className="cursor-pointer py-2 font-medium hover:text-gray-800 dark:hover:text-gray-200"
              onClick={() => handleSort('target')}
            >
              Target{sortIndicator('target')}
            </th>
            <th className="py-2 font-medium">Clone</th>
            <th
              className="cursor-pointer py-2 font-medium hover:text-gray-800 dark:hover:text-gray-200"
              onClick={() => handleSort('host')}
            >
              Host{sortIndicator('host')}
            </th>
            <th className="py-2 font-medium">Isotype</th>
            <th
              className="cursor-pointer py-2 font-medium hover:text-gray-800 dark:hover:text-gray-200"
              onClick={() => handleSort('conjugate')}
            >
              Conjugate{sortIndicator('conjugate')}
            </th>
            <th
              className="cursor-pointer py-2 font-medium hover:text-gray-800 dark:hover:text-gray-200"
              onClick={() => handleSort('vendor')}
            >
              Vendor{sortIndicator('vendor')}
            </th>
            <th className="py-2 font-medium">Catalog #</th>
            <th className="py-2 font-medium">Tags</th>
            <th className="w-16 py-2" />
          </tr>
        </thead>
        <tbody>
          {isLoading && !data ? (
            <tr>
              <td colSpan={10} className="py-6 text-center text-gray-400 dark:text-gray-500">
                Loading antibodies...
              </td>
            </tr>
          ) : error ? (
            <tr>
              <td colSpan={10} className="py-6 text-center text-red-600">
                Failed to load antibodies.
              </td>
            </tr>
          ) : sorted.length === 0 ? (
            <tr>
              <td
                colSpan={10}
                className="py-6 text-center text-gray-400 dark:text-gray-500"
              >
                {search || showFavoritesOnly || selectedTagIds.length > 0
                  ? 'No antibodies matching your filters.'
                  : 'No antibodies yet. Create one or import from CSV.'}
              </td>
            </tr>
          ) : null}
          {!(isLoading && !data) && !error && sorted.map((ab) => (
            <HoverActionsRow
              key={ab.id}
              as="tr"
              className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
              onClick={() =>
                setExpandedId(expandedId === ab.id ? null : ab.id)
              }
              actions={{
                onRename: () => setEditingAntibody(ab),
                onDuplicate: undefined,
                onDelete: () => handleDelete(ab),
              }}
            >
              <td className="py-2">
                <FavoriteButton
                  isFavorite={ab.is_favorite}
                  onClick={() =>
                    favoriteMutation.mutate({
                      id: ab.id,
                      is_favorite: !ab.is_favorite,
                    })
                  }
                />
              </td>
              <td className="py-2 font-medium text-gray-900 dark:text-gray-100">
                {ab.target}
                {ab.name && ab.name !== ab.target && (
                  <span className="ml-1 text-xs text-gray-400 dark:text-gray-500">
                    ({ab.name})
                  </span>
                )}
              </td>
              <td className="py-2 text-gray-600 dark:text-gray-400">
                {ab.clone ?? ''}
              </td>
              <td className="py-2 text-gray-600 dark:text-gray-400">
                {ab.host ?? ''}
              </td>
              <td className="py-2 text-gray-600 dark:text-gray-400">
                {ab.isotype ?? ''}
              </td>
              <td className="py-2">
                {ab.conjugate ? (
                  <span className="inline-flex items-center gap-1">
                    <span className="inline-block h-2.5 w-2.5 rounded-full bg-teal-500" />
                    {ab.conjugate}
                  </span>
                ) : ab.fluorophore_name ? (
                  <span className="inline-flex items-center gap-1">
                    <span className="inline-block h-2.5 w-2.5 rounded-full bg-teal-500" />
                    {ab.fluorophore_name}
                  </span>
                ) : (
                  <span className="italic text-gray-400 dark:text-gray-500">
                    --
                  </span>
                )}
              </td>
              <td className="py-2 text-gray-600 dark:text-gray-400">
                {ab.vendor ?? ''}
              </td>
              <td className="py-2 text-gray-600 dark:text-gray-400">
                {ab.catalog_number ?? ''}
              </td>
              <td className="py-2">
                <div className="relative flex flex-wrap gap-1">
                  {ab.tags.map((tag) => (
                    <TagBadge key={tag.id} tag={tag} />
                  ))}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setTagManagerId(tagManagerId === ab.id ? null : ab.id)
                    }}
                    className="rounded-full border border-dashed border-gray-300 dark:border-gray-600 px-1.5 text-xs text-gray-400 hover:border-gray-400 hover:text-gray-500 dark:text-gray-500"
                  >
                    +
                  </button>
                  {tagManagerId === ab.id && (
                    <TagManager
                      antibodyId={ab.id}
                      currentTags={ab.tags}
                      onClose={() => setTagManagerId(null)}
                    />
                  )}
                </div>
              </td>
            </HoverActionsRow>
          ))}
        </tbody>
      </table>

      {/* Expanded detail */}
      {expandedId && (
        <AntibodyDetail
          antibody={sorted.find((ab) => ab.id === expandedId)!}
          onEdit={(ab) => setEditingAntibody(ab)}
        />
      )}

      {/* Modals */}
      {(showNew || editingAntibody) && (
        <AntibodyForm
          antibody={editingAntibody}
          fluorophores={fluorophores}
          onClose={() => {
            setShowNew(false)
            setEditingAntibody(null)
          }}
        />
      )}
      {showImport && <ImportWizard onClose={() => setShowImport(false)} />}
    </div>
  )
}

function AntibodyDetail({
  antibody: ab,
  onEdit,
}: {
  antibody: Antibody
  onEdit: (ab: Antibody) => void
}) {
  return (
    <div className="mt-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold dark:text-gray-100">
          {ab.target} Details
        </h3>
        <button
          onClick={() => onEdit(ab)}
          className="rounded border border-gray-300 dark:border-gray-600 px-3 py-1 text-xs text-gray-700 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700"
        >
          Edit
        </button>
      </div>
      <div className="grid grid-cols-3 gap-x-6 gap-y-2 text-xs">
        <Detail label="Full Name" value={ab.name} />
        <Detail label="Clone" value={ab.clone} />
        <Detail label="Host" value={ab.host} />
        <Detail label="Isotype" value={ab.isotype} />
        <Detail label="Conjugate" value={ab.conjugate} />
        <Detail label="Vendor" value={ab.vendor} />
        <Detail label="Catalog #" value={ab.catalog_number} />
        <Detail
          label="In Stock"
          value={ab.confirmed_in_stock ? 'Yes' : 'No'}
        />
        <Detail label="Storage" value={ab.storage_temp} />
        <Detail label="Flow Dilution" value={ab.flow_dilution} />
        <Detail label="ICC/IF Dilution" value={ab.icc_if_dilution} />
        <Detail label="WB Dilution" value={ab.wb_dilution} />
        <Detail
          label="Reacts With"
          value={ab.reacts_with?.join(', ') || null}
        />
        <Detail label="Date Received" value={ab.date_received} />
        <Detail label="Location" value={ab.physical_location} />
      </div>
      {ab.notes && (
        <div className="mt-2">
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
            Notes:
          </span>
          <p className="mt-0.5 text-xs text-gray-700 dark:text-gray-300">
            {ab.notes}
          </p>
        </div>
      )}
      {ab.validation_notes && (
        <div className="mt-1">
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
            Validation:
          </span>
          <p className="mt-0.5 text-xs text-gray-700 dark:text-gray-300">
            {ab.validation_notes}
          </p>
        </div>
      )}
      {ab.website && (
        <div className="mt-1">
          <a
            href={ab.website}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            Product page &rarr;
          </a>
        </div>
      )}
    </div>
  )
}

function Detail({
  label,
  value,
}: {
  label: string
  value: string | null | undefined
}) {
  return (
    <div>
      <span className="text-gray-500 dark:text-gray-400">{label}: </span>
      <span className="text-gray-800 dark:text-gray-200">
        {value || <span className="italic text-gray-400">--</span>}
      </span>
    </div>
  )
}
