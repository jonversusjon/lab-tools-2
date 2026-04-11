import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useExperiment, useDeleteExperiment } from '@/hooks/useExperiments'
import { useAntibodies } from '@/hooks/useAntibodies'
import { useFluorophores, useBatchSpectra } from '@/hooks/useFluorophores'
import { useSecondaries } from '@/hooks/useSecondaries'
import { useConjugateChemistries } from '@/hooks/useConjugateChemistries'
import type { FluorophoreWithSpectra } from '@/types'
import type { PanelLibraryData } from './FlowPanelBlock'
import BlockRenderer from './BlockRenderer'

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

const DEBOUNCE_MS = 1500

export default function ExperimentPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()

  if (!id) return <p className="text-red-600">No experiment ID in URL.</p>

  const { data: experiment, isLoading, error } = useExperiment(id)
  const deleteMutation = useDeleteExperiment()

  // Library data for panel instance blocks
  const { data: antibodiesData } = useAntibodies({ skip: 0, limit: 2000 })
  const { data: fluorophoreData } = useFluorophores({ skip: 0, limit: 2000, has_spectra: true })
  const { data: allFluorophoreData } = useFluorophores({ skip: 0, limit: 2000 })
  const { data: secondariesData } = useSecondaries()
  const { data: conjugateChemistries = [] } = useConjugateChemistries()

  const antibodies = antibodiesData?.items ?? []
  const fluorophoreList = fluorophoreData?.items ?? []
  const allFluorophores = allFluorophoreData?.items ?? []
  const secondaries = secondariesData?.items ?? []

  const fluorophoreIdsToFetch = useMemo(() => {
    return fluorophoreList.map((f) => f.id)
  }, [fluorophoreList])
  const { data: spectraCache = null } = useBatchSpectra(fluorophoreIdsToFetch)

  const fluorophoresWithSpectra: FluorophoreWithSpectra[] = useMemo(() => {
    return fluorophoreList.map((fl) => ({
      ...fl,
      spectra: spectraCache?.[fl.id] ?? null,
    }))
  }, [fluorophoreList, spectraCache])

  const allFluorophoresForScoring: FluorophoreWithSpectra[] = useMemo(() => {
    return allFluorophores.map((fl) => ({
      ...fl,
      spectra: spectraCache?.[fl.id] ?? null,
    }))
  }, [allFluorophores, spectraCache])

  const libraryData: PanelLibraryData | null = useMemo(() => {
    if (!antibodiesData || !allFluorophoreData) return null
    return {
      antibodies,
      allFluorophores,
      secondaries,
      conjugateChemistries,
      spectraCache,
      fluorophoresWithSpectra,
      allFluorophoresForScoring,
    }
  }, [antibodiesData, allFluorophoreData, antibodies, allFluorophores, secondaries, conjugateChemistries, spectraCache, fluorophoresWithSpectra, allFluorophoresForScoring])

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [initialized, setInitialized] = useState(false)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [isFullWidth, setIsFullWidth] = useState(() => {
    try { return localStorage.getItem('experiment-page-full-width') === 'true' } catch { return false }
  })

  const userEdited = useRef(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dirtyRef = useRef(false)
  const titleRef = useRef(title)
  titleRef.current = title
  const descriptionRef = useRef(description)
  descriptionRef.current = description

  const descTextareaRef = useRef<HTMLTextAreaElement>(null)

  // Initialize title + description once on first load
  useEffect(() => {
    if (experiment && !initialized) {
      setTitle(experiment.name)
      setDescription(experiment.description ?? '')
      setInitialized(true)
    }
  }, [experiment, initialized])

  // Auto-resize description textarea
  useEffect(() => {
    if (descTextareaRef.current) {
      descTextareaRef.current.style.height = 'auto'
      descTextareaRef.current.style.height = descTextareaRef.current.scrollHeight + 'px'
    }
  }, [description])

  const doSave = useCallback(async () => {
    setSaveStatus('saving')
    try {
      const res = await fetch('/api/v1/experiments/' + id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: titleRef.current.trim() || 'Untitled',
          description: descriptionRef.current.trim() || null,
        }),
      })
      if (!res.ok) throw new Error('Save failed')
      setSaveStatus('saved')
      dirtyRef.current = false
      // Delay list invalidation to avoid triggering mid-typing
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ['experiments'] })
      }, 2000)
    } catch {
      setSaveStatus('error')
    }
  }, [id, qc])

  // Debounced autosave on title/description change
  useEffect(() => {
    if (!userEdited.current) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      doSave()
    }, DEBOUNCE_MS)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [title, description, doSave])

  // Flush pending save on unmount with keepalive
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      if (dirtyRef.current) {
        fetch('/api/v1/experiments/' + id, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: titleRef.current.trim() || 'Untitled',
            description: descriptionRef.current.trim() || null,
          }),
          keepalive: true,
        })
      }
    }
  }, [])

  const handleTitleChange = (value: string) => {
    userEdited.current = true
    dirtyRef.current = true
    setSaveStatus('idle')
    setTitle(value)
  }

  const handleDescriptionChange = (value: string) => {
    userEdited.current = true
    dirtyRef.current = true
    setSaveStatus('idle')
    setDescription(value)
  }

  const handleDelete = async () => {
    if (!experiment) return
    if (!confirm('Delete experiment "' + experiment.name + '"? All blocks and data will be lost.')) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    dirtyRef.current = false
    try {
      await deleteMutation.mutateAsync(id)
      navigate('/experiments')
    } catch {
      // Silently fail
    }
  }

  if (isLoading) return <p className="text-gray-500 dark:text-gray-400">Loading experiment...</p>
  if (error || !experiment) return <p className="text-red-600">Failed to load experiment.</p>

  const handleToggleFullWidth = () => {
    const next = !isFullWidth
    setIsFullWidth(next)
    try { localStorage.setItem('experiment-page-full-width', String(next)) } catch { /* ignore */ }
  }

  return (
    <div className={(isFullWidth ? 'max-w-7xl' : 'max-w-4xl') + ' mx-auto'}>
      {/* Title + save status row */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <input
            type="text"
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="Untitled Experiment"
            className={
              'text-3xl font-bold bg-transparent border-none outline-none focus:ring-0 ' +
              'w-full text-gray-900 dark:text-gray-100 ' +
              'placeholder:text-gray-400 dark:placeholder:text-gray-600'
            }
          />
        </div>
        <div className="flex items-center gap-3 shrink-0 pt-2">
          {saveStatus === 'saving' && (
            <span className="text-xs text-gray-400 dark:text-gray-500">Saving...</span>
          )}
          {saveStatus === 'saved' && (
            <span className="text-xs text-green-600 dark:text-green-400">Saved</span>
          )}
          {saveStatus === 'error' && (
            <span className="text-xs text-red-500">Save failed</span>
          )}
          <button
            onClick={handleToggleFullWidth}
            title={isFullWidth ? 'Collapse to normal width' : 'Expand to full width'}
            className={
              'rounded border px-3 py-1.5 text-xs font-medium transition-colors ' +
              (isFullWidth
                ? 'border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40'
                : 'border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800')
            }
          >
            {isFullWidth ? '⟵ Collapse' : '⟷ Full width'}
          </button>
          <button
            onClick={handleDelete}
            className="rounded border border-red-300 dark:border-red-700 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Description */}
      <textarea
        ref={descTextareaRef}
        value={description}
        onChange={(e) => handleDescriptionChange(e.target.value)}
        placeholder="Add a description..."
        rows={1}
        className={
          'mt-2 text-sm bg-transparent border-none outline-none focus:ring-0 ' +
          'w-full text-gray-500 dark:text-gray-400 resize-none overflow-y-hidden ' +
          'placeholder:text-gray-400 dark:placeholder:text-gray-600'
        }
      />

      {/* Divider between header and blocks */}
      <div className="border-b border-gray-100 dark:border-gray-800 pb-6 mb-6 mt-4" />

      {/* Block editor */}
      <BlockRenderer experimentId={id} blocks={experiment.blocks} libraryData={libraryData} />
    </div>
  )
}
