import { useEffect, useRef } from 'react'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  wide?: boolean
  size?: 'default' | 'wide' | 'xl'
}

export default function Modal({ isOpen, onClose, title, children, wide, size }: ModalProps) {
  const resolvedSize = size ?? (wide ? 'wide' : 'default')
  const sizeClass =
    resolvedSize === 'xl' ? 'max-w-[1400px]' :
    resolvedSize === 'wide' ? 'max-w-4xl' :
    'max-w-lg'
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose()
      }}
    >
      <div className={`w-full ${sizeClass} rounded-lg bg-elevated shadow-xl max-h-[90vh] overflow-y-auto`}>
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          <button
            onClick={onClose}
            className="text-foreground-subtle hover:text-foreground-muted"
            aria-label="Close"
          >
            &times;
          </button>
        </div>
        <div className="px-6 py-4">{children}</div>
      </div>
    </div>
  )
}
