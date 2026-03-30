import { useState, useEffect } from 'react'
import { getPreferences, updatePreference } from '@/api/preferences'
import {
  useConjugateChemistries,
  useCreateConjugateChemistry,
  useUpdateConjugateChemistry,
  useDeleteConjugateChemistry,
} from '@/hooks/useConjugateChemistries'
import type { ConjugateChemistry } from '@/types'

export default function Settings() {
  const [minEx, setMinEx] = useState(5)
  const [minDet, setMinDet] = useState(10)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    getPreferences()
      .then((prefs) => {
        if (prefs.min_excitation_pct) setMinEx(Number(prefs.min_excitation_pct))
        if (prefs.min_detection_pct) setMinDet(Number(prefs.min_detection_pct))
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setMessage('')
    try {
      await updatePreference('min_excitation_pct', String(minEx))
      await updatePreference('min_detection_pct', String(minDet))
      setMessage('Settings saved successfully.')
      setTimeout(() => setMessage(''), 3000)
    } catch (e) {
      console.error(e)
      setMessage('Failed to save settings.')
    } finally {
      setSaving(false)
    }
  }

  // Conjugate chemistry management
  const { data: chemistries = [], isLoading: chemLoading } = useConjugateChemistries()
  const createMut = useCreateConjugateChemistry()
  const updateMut = useUpdateConjugateChemistry()
  const deleteMut = useDeleteConjugateChemistry()

  const [newName, setNewName] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editLabel, setEditLabel] = useState('')
  const [chemMessage, setChemMessage] = useState('')

  const handleAddChemistry = () => {
    const name = newName.trim().toLowerCase()
    const label = newLabel.trim()
    if (!name || !label) return
    createMut.mutate(
      { name, label },
      {
        onSuccess: () => {
          setNewName('')
          setNewLabel('')
          setChemMessage('Added: ' + name)
          setTimeout(() => setChemMessage(''), 3000)
        },
        onError: (err) => {
          setChemMessage(err.message)
          setTimeout(() => setChemMessage(''), 5000)
        },
      },
    )
  }

  const openEdit = (chem: ConjugateChemistry) => {
    setEditingId(chem.id)
    setEditName(chem.name)
    setEditLabel(chem.label)
  }

  const handleSaveEdit = () => {
    if (!editingId) return
    const name = editName.trim().toLowerCase()
    const label = editLabel.trim()
    if (!name || !label) return
    updateMut.mutate(
      { id: editingId, data: { name, label } },
      {
        onSuccess: () => {
          setEditingId(null)
          setChemMessage('Updated successfully')
          setTimeout(() => setChemMessage(''), 3000)
        },
        onError: (err) => {
          setChemMessage(err.message)
          setTimeout(() => setChemMessage(''), 5000)
        },
      },
    )
  }

  const handleDeleteChemistry = (id: string, name: string) => {
    if (!confirm(`Remove "${name}" from conjugate chemistries?`)) return
    deleteMut.mutate(id, {
      onSuccess: () => {
        setChemMessage(`Removed "${name}"`)
        setTimeout(() => setChemMessage(''), 3000)
      },
    })
  }

  if (loading) {
    return <div className="p-4 py-8 text-center text-gray-500">Loading settings...</div>
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="mb-6 text-2xl font-bold text-gray-900 dark:text-white">Settings</h1>

      {/* Fluorophore Thresholds */}
      <div className="space-y-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div>
          <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">
            Fluorophore Visibility Thresholds
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Lower values show more fluorophores per channel. Higher values show only well-matched
            fluorophores.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Minimum Excitation Efficiency ({minEx}%)
          </label>
          <input
            type="range"
            min="1"
            max="50"
            value={minEx}
            onChange={(e) => setMinEx(Number(e.target.value))}
            className="mt-2 w-full cursor-pointer accent-blue-600 dark:accent-blue-400"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Minimum Detection Efficiency ({minDet}%)
          </label>
          <input
            type="range"
            min="1"
            max="50"
            value={minDet}
            onChange={(e) => setMinDet(Number(e.target.value))}
            className="mt-2 w-full cursor-pointer accent-blue-600 dark:accent-blue-400"
          />
        </div>

        <div className="flex items-center space-x-4 pt-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
          {message && (
            <span
              className={`text-sm ${
                message.includes('Failed')
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-green-600 dark:text-green-400'
              }`}
            >
              {message}
            </span>
          )}
        </div>
      </div>

      {/* Conjugate Chemistries */}
      <div className="mt-6 space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div>
          <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">
            Conjugate Chemistries
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Define non-fluorescent conjugation types (e.g. Biotin, DIG) and their binding partner labels.
            These are used by the panel designer to recognize when a primary antibody needs a
            conjugate-targeting secondary reagent (e.g. Streptavidin for Biotin).
          </p>
        </div>

        {/* Add new chemistry */}
        <div className="flex gap-2 items-end border-b border-gray-100 dark:border-gray-700 pb-4">
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              Conjugate Name
            </label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddChemistry()
              }}
              placeholder="e.g. dnp"
              className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1.5 text-sm dark:text-gray-100 focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div className="flex-[2]">
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              Binding Partner Label
            </label>
            <input
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddChemistry()
              }}
              placeholder="e.g. Anti-DNP"
              className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1.5 text-sm dark:text-gray-100 focus:border-blue-500 focus:outline-none"
            />
          </div>
          <button
            onClick={handleAddChemistry}
            disabled={!newName.trim() || !newLabel.trim() || createMut.isPending}
            className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Add
          </button>
        </div>

        {/* Chemistry list */}
        {chemLoading ? (
          <div className="py-4 text-center text-sm text-gray-400">Loading...</div>
        ) : chemistries.length === 0 ? (
          <div className="py-4 text-center text-sm text-gray-400 dark:text-gray-500">
            No conjugate chemistries defined.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                <th className="py-2">Conjugate</th>
                <th className="py-2">Binding Partner Label</th>
                <th className="py-2 w-28 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {chemistries.map((chem) => (
                <tr
                  key={chem.id}
                  className="border-b border-gray-50 dark:border-gray-700 group"
                >
                  {editingId === chem.id ? (
                    <>
                      <td className="py-2 pr-2">
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveEdit()
                            if (e.key === 'Escape') setEditingId(null)
                          }}
                          className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1 text-sm dark:text-gray-100 focus:border-blue-500 focus:outline-none"
                          autoFocus
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          type="text"
                          value={editLabel}
                          onChange={(e) => setEditLabel(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveEdit()
                            if (e.key === 'Escape') setEditingId(null)
                          }}
                          className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1 text-sm dark:text-gray-100 focus:border-blue-500 focus:outline-none"
                        />
                      </td>
                      <td className="py-2 text-right">
                        <button
                          onClick={handleSaveEdit}
                          disabled={!editName.trim() || !editLabel.trim()}
                          className="text-xs text-green-600 hover:text-green-700 mr-2 disabled:opacity-50"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="text-xs text-gray-400 hover:text-gray-600"
                        >
                          Cancel
                        </button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="py-2 text-gray-800 dark:text-gray-200 font-medium">
                        {chem.name}
                      </td>
                      <td className="py-2 text-gray-600 dark:text-gray-400">
                        {chem.label}
                      </td>
                      <td className="py-2 text-right">
                        <button
                          onClick={() => openEdit(chem)}
                          className="invisible text-xs text-gray-400 hover:text-blue-600 group-hover:visible mr-2"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteChemistry(chem.id, chem.name)}
                          className="invisible text-xs text-gray-400 hover:text-red-600 group-hover:visible"
                        >
                          Delete
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {chemMessage && (
          <p
            className={`text-sm ${
              chemMessage.includes('Removed') || chemMessage.includes('Updated') || chemMessage.includes('Added')
                ? 'text-green-600 dark:text-green-400'
                : 'text-red-600 dark:text-red-400'
            }`}
          >
            {chemMessage}
          </p>
        )}
      </div>
    </div>
  )
}
