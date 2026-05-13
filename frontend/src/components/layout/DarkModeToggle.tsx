import { useTheme } from './ThemeContext'

export default function DarkModeToggle() {
  const { theme, toggleTheme } = useTheme()

  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-foreground-muted">Dark Mode</span>
      <button
        onClick={toggleTheme}
        className={
          'relative inline-flex h-5 w-9 items-center rounded-full transition-colors ' +
          (theme === 'dark' ? 'bg-accent' : 'bg-gray-300 dark:bg-gray-600') // theme-exempt: inverted-toggle inactive track, no mid-gray token
        }
        role="switch"
        aria-checked={theme === 'dark'}
        aria-label="Toggle dark mode"
      >
        <span
          className={
            'inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ' + // theme-exempt: toggle thumb against colored track
            (theme === 'dark' ? 'translate-x-4.5' : 'translate-x-0.5')
          }
        />
      </button>
    </div>
  )
}
