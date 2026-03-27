import { useMemo, useState } from 'react'
import { useAntibodies, useDeleteAntibody } from '@/hooks/useAntibodies'
import { useFluorophores } from '@/hooks/useFluorophores'
import AntibodyForm from './AntibodyForm'
import type { Antibody } from '@/types'
import HoverActionsRow from '@/components/layout/HoverActionsRow'

type SortDir = 'asc' | 'desc'

export default function AntibodyTable() {
  const { data, isLoading, error } = useAntibodies(0, 500)
  const { data: fluorophoreData } = useFluorophores({ skip: 0, limit: 500 })
  const deleteMutation = useDeleteAntibody()

  const [search, setSearch] = useState('')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [editingAntibody, setEditingAntibody] = useState<Antibody | null>(null)
  const [showNew, setShowNew] = useState(false)

  const items = data?.items ?? []
  const fluorophores = fluorophoreData?.items ?? []

  const filtered = useMemo(() => {
    const term = search.toLowerCase()
    return items.filter((ab) => ab.target.toLowerCase().includes(term))
  }, [items, search])

  const sorted = useMemo(() => {
    const copy = [...filtered]
    copy.sort((a, b) =>
      sortDir === 'asc'
        ? a.target.localeCompare(b.target)
        : b.target.localeCompare(a.target)
    )
    return copy
  }, [filtered, sortDir])

  const handleDelete = (ab: Antibody) => {
    if (
      !confirm(
        'Deleting this antibody will also remove it from any panels where it is a target or has assignments. Continue?'
      )
    )
      return
    deleteMutation.mutate(ab.id)
  }

  if (isLoading) return <p className="text-gray-500 dark:text-gray-400">Loading antibodies...</p>
  if (error) return <p className="text-red-600">Failed to load antibodies.</p>

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold dark:text-gray-100">Antibodies</h1>
        <button
          onClick={() => setShowNew(true)}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          New Antibody
        </button>
      </div>

      <input
        type="text"
        placeholder="Search by target..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-4 w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm dark:text-gray-100 focus:border-blue-500 focus:outline-none"
      />

      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400">
            <th
              className="cursor-pointer py-2 font-medium hover:text-gray-800 dark:hover:text-gray-200"
              onClick={() => setSortDir(sortDir === 'asc' ? 'desc' : 'asc')}
            >
              Target{sortDir === 'asc' ? ' \u25B2' : ' \u25BC'}
            </th>
            <th className="py-2 font-medium">Clone</th>
            <th className="py-2 font-medium">Host</th>
            <th className="py-2 font-medium">Isotype</th>
            <th className="py-2 font-medium">Conjugate</th>
            <th className="py-2 font-medium">Vendor</th>
            <th className="py-2 font-medium">Catalog #</th>
            <th className="w-16 py-2" />
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 && (
            <tr>
              <td colSpan={8} className="py-6 text-center text-gray-400 dark:text-gray-500">
                {search ? 'No antibodies matching your search.' : 'No antibodies yet — create one to get started.'}
              </td>
            </tr>
          )}
          {sorted.map((ab) => (
            <HoverActionsRow
              key={ab.id}
              as="tr"
              className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
              onClick={() => setEditingAntibody(ab)}
              actions={{
                onRename: () => setEditingAntibody(ab),
                // TODO: wire onDuplicate after backend POST /{id}/duplicate endpoints are built
                onDuplicate: undefined,
                onDelete: () => handleDelete(ab),
              }}
            >
              <td className="py-2 font-medium text-gray-900 dark:text-gray-100">{ab.target}</td>
              <td className="py-2 text-gray-600 dark:text-gray-400">{ab.clone ?? ''}</td>
              <td className="py-2 text-gray-600 dark:text-gray-400">{ab.host ?? ''}</td>
              <td className="py-2 text-gray-600 dark:text-gray-400">{ab.isotype ?? ''}</td>
              <td className="py-2">
                {ab.fluorophore_name ? (
                  <span className="inline-flex items-center gap-1">
                    <span className="inline-block h-2.5 w-2.5 rounded-full bg-teal-500" />
                    {ab.fluorophore_name}
                  </span>
                ) : (
                  <span className="italic text-gray-400 dark:text-gray-500">Unconjugated</span>
                )}
              </td>
              <td className="py-2 text-gray-600 dark:text-gray-400">{ab.vendor ?? ''}</td>
              <td className="py-2 text-gray-600 dark:text-gray-400">{ab.catalog_number ?? ''}</td>
            </HoverActionsRow>
          ))}
        </tbody>
      </table>

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
    </div>
  )
}
