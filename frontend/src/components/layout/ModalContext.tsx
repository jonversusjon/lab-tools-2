import { createContext, useContext, useState, useCallback } from 'react'
import type { ReactNode } from 'react'

export type ModalRequest =
  | { kind: 'fpbase_fetch'; fluorophoreId?: string }

interface ModalContextValue {
  request: ModalRequest | null
  open: (req: ModalRequest) => void
  close: () => void
}

const ModalContext = createContext<ModalContextValue>({
  request: null,
  open: () => {},
  close: () => {},
})

export function useModal() {
  return useContext(ModalContext)
}

export function ModalProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<ModalRequest | null>(null)
  const open = useCallback((req: ModalRequest) => setRequest(req), [])
  const close = useCallback(() => setRequest(null), [])
  return (
    <ModalContext.Provider value={{ request, open, close }}>
      {children}
    </ModalContext.Provider>
  )
}
