import { useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import PreferencesMenu from './PreferencesMenu'

const navItems = [
  { to: '/instruments', label: 'Instruments', icon: '🔬' },
  { to: '/fluorophores', label: 'Fluorophores', icon: '🌈' },
  { to: '/antibodies', label: 'Antibodies', icon: '🧬' },
  { to: '/secondaries', label: 'Secondaries', icon: '🔗' },
  { to: '/panels', label: 'Panels', icon: '📋' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
]

const STORAGE_KEY = 'sidebar-collapsed'

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true'
    } catch {
      return false
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(collapsed))
    } catch {
      // ignore
    }
  }, [collapsed])

  return (
    <nav
      className={
        'flex shrink-0 flex-col border-r border-gray-200 dark:border-gray-700 ' +
        'bg-gray-50 dark:bg-gray-800 transition-all duration-200 ease-in-out overflow-hidden ' +
        (collapsed ? 'w-14' : 'w-56')
      }
    >
      {/* Header */}
      <div className={
        'flex items-center border-b border-gray-200 dark:border-gray-700 ' +
        (collapsed ? 'justify-center px-2 py-4' : 'justify-between px-4 py-4')
      }>
        {!collapsed && (
          <span className="text-base font-bold text-gray-800 dark:text-gray-100 whitespace-nowrap overflow-hidden">
            Flow Panel Designer
          </span>
        )}
        <button
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={
            'flex items-center justify-center rounded p-1 text-gray-500 dark:text-gray-400 ' +
            'hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-200 ' +
            'transition-colors duration-150 shrink-0'
          }
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
            style={{ transform: collapsed ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 200ms ease-in-out' }}
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
      </div>

      {/* Nav links */}
      <ul className={
        'flex-1 overflow-hidden ' +
        (collapsed ? 'space-y-1 px-1 pt-3' : 'space-y-1 p-3')
      }>
        {navItems.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              title={collapsed ? item.label : undefined}
              className={({ isActive }) =>
                'flex items-center rounded text-sm font-medium transition-colors duration-100 ' +
                (collapsed ? 'justify-center px-0 py-2.5' : 'gap-2.5 px-3 py-2') +
                ' ' +
                (isActive
                  ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-400'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-gray-200')
              }
            >
              <span className="shrink-0 text-base leading-none" aria-hidden="true">{item.icon}</span>
              {!collapsed && (
                <span className="truncate">{item.label}</span>
              )}
            </NavLink>
          </li>
        ))}
      </ul>

      {/* Preferences (hide when collapsed) */}
      {!collapsed && (
        <div className="px-3 pb-3">
          <PreferencesMenu />
        </div>
      )}
    </nav>
  )
}
