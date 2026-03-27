import { useState, useMemo, useRef, useEffect } from 'react'
import { useFpbaseCatalog, useBatchFetchFpbase, useFluorophores } from '@/hooks/useFluorophores'
import type { BatchFetchFpbaseResult } from '@/types'

interface FpbaseFetchModalProps {
  onClose: () => void
}

function fuzzyMatch(query: string, name: string): boolean {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean)
  const lower = name.toLowerCase()
  return tokens.every((token) => lower.includes(token))
}

type ModalState = 'browse' | 'fetching' | 'done'

export default function FpbaseFetchModal({ onClose }: FpbaseFetchModalProps) {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [modalState, setModalState] = useState<ModalState>('browse')
  const [result, setResult] = useState<BatchFetchFpbaseResult | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const catalogQuery = useFpbaseCatalog()
  const fluorophoresQuery = useFluorophores(0, 500)
  const batchMutation = useBatchFetchFpbase()

  const importedNames = useMemo(() => {
    if (!fluorophoresQuery.data) return new Set<string>()
    return new Set(fluorophoresQuery.data.items.map((f) => f.name))
  }, [fluorophoresQuery.data])

  const filtered = useMemo(() => {
    if (!catalogQuery.data) return []
    const items = search.trim()
      ? catalogQuery.data.filter((item) => fuzzyMatch(search, item.name))
      : catalogQuery.data
    return items.slice(0, 20)
  }, [catalogQuery.data, search])

  useEffect(() => {
    if (modalState === 'browse') inputRef.current?.focus()
  }, [modalState])

  const toggleSelect = (name: string) => {
    setSelected((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    )
  }

  const removeChip = (name: string) => {
    setSelected((prev) => prev.filter((n) => n !== name))
  }

  const handleFetch = async () => {
    if (selected.length === 0) return
    setModalState('fetching')
    try {
      const res = await batchMutation.mutateAsync(selected)
      setResult(res)
      setModalState('done')
    } catch {
      setModalState('done')
      setResult({ fetched: [], errors: selected.map((n) => ({ name: n, detail: 'Request failed' })) })
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-[480px] rounded-lg bg-white dark:bg-gray-800 shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-6 py-4">
          <h2 className="text-lg font-bold dark:text-gray-100">Fetch from FPbase</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">&times;</button>
        </div>

        <div className="px-6 py-4">
          {modalState === 'browse' && (
            <>
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search FPbase fluorophores..."
                className="mb-3 w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm dark:text-gray-100"
                autoFocus
              />

              {selected.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-1">
                  {selected.map((name) => (
                    <span
                      key={name}
                      className="inline-flex items-center gap-1 rounded-full bg-blue-100 dark:bg-blue-900/50 px-2 py-0.5 text-xs text-blue-800 dark:text-blue-300"
                    >
                      {name}
                      <button
                        onClick={() => removeChip(name)}
                        className="ml-0.5 text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-200"
                      >
                        &times;
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <div className="max-h-60 overflow-y-auto rounded border border-gray-200 dark:border-gray-700">
                {catalogQuery.isLoading && (
                  <p className="px-3 py-6 text-center text-sm text-gray-400 dark:text-gray-500">Loading catalog...</p>
                )}
                {catalogQuery.isError && (
                  <p className="px-3 py-6 text-center text-sm text-red-500">
                    Failed to load catalog. Check your connection.
                  </p>
                )}
                {catalogQuery.data && filtered.length === 0 && (
                  <p className="px-3 py-4 text-center text-sm text-gray-400 dark:text-gray-500">No matches</p>
                )}
                {filtered.map((item) => {
                  const isSelected = selected.includes(item.name)
                  const isImported = importedNames.has(item.name)
                  return (
                    <button
                      key={item.id}
                      onClick={() => toggleSelect(item.name)}
                      className={
                        'flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-blue-50 dark:hover:bg-blue-900/30' +
                        (isSelected ? ' bg-blue-50 dark:bg-blue-900/30 font-medium' : '')
                      }
                    >
                      <span className="flex items-center gap-2">
                        <span
                          className={
                            'inline-flex h-4 w-4 items-center justify-center rounded border text-xs' +
                            (isSelected
                              ? ' border-blue-500 bg-blue-500 text-white'
                              : ' border-gray-300 dark:border-gray-600')
                          }
                        >
                          {isSelected && '\u2713'}
                        </span>
                        {item.name}
                      </span>
                      {isImported && (
                        <span className="text-xs text-green-600 dark:text-green-400" title="Already imported">
                          &#10003; imported
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </>
          )}

          {modalState === 'fetching' && (
            <div className="py-8 text-center">
              <p className="mb-2 text-sm font-medium dark:text-gray-100">Fetching fluorophores...</p>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                {batchMutation.isPending
                  ? `Importing ${selected.length} fluorophore${selected.length !== 1 ? 's' : ''}...`
                  : 'Preparing...'}
              </p>
            </div>
          )}

          {modalState === 'done' && result && (
            <div className="py-4">
              {result.fetched.length > 0 && (
                <div className="mb-3">
                  <p className="mb-1 text-sm font-medium text-green-700 dark:text-green-400">
                    Successfully imported ({result.fetched.length}):
                  </p>
                  <ul className="ml-4 list-disc text-sm text-gray-700 dark:text-gray-300">
                    {result.fetched.map((f) => (
                      <li key={f.id}>{f.name}</li>
                    ))}
                  </ul>
                </div>
              )}
              {result.errors.length > 0 && (
                <div>
                  <p className="mb-1 text-sm font-medium text-red-600 dark:text-red-400">
                    Failed ({result.errors.length}):
                  </p>
                  <ul className="ml-4 list-disc text-sm text-red-500 dark:text-red-400">
                    {result.errors.map((e) => (
                      <li key={e.name}>
                        {e.name}: {e.detail}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-200 dark:border-gray-700 px-6 py-3">
          {modalState === 'browse' && (
            <>
              <button
                onClick={onClose}
                className="rounded border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={handleFetch}
                disabled={selected.length === 0}
                className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                Fetch {selected.length > 0 ? `(${selected.length})` : ''}
              </button>
            </>
          )}
          {modalState === 'fetching' && (
            <button disabled className="rounded bg-gray-400 px-4 py-2 text-sm text-white">
              Fetching...
            </button>
          )}
          {modalState === 'done' && (
            <button
              onClick={onClose}
              className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
