import { useState } from 'react'
import Modal from '@/components/layout/Modal'
import { usePanels } from '@/hooks/usePanels'
import { useIFPanels } from '@/hooks/useIFPanels'
import { useInstruments } from '@/hooks/useInstruments'
import { useMicroscopes } from '@/hooks/useMicroscopes'
import type { Instrument, Microscope } from '@/types'

interface PanelTemplatePickerProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (panelId: string, panelType: 'flow' | 'if') => void
  filterType?: 'flow' | 'if'
}

function buildNameMap(items: { id: string; name: string }[]): Map<string, string> {
  const m = new Map<string, string>()
  for (const item of items) {
    m.set(item.id, item.name)
  }
  return m
}

export default function PanelTemplatePicker({
  isOpen,
  onClose,
  onSelect,
  filterType,
}: PanelTemplatePickerProps) {
  const [search, setSearch] = useState('')

  const { data: flowData } = usePanels(0, 500)
  const { data: ifData } = useIFPanels(0, 500)
  const { data: instrumentData } = useInstruments(0, 500)
  const { data: microscopeData } = useMicroscopes(0, 500)

  const instrumentNames = buildNameMap(
    (instrumentData?.items ?? []) as Instrument[]
  )
  const microscopeNames = buildNameMap(
    (microscopeData?.items ?? []) as Microscope[]
  )

  const q = search.toLowerCase()

  const flowTemplates = (flowData?.items ?? []).filter(
    (p) => !q || p.name.toLowerCase().includes(q)
  )
  const ifTemplates = (ifData?.items ?? []).filter(
    (p) => !q || p.name.toLowerCase().includes(q)
  )

  const showFlow = !filterType || filterType === 'flow'
  const showIF = !filterType || filterType === 'if'

  const handleSelect = (panelId: string, panelType: 'flow' | 'if') => {
    onSelect(panelId, panelType)
    onClose()
    setSearch('')
  }

  const isEmpty =
    (showFlow ? flowTemplates.length === 0 : true) &&
    (showIF ? ifTemplates.length === 0 : true) &&
    !search

  return (
    <Modal isOpen={isOpen} onClose={() => { onClose(); setSearch('') }} title="Add Panel" wide>
      <div className="space-y-4">
        <input
          type="text"
          placeholder="Search templates..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          autoFocus
        />

        {isEmpty && !search && (
          <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">
            No panel templates found. Create one in Panel Templates first.
          </p>
        )}

        {showFlow && (
          <div>
            <div className="text-xs font-semibold uppercase text-gray-400 dark:text-gray-500 mb-2">
              Flow Panel Templates
            </div>

            {/* Blank flow panel */}
            <button
              onClick={() => handleSelect('blank', 'flow')}
              className="w-full px-3 py-2.5 flex items-center justify-between rounded hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer text-left"
            >
              <div className="flex items-center gap-2">
                <span className="text-base">📋</span>
                <span className="text-sm text-gray-700 dark:text-gray-300">Blank Flow Panel</span>
              </div>
              <span className="text-xs text-gray-400 dark:text-gray-500 italic">empty</span>
            </button>

            {flowTemplates.length === 0 && search ? (
              <p className="text-sm text-gray-400 dark:text-gray-500 px-3 py-2">
                No flow panel templates found
              </p>
            ) : (
              flowTemplates.map((p) => {
                const instrName = p.instrument_id
                  ? (instrumentNames.get(p.instrument_id) ?? 'Unknown instrument')
                  : 'No instrument'
                return (
                  <button
                    key={p.id}
                    onClick={() => handleSelect(p.id, 'flow')}
                    className="w-full px-3 py-2.5 flex items-center justify-between rounded hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer text-left"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-900 dark:text-gray-100">{p.name}</span>
                      <span className="inline-flex items-center rounded-full bg-gray-100 dark:bg-gray-700 px-2 py-0.5 text-xs font-medium text-gray-600 dark:text-gray-400">
                        {p.target_count} target{p.target_count !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">
                      {instrName}
                    </span>
                  </button>
                )
              })
            )}
          </div>
        )}

        {showIF && (
          <div>
            <div className="text-xs font-semibold uppercase text-gray-400 dark:text-gray-500 mb-2">
              IF/IHC Panel Templates
            </div>

            {/* Blank IF panel */}
            <button
              onClick={() => handleSelect('blank', 'if')}
              className="w-full px-3 py-2.5 flex items-center justify-between rounded hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer text-left"
            >
              <div className="flex items-center gap-2">
                <span className="text-base">🔬</span>
                <span className="text-sm text-gray-700 dark:text-gray-300">Blank IF Panel</span>
              </div>
              <span className="text-xs text-gray-400 dark:text-gray-500 italic">empty</span>
            </button>

            {ifTemplates.length === 0 && search ? (
              <p className="text-sm text-gray-400 dark:text-gray-500 px-3 py-2">
                No IF/IHC panel templates found
              </p>
            ) : (
              ifTemplates.map((p) => {
                const scopeName = p.microscope_id
                  ? (microscopeNames.get(p.microscope_id) ?? 'Unknown microscope')
                  : 'No microscope'
                return (
                  <button
                    key={p.id}
                    onClick={() => handleSelect(p.id, 'if')}
                    className="w-full px-3 py-2.5 flex items-center justify-between rounded hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer text-left"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-900 dark:text-gray-100">{p.name}</span>
                      <span className="inline-flex items-center rounded-full bg-gray-100 dark:bg-gray-700 px-2 py-0.5 text-xs font-medium text-gray-600 dark:text-gray-400">
                        {p.target_count} target{p.target_count !== 1 ? 's' : ''}
                      </span>
                      <span
                        className={
                          'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ' +
                          (p.panel_type === 'IHC'
                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                            : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300')
                        }
                      >
                        {p.panel_type}
                      </span>
                    </div>
                    <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">
                      {scopeName}
                    </span>
                  </button>
                )
              })
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
