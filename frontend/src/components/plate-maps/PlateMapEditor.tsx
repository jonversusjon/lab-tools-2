import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
} from 'react'
import { useParams } from 'react-router-dom'
import { usePlateMap, useUpdatePlateMap } from '@/hooks/usePlateMaps'
import { UndoProvider, useUndo, useCanUndo } from './UndoContext'
import PlateMapGrid from './PlateMapGrid'
import PlateMapControls from './PlateMapControls'
import PlateMapLegendPanel, { buildEmptyLegend } from './PlateMapLegendPanel'
import { PLATE_TYPES, getRowLabels, getColLabels } from '@/utils/plateTypes'
import {
  getRectangularRegion,
  getRowWells,
  getColumnWells,
  getWellsInRectangle,
} from '@/utils/wellUtils'
import type { WellDataMap, PlateMapLegend, ColorLayer, PlateType } from '@/types'

// ─── State ───────────────────────────────────────────────────────────────────

interface EditorState {
  selectedWells: string[]
  wellData: WellDataMap
  legend: PlateMapLegend
  plateType: string
  name: string
  description: string | null
  activeLayer: ColorLayer
  currentColors: Record<ColorLayer, string>
  viewMode: 'edit' | 'presentation'
}

type EditorAction =
  | { type: 'LOAD'; payload: Partial<EditorState> }
  | { type: 'SET_SELECTION'; wells: string[] }
  | { type: 'ADD_SELECTION'; wells: string[] }
  | { type: 'CLEAR_SELECTION' }
  | { type: 'SET_WELL_DATA'; wellData: WellDataMap }
  | { type: 'SET_LEGEND'; legend: PlateMapLegend }
  | { type: 'SET_PLATE_TYPE'; plateType: string }
  | { type: 'SET_NAME'; name: string }
  | { type: 'SET_LAYER'; layer: ColorLayer }
  | { type: 'SET_VIEW_MODE'; mode: 'edit' | 'presentation' }
  | { type: 'APPLY_COLOR'; color: string }
  | { type: 'REMOVE_COLOR' }
  | { type: 'RESET_PLATE' }

function initialState(): EditorState {
  return {
    selectedWells: [],
    wellData: {},
    legend: buildEmptyLegend(),
    plateType: '96-well',
    name: '',
    description: null,
    activeLayer: 'fillColor',
    currentColors: { fillColor: '', borderColor: '', backgroundColor: '' },
    viewMode: 'edit',
  }
}

function reducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'LOAD':
      return { ...state, ...action.payload }

    case 'SET_SELECTION':
      return { ...state, selectedWells: action.wells }

    case 'ADD_SELECTION': {
      const existing = new Set(state.selectedWells)
      action.wells.forEach((w) => existing.add(w))
      return { ...state, selectedWells: Array.from(existing) }
    }

    case 'CLEAR_SELECTION':
      return { ...state, selectedWells: [] }

    case 'SET_WELL_DATA':
      return { ...state, wellData: action.wellData }

    case 'SET_LEGEND':
      return { ...state, legend: action.legend }

    case 'SET_PLATE_TYPE':
      return { ...state, plateType: action.plateType, selectedWells: [], wellData: {}, legend: buildEmptyLegend() }

    case 'SET_NAME':
      return { ...state, name: action.name }

    case 'SET_LAYER':
      return { ...state, activeLayer: action.layer }

    case 'SET_VIEW_MODE':
      return { ...state, viewMode: action.mode }

    case 'APPLY_COLOR': {
      if (state.selectedWells.length === 0) return state
      const next: WellDataMap = { ...state.wellData }
      state.selectedWells.forEach((wellId) => {
        next[wellId] = { ...(next[wellId] ?? {}), [state.activeLayer]: action.color }
      })
      const nextColors = { ...state.currentColors, [state.activeLayer]: action.color }
      return { ...state, wellData: next, currentColors: nextColors }
    }

    case 'REMOVE_COLOR': {
      if (state.selectedWells.length === 0) return state
      const next: WellDataMap = { ...state.wellData }
      state.selectedWells.forEach((wellId) => {
        const c = { ...(next[wellId] ?? {}) }
        delete c[state.activeLayer]
        if (Object.keys(c).length === 0) {
          delete next[wellId]
        } else {
          next[wellId] = c
        }
      })
      return { ...state, wellData: next }
    }

    case 'RESET_PLATE':
      return { ...state, wellData: {}, legend: buildEmptyLegend(), selectedWells: [] }

    default:
      return state
  }
}

// ─── Inner editor (needs UndoProvider in scope) ───────────────────────────────

function EditorInner({ pmId }: { pmId: string }) {
  const { data: pmData, isLoading } = usePlateMap(pmId)
  const updateMutation = useUpdatePlateMap()
  const { pushUndo, undo } = useUndo()
  const canUndo = useCanUndo()

  const [state, dispatch] = useReducer(reducer, undefined, initialState)
  const userEdited = useRef(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  // Drag-selection state
  const containerRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const dragStartRef = useRef<{ x: number; y: number } | null>(null)
  const [dragRect, setDragRect] = useState<{
    left: number; top: number; width: number; height: number
  } | null>(null)
  const [previewWells, setPreviewWells] = useState<string[]>([])

  // Last-clicked well for shift-click range selection
  const lastClickedWellRef = useRef<{ row: number; col: number } | null>(null)
  const lastClickedRowRef = useRef<number | null>(null)
  const lastClickedColRef = useRef<number | null>(null)

  // Presentation export refs
  const presentationRef = useRef<HTMLDivElement>(null)
  const [exportStatus, setExportStatus] = useState<{ copy: string; download: string }>({
    copy: 'Copy PNG',
    download: 'Download PNG',
  })

  // ── Load initial data ──
  useEffect(() => {
    if (!pmData) return
    dispatch({
      type: 'LOAD',
      payload: {
        name: pmData.name,
        description: pmData.description,
        plateType: pmData.plate_type,
        wellData: pmData.well_data ?? {},
        legend: (pmData.legend && Object.keys(pmData.legend).length > 0)
          ? pmData.legend as PlateMapLegend
          : buildEmptyLegend(),
      },
    })
  }, [pmData])

  // ── Auto-save ──
  const doSave = useCallback(
    (s: EditorState) => {
      setSaveStatus('saving')
      updateMutation.mutate(
        {
          id: pmId,
          data: {
            name: s.name,
            description: s.description,
            plate_type: s.plateType as PlateType,
            well_data: s.wellData,
            legend: s.legend,
          },
        },
        {
          onSuccess: () => setSaveStatus('saved'),
          onError: () => setSaveStatus('error'),
        }
      )
    },
    [pmId, updateMutation]
  )

  useEffect(() => {
    if (!userEdited.current) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => doSave(state), 1500)
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [state.wellData, state.legend, state.plateType, state.name]) // eslint-disable-line react-hooks/exhaustive-deps

  // Save on unmount
  useEffect(() => {
    return () => {
      if (userEdited.current) {
        if (saveTimer.current) clearTimeout(saveTimer.current)
        // keepalive save — fire and forget
        fetch(`/api/v1/plate-maps/${pmId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            well_data: state.wellData,
            legend: state.legend,
          }),
          keepalive: true,
        }).catch(() => undefined)
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const markEdited = () => {
    userEdited.current = true
    setSaveStatus('idle')
  }

  // ── Well click handler ──
  const config = PLATE_TYPES[state.plateType]
  const rowLabels = config ? getRowLabels(config.rows) : []
  const colLabels = config ? getColLabels(config.cols) : []

  const handleWellClick = useCallback(
    (wellId: string, row: number, col: number, e: React.MouseEvent) => {
      markEdited()
      const isShift = e.shiftKey
      const isCtrl = e.ctrlKey || e.metaKey

      if (isShift && lastClickedWellRef.current) {
        const region = getRectangularRegion(
          lastClickedWellRef.current,
          { row, col },
          rowLabels,
          colLabels
        )
        dispatch({ type: 'SET_SELECTION', wells: region })
      } else if (isCtrl) {
        const sel = new Set(state.selectedWells)
        if (sel.has(wellId)) sel.delete(wellId)
        else sel.add(wellId)
        dispatch({ type: 'SET_SELECTION', wells: Array.from(sel) })
      } else {
        dispatch({ type: 'SET_SELECTION', wells: [wellId] })
      }
      lastClickedWellRef.current = { row, col }
    },
    [state.selectedWells, rowLabels, colLabels]
  )

  const handleRowClick = useCallback(
    (rowIndex: number, _rowLabel: string, e: React.MouseEvent) => {
      markEdited()
      const wells = getRowWells(rowIndex, rowLabels, colLabels)
      if (e.shiftKey && lastClickedRowRef.current !== null) {
        const minR = Math.min(lastClickedRowRef.current, rowIndex)
        const maxR = Math.max(lastClickedRowRef.current, rowIndex)
        const region: string[] = []
        for (let r = minR; r <= maxR; r++) {
          region.push(...getRowWells(r, rowLabels, colLabels))
        }
        dispatch({ type: 'SET_SELECTION', wells: region })
      } else {
        dispatch({ type: 'SET_SELECTION', wells: wells })
      }
      lastClickedRowRef.current = rowIndex
    },
    [rowLabels, colLabels]
  )

  const handleColClick = useCallback(
    (colIndex: number, _colLabel: string, e: React.MouseEvent) => {
      markEdited()
      const wells = getColumnWells(colIndex, rowLabels, colLabels)
      if (e.shiftKey && lastClickedColRef.current !== null) {
        const minC = Math.min(lastClickedColRef.current, colIndex)
        const maxC = Math.max(lastClickedColRef.current, colIndex)
        const region: string[] = []
        for (let c = minC; c <= maxC; c++) {
          region.push(...getColumnWells(c, rowLabels, colLabels))
        }
        dispatch({ type: 'SET_SELECTION', wells: region })
      } else {
        dispatch({ type: 'SET_SELECTION', wells: wells })
      }
      lastClickedColRef.current = colIndex
    },
    [rowLabels, colLabels]
  )

  // ── Drag-rectangle selection ──
  const DRAG_THRESHOLD = 5

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement
    // Only start drag if clicking on the container background (not a well or header button)
    if (target.dataset['wellId'] || target.closest('[data-well-id]') || target.closest('button')) return
    if (e.button !== 0) return
    const containerRect = containerRef.current?.getBoundingClientRect()
    if (!containerRect) return
    dragStartRef.current = {
      x: e.clientX - containerRect.left,
      y: e.clientY - containerRect.top,
    }
  }, [])

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!dragStartRef.current) return
      const containerRect = containerRef.current?.getBoundingClientRect()
      if (!containerRect) return
      const curX = e.clientX - containerRect.left
      const curY = e.clientY - containerRect.top
      const dx = Math.abs(curX - dragStartRef.current.x)
      const dy = Math.abs(curY - dragStartRef.current.y)
      if (dx < DRAG_THRESHOLD && dy < DRAG_THRESHOLD) return

      const left = Math.min(dragStartRef.current.x, curX)
      const top = Math.min(dragStartRef.current.y, curY)
      const width = Math.abs(curX - dragStartRef.current.x)
      const height = Math.abs(curY - dragStartRef.current.y)
      setDragRect({ left, top, width, height })

      // Compute preview wells
      if (gridRef.current) {
        const wellEls = gridRef.current.querySelectorAll<HTMLElement>('[data-well-id]')
        const positions: Record<string, { x: number; y: number; width: number; height: number }> = {}
        wellEls.forEach((el) => {
          const wellId = el.dataset['wellId']
          if (!wellId) return
          const r = el.getBoundingClientRect()
          positions[wellId] = {
            x: r.left - containerRect.left,
            y: r.top - containerRect.top,
            width: r.width,
            height: r.height,
          }
        })
        const inRect = getWellsInRectangle(
          {
            startX: dragStartRef.current.x,
            startY: dragStartRef.current.y,
            endX: curX,
            endY: curY,
          },
          positions
        )
        setPreviewWells(inRect)
      }
    },
    []
  )

  const handleMouseUp = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!dragStartRef.current) return
      if (dragRect) {
        markEdited()
        const additive = e.ctrlKey || e.metaKey
        if (additive) {
          dispatch({ type: 'ADD_SELECTION', wells: previewWells })
        } else {
          dispatch({ type: 'SET_SELECTION', wells: previewWells })
        }
      }
      dragStartRef.current = null
      setDragRect(null)
      setPreviewWells([])
    },
    [dragRect, previewWells]
  )

  // ── Color application ──
  const handleApplyColor = useCallback(
    (color: string) => {
      markEdited()
      const prevWellData = { ...state.wellData }
      dispatch({ type: 'APPLY_COLOR', color })
      pushUndo('Apply color', () => {
        dispatch({ type: 'SET_WELL_DATA', wellData: prevWellData })
      })
    },
    [state.wellData, pushUndo]
  )

  const handleRemoveColor = useCallback(() => {
    markEdited()
    const prevWellData = { ...state.wellData }
    dispatch({ type: 'REMOVE_COLOR' })
    pushUndo('Remove color', () => {
      dispatch({ type: 'SET_WELL_DATA', wellData: prevWellData })
    })
  }, [state.wellData, pushUndo])

  const handleResetPlate = useCallback(() => {
    markEdited()
    const prevWellData = { ...state.wellData }
    const prevLegend = { ...state.legend }
    dispatch({ type: 'RESET_PLATE' })
    pushUndo('Reset plate', () => {
      dispatch({ type: 'SET_WELL_DATA', wellData: prevWellData })
      dispatch({ type: 'SET_LEGEND', legend: prevLegend })
    })
  }, [state.wellData, state.legend, pushUndo])

  // ── PNG export ──
  const exportPNG = useCallback(async (mode: 'copy' | 'download') => {
    if (!presentationRef.current) return
    const key = mode === 'copy' ? 'copy' : 'download'
    setExportStatus((prev) => ({ ...prev, [key]: 'Generating...' }))
    try {
      const { default: html2canvas } = await import('html2canvas-pro')
      let canvas: HTMLCanvasElement
      try {
        canvas = await html2canvas(presentationRef.current, { backgroundColor: null, scale: 3 })
      } catch {
        canvas = await html2canvas(presentationRef.current, { backgroundColor: null, scale: 1 })
      }
      if (mode === 'copy') {
        canvas.toBlob(async (blob) => {
          if (!blob) return
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
          setExportStatus((prev) => ({ ...prev, copy: 'Copied!' }))
          setTimeout(() => setExportStatus((prev) => ({ ...prev, copy: 'Copy PNG' })), 2000)
        })
      } else {
        const a = document.createElement('a')
        a.href = canvas.toDataURL('image/png')
        a.download = (state.name || 'plate-map') + '.png'
        a.click()
        setExportStatus((prev) => ({ ...prev, download: 'Downloaded!' }))
        setTimeout(() => setExportStatus((prev) => ({ ...prev, download: 'Download PNG' })), 2000)
      }
    } catch {
      setExportStatus((prev) => ({ ...prev, [key]: 'Error' }))
      setTimeout(() => setExportStatus((prev) => ({ ...prev, [key]: mode === 'copy' ? 'Copy PNG' : 'Download PNG' })), 2000)
    }
  }, [state.name])

  if (isLoading) {
    return <p className="text-gray-500 dark:text-gray-400">Loading plate map...</p>
  }

  // ── Presentation mode ──
  if (state.viewMode === 'presentation') {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => dispatch({ type: 'SET_VIEW_MODE', mode: 'edit' })}
            className="rounded border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            ← Edit Plate
          </button>
          <button
            type="button"
            onClick={() => exportPNG('copy')}
            className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            {exportStatus.copy}
          </button>
          <button
            type="button"
            onClick={() => exportPNG('download')}
            className="rounded border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            {exportStatus.download}
          </button>
        </div>

        <div
          ref={presentationRef}
          className="flex gap-8 rounded-lg border border-gray-200 dark:border-gray-700 bg-white p-6"
        >
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-gray-900 mb-1">{state.name}</h2>
            {state.description && (
              <p className="text-sm text-gray-500 mb-3">{state.description}</p>
            )}
            <PlateMapGrid
              plateType={state.plateType}
              wellData={state.wellData}
              selectedWells={[]}
              legend={state.legend}
              readOnly
            />
          </div>
          <div className="w-56 shrink-0">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Legend</h3>
            <PlateMapLegendPanel
              wellData={state.wellData}
              legend={state.legend}
              readOnly
            />
          </div>
        </div>
      </div>
    )
  }

  // ── Edit mode ──
  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={state.name}
            onChange={(e) => {
              markEdited()
              dispatch({ type: 'SET_NAME', name: e.target.value })
            }}
            className="text-xl font-bold bg-transparent border-b border-transparent hover:border-gray-300 dark:hover:border-gray-600 focus:border-blue-500 focus:outline-none dark:text-gray-100 px-1"
          />
        </div>
        <button
          type="button"
          onClick={() => dispatch({ type: 'SET_VIEW_MODE', mode: 'presentation' })}
          className="rounded border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
        >
          Presentation Mode
        </button>
      </div>

      <div className="flex gap-4">
        {/* Controls sidebar */}
        <div className="w-56 shrink-0">
          <PlateMapControls
            plateType={state.plateType}
            activeLayer={state.activeLayer}
            currentColors={state.currentColors}
            selectedWellCount={state.selectedWells.length}
            canUndo={canUndo}
            saveStatus={saveStatus}
            onPlateTypeChange={(type) => {
              markEdited()
              dispatch({ type: 'SET_PLATE_TYPE', plateType: type })
            }}
            onLayerChange={(layer) => dispatch({ type: 'SET_LAYER', layer })}
            onApplyColor={handleApplyColor}
            onRemoveColor={handleRemoveColor}
            onClearSelection={() => dispatch({ type: 'CLEAR_SELECTION' })}
            onResetPlate={handleResetPlate}
            onUndo={undo}
          />
        </div>

        {/* Plate grid */}
        <div className="flex-1 min-w-0 relative">
          <div
            ref={containerRef}
            className="relative select-none"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            <div ref={gridRef}>
              <PlateMapGrid
                plateType={state.plateType}
                wellData={state.wellData}
                selectedWells={state.selectedWells}
                legend={state.legend}
                previewWells={previewWells}
                onWellClick={handleWellClick}
                onRowClick={handleRowClick}
                onColumnClick={handleColClick}
              />
            </div>
            {/* Drag rectangle overlay */}
            {dragRect && (
              <div
                className="pointer-events-none absolute border-2 border-blue-500 bg-blue-500/10"
                style={{
                  left: dragRect.left,
                  top: dragRect.top,
                  width: dragRect.width,
                  height: dragRect.height,
                }}
              />
            )}
          </div>
          {state.selectedWells.length > 0 && (
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
              {state.selectedWells.length} well{state.selectedWells.length !== 1 ? 's' : ''} selected
            </p>
          )}
        </div>

        {/* Legend sidebar */}
        <div className="w-56 shrink-0">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
            Legend
          </h3>
          <PlateMapLegendPanel
            wellData={state.wellData}
            legend={state.legend}
            onLegendChange={(legend) => {
              markEdited()
              dispatch({ type: 'SET_LEGEND', legend })
            }}
          />
        </div>
      </div>
    </div>
  )
}

// ─── Public wrapper ───────────────────────────────────────────────────────────

export default function PlateMapEditor() {
  const { id } = useParams<{ id: string }>()
  if (!id) return <p className="text-red-600">No plate map ID in URL.</p>
  return (
    <UndoProvider>
      <EditorInner pmId={id} />
    </UndoProvider>
  )
}
