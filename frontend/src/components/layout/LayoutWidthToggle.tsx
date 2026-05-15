import { useLayoutWidth } from '@/hooks/useLayoutWidth'

export default function LayoutWidthToggle() {
  const { fullWidth, setFullWidth } = useLayoutWidth()

  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-foreground-muted">Full width</span>
      <button
        onClick={() => setFullWidth(!fullWidth)}
        className={
          'relative inline-flex h-5 w-9 items-center rounded-full transition-colors ' +
          (fullWidth ? 'bg-accent' : 'bg-gray-300 dark:bg-gray-600') // theme-exempt: inverted-toggle inactive track, no mid-gray token
        }
        role="switch"
        aria-checked={fullWidth}
        aria-label="Toggle full-width layout"
      >
        <span
          className={
            'inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ' + // theme-exempt: toggle thumb against colored track
            (fullWidth ? 'translate-x-4.5' : 'translate-x-0.5')
          }
        />
      </button>
    </div>
  )
}
