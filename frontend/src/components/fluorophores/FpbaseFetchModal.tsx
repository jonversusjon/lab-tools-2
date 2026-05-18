import { useState, useMemo, useRef, useEffect } from 'react'
import { useFpbaseCatalog, useBatchFetchFpbase, useFluorophores } from '@/hooks/useFluorophores'
import type { BatchFetchFpbaseResult } from '@/types'

interface FpbaseFetchModalProps {
  onClose: () => void
  /**
   * If provided, the modal opens with this fluorophore pre-selected for
   * fetch. Looked up against the local fluorophore list to resolve the
   * FPbase name to pre-select.
   */
  prefillFluorophoreId?: string
}

function fuzzyMatch(query: string, name: string): boolean {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean)
  const lower = name.toLowerCase()
  return tokens.every((token) => lower.includes(token))
}

type ModalState = 'browse' | 'fetching' | 'done'

export default function FpbaseFetchModal({ onClose, prefillFluorophoreId }: FpbaseFetchModalProps) {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [modalState, setModalState] = useState<ModalState>('browse')
  const [result, setResult] = useState<BatchFetchFpbaseResult | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const prefillApplied = useRef(false)

  const catalogQuery = useFpbaseCatalog()
  const fluorophoresQuery = useFluorophores({ skip: 0, limit: 5000 })
  const batchMutation = useBatchFetchFpbase()

  const importedNames = useMemo(() => {
    if (!fluorophoresQuery.data) return new Set<string>()
    return new Set(fluorophoresQuery.data.items.map((f) => f.name))
  }, [fluorophoresQuery.data])

  useEffect(() => {
    if (prefillApplied.current) return
    if (!prefillFluorophoreId) return
    const item = fluorophoresQuery.data?.items.find((f) => f.id === prefillFluorophoreId)
    if (!item) return
    setSelected((prev) => (prev.includes(item.name) ? prev : [...prev, item.name]))
    setSearch(item.name)
    prefillApplied.current = true
  }, [prefillFluorophoreId, fluorophoresQuery.data])

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
      <div className="w-[480px] rounded-lg bg-elevated shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-lg font-bold text-foreground">Fetch from FPbase</h2>
          <button onClick={onClose} className="text-foreground-subtle hover:text-foreground-muted">&times;</button>
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
                className="mb-3 w-full rounded border border-border-strong bg-elevated text-foreground px-3 py-2 text-sm"
                autoFocus
              />

              {selected.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-1">
                  {selected.map((name) => (
                    <span
                      key={name}
                      className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-xs text-accent-soft-foreground"
                    >
                      {name}
                      <button
                        onClick={() => removeChip(name)}
                        className="ml-0.5 text-accent hover:opacity-80"
                      >
                        &times;
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <div className="max-h-60 overflow-y-auto rounded border border-border">
                {catalogQuery.isLoading && (
                  <p className="px-3 py-6 text-center text-sm text-foreground-subtle">Loading catalog...</p>
                )}
                {catalogQuery.isError && (
                  <p className="px-3 py-6 text-center text-sm text-danger">
                    Failed to load catalog. Check your connection.
                  </p>
                )}
                {catalogQuery.data && filtered.length === 0 && (
                  <p className="px-3 py-4 text-center text-sm text-foreground-subtle">No matches</p>
                )}
                {filtered.map((item) => {
                  const isSelected = selected.includes(item.name)
                  const isImported = importedNames.has(item.name)
                  return (
                    <button
                      key={item.id}
                      onClick={() => toggleSelect(item.name)}
                      className={
                        'flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-accent-soft' +
                        (isSelected ? ' bg-accent-soft font-medium' : '')
                      }
                    >
                      <span className="flex items-center gap-2">
                        <span
                          className={
                            'inline-flex h-4 w-4 items-center justify-center rounded border text-xs' +
                            (isSelected
                              ? ' border-accent bg-accent text-accent-foreground'
                              : ' border-border')
                          }
                        >
                          {isSelected && '\u2713'}
                        </span>
                        {item.name}
                      </span>
                      {isImported && (
                        <span className="text-xs text-success" title="Already imported">
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
              <p className="mb-2 text-sm font-medium text-foreground">Fetching fluorophores...</p>
              <p className="text-xs text-foreground-subtle">
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
                  <p className="mb-1 text-sm font-medium text-success">
                    Successfully imported ({result.fetched.length}):
                  </p>
                  <ul className="ml-4 list-disc text-sm text-foreground-muted">
                    {result.fetched.map((f) => (
                      <li key={f.id}>{f.name}</li>
                    ))}
                  </ul>
                </div>
              )}
              {result.errors.length > 0 && (
                <div>
                  <p className="mb-1 text-sm font-medium text-danger">
                    Failed ({result.errors.length}):
                  </p>
                  <ul className="ml-4 list-disc text-sm text-danger">
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

        <div className="flex justify-end gap-2 border-t border-border px-6 py-3">
          {modalState === 'browse' && (
            <>
              <button
                onClick={onClose}
                className="rounded border border-border-strong px-4 py-2 text-sm text-foreground-muted hover:bg-hover"
              >
                Cancel
              </button>
              <button
                onClick={handleFetch}
                disabled={selected.length === 0}
                className="rounded bg-accent hover:bg-accent-hover text-accent-foreground px-4 py-2 text-sm font-medium disabled:opacity-50"
              >
                Fetch {selected.length > 0 ? `(${selected.length})` : ''}
              </button>
            </>
          )}
          {modalState === 'fetching' && (
            <button disabled className="rounded bg-border-strong px-4 py-2 text-sm text-white opacity-60"> {/* theme-exempt: fetching disabled state */}
              Fetching...
            </button>
          )}
          {modalState === 'done' && (
            <button
              onClick={onClose}
              className="rounded bg-accent hover:bg-accent-hover text-accent-foreground px-4 py-2 text-sm font-medium"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
