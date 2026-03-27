import { useState } from 'react'
import { useFetchFromFpbase } from '@/hooks/useFluorophores'

interface FpbaseFetchModalProps {
  onClose: () => void
}

export default function FpbaseFetchModal({ onClose }: FpbaseFetchModalProps) {
  const [name, setName] = useState('')
  const mutation = useFetchFromFpbase()

  const handleFetch = async () => {
    if (!name.trim()) return
    try {
      await mutation.mutateAsync(name.trim())
      onClose()
    } catch {
      // error displayed via mutation.error
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-96 rounded-lg bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-bold">Fetch from FPbase</h2>

        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleFetch()
          }}
          placeholder="Fluorophore name (e.g. AF488)"
          className="mb-3 w-full rounded border border-gray-300 px-3 py-2 text-sm"
          autoFocus
        />

        {mutation.error && (
          <p className="mb-3 text-sm text-red-600">
            {mutation.error instanceof Error
              ? mutation.error.message
              : 'An error occurred'}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleFetch}
            disabled={mutation.isPending || !name.trim()}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {mutation.isPending ? 'Fetching...' : 'Fetch'}
          </button>
        </div>
      </div>
    </div>
  )
}
