import { useState } from 'react'
import { useTheme } from './ThemeContext'

export default function PreferencesMenu() {
  const [open, setOpen] = useState(false)
  const { theme, toggleTheme } = useTheme()

  return (
    <div className="mt-auto border-t border-gray-200 dark:border-gray-700 pt-3">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 rounded px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
        Preferences
        <span className="ml-auto text-xs">{open ? '\u25BC' : '\u25B6'}</span>
      </button>

      {open && (
        <div className="mt-1 space-y-2 px-3 py-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600 dark:text-gray-400">Dark Mode</span>
            <button
              onClick={toggleTheme}
              className={
                'relative inline-flex h-5 w-9 items-center rounded-full transition-colors ' +
                (theme === 'dark' ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600')
              }
              role="switch"
              aria-checked={theme === 'dark'}
              aria-label="Toggle dark mode"
            >
              <span
                className={
                  'inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ' +
                  (theme === 'dark' ? 'translate-x-4.5' : 'translate-x-0.5')
                }
              />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
