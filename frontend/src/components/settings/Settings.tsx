import { useState, useEffect } from 'react'
import { getPreferences, updatePreference } from '@/api/preferences'

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

  if (loading) {
    return <div className="p-4 py-8 text-center text-gray-500">Loading settings...</div>
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="mb-6 text-2xl font-bold text-gray-900 dark:text-white">Settings</h1>

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
    </div>
  )
}
