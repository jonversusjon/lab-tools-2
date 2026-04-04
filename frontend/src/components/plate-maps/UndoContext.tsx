import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'

interface UndoEntry {
  label: string
  undoFn: () => void
  timestamp: number
}

interface UndoContextValue {
  pushUndo: (label: string, undoFn: () => void) => void
  undo: () => void
  canUndo: boolean
  getNextUndoLabel: () => string | null
  clearUndoStack: () => void
}

const MAX_STACK = 50

const UndoContext = createContext<UndoContextValue | null>(null)

export function UndoProvider({ children }: { children: React.ReactNode }) {
  const stackRef = useRef<UndoEntry[]>([])
  const [canUndo, setCanUndo] = useState(false)

  const sync = useCallback(() => {
    setCanUndo(stackRef.current.length > 0)
  }, [])

  const pushUndo = useCallback(
    (label: string, undoFn: () => void) => {
      stackRef.current.push({ label, undoFn, timestamp: Date.now() })
      if (stackRef.current.length > MAX_STACK) {
        stackRef.current.shift()
      }
      sync()
    },
    [sync]
  )

  const undo = useCallback(() => {
    const entry = stackRef.current.pop()
    if (entry) entry.undoFn()
    sync()
  }, [sync])

  const getNextUndoLabel = useCallback((): string | null => {
    const entry = stackRef.current[stackRef.current.length - 1]
    return entry ? entry.label : null
  }, [])

  const clearUndoStack = useCallback(() => {
    stackRef.current = []
    sync()
  }, [sync])

  // Global Ctrl+Z / Cmd+Z listener
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        if (stackRef.current.length > 0) {
          e.preventDefault()
          undo()
        }
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [undo])

  return (
    <UndoContext.Provider value={{ pushUndo, undo, canUndo, getNextUndoLabel, clearUndoStack }}>
      {children}
    </UndoContext.Provider>
  )
}

export function useUndo(): UndoContextValue {
  const ctx = useContext(UndoContext)
  if (!ctx) throw new Error('useUndo must be used within UndoProvider')
  return ctx
}

export function useCanUndo(): boolean {
  const ctx = useContext(UndoContext)
  if (!ctx) throw new Error('useCanUndo must be used within UndoProvider')
  return ctx.canUndo
}
