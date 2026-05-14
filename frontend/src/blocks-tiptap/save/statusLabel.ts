import type { SaveStatus } from './saveCoordinator'

export interface StatusLabel {
  text: string
  cls: string
}

export function statusLabel(status: SaveStatus | string): StatusLabel {
  switch (status) {
    case 'idle':
      return { text: 'Saved', cls: 'bg-surface text-foreground-muted' }
    case 'saved':
      return { text: 'Saved', cls: 'bg-surface text-foreground-muted' }
    case 'dirty':
      return { text: 'Unsaved changes', cls: 'bg-warning-soft text-warning-soft-foreground' }
    case 'saving':
      return { text: 'Saving...', cls: 'bg-accent-soft text-accent-soft-foreground' }
    case 'error':
      return { text: 'Save error', cls: 'bg-danger-soft text-danger-soft-foreground' }
    default:
      return { text: status, cls: 'bg-surface text-foreground-muted' }
  }
}
