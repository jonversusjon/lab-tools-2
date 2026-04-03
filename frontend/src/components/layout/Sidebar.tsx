import { useState, useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import PreferencesMenu from './PreferencesMenu'

interface NavItem {
  to: string
  label: string
  icon: string
}

interface NavGroup {
  key: string
  label: string
  icon: string
  children: NavItem[]
}

type SidebarEntry =
  | { type: 'link'; item: NavItem }
  | { type: 'group'; group: NavGroup }

const sidebarEntries: SidebarEntry[] = [
  { type: 'link', item: { to: '/', label: 'Home', icon: '🏠' } },
  {
    type: 'group',
    group: {
      key: 'flow',
      label: 'Flow Cytometry',
      icon: '🔬',
      children: [
        { to: '/flow/instruments', label: 'Instruments', icon: '🔧' },
        { to: '/flow/fluorophores', label: 'Fluorophores', icon: '🌈' },
        { to: '/flow/antibodies', label: 'Antibodies', icon: '🧬' },
        { to: '/flow/secondaries', label: 'Secondaries', icon: '🔗' },
        { to: '/flow/panels', label: 'Panels', icon: '📋' },
      ],
    },
  },
  {
    type: 'group',
    group: {
      key: 'if-ihc',
      label: 'IF / IHC',
      icon: '🔬',
      children: [
        { to: '/if-ihc/protocols', label: 'Protocols', icon: '📝' },
        { to: '/if-ihc/experiments', label: 'Experiments', icon: '🧪' },
      ],
    },
  },
  {
    type: 'group',
    group: {
      key: 'qpcr',
      label: 'qPCR',
      icon: '🧬',
      children: [
        { to: '/qpcr/primers', label: 'Primers', icon: '🧪' },
        { to: '/qpcr/plates', label: 'Plates', icon: '📋' },
      ],
    },
  },
  { type: 'link', item: { to: '/settings', label: 'Settings', icon: '⚙️' } },
]

const STORAGE_KEY = 'sidebar-collapsed'
const GROUPS_STORAGE_KEY = 'sidebar-groups'

const defaultGroupState: Record<string, boolean> = { flow: true, 'if-ihc': false, qpcr: false }

function readGroupState(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(GROUPS_STORAGE_KEY)
    if (raw) return { ...defaultGroupState, ...JSON.parse(raw) }
  } catch {
    // ignore
  }
  return { ...defaultGroupState }
}

export default function Sidebar() {
  const location = useLocation()

  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true'
    } catch {
      return false
    }
  })

  const [groupOpen, setGroupOpen] = useState<Record<string, boolean>>(readGroupState)

  // Auto-open group when a child route becomes active
  useEffect(() => {
    setGroupOpen((prev) => {
      const next = { ...prev }
      let changed = false
      for (const entry of sidebarEntries) {
        if (entry.type === 'group') {
          const hasActiveChild = entry.group.children.some(
            (child) =>
              location.pathname === child.to ||
              location.pathname.startsWith(child.to + '/')
          )
          if (hasActiveChild && !next[entry.group.key]) {
            next[entry.group.key] = true
            changed = true
          }
        }
      }
      return changed ? next : prev
    })
  }, [location.pathname])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(collapsed))
    } catch {
      // ignore
    }
  }, [collapsed])

  useEffect(() => {
    try {
      localStorage.setItem(GROUPS_STORAGE_KEY, JSON.stringify(groupOpen))
    } catch {
      // ignore
    }
  }, [groupOpen])

  function toggleGroup(key: string) {
    setGroupOpen((prev) => ({ ...prev, [key]: !prev[key] }))
  }

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
            Lab Tools
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
        'flex-1 overflow-y-auto overflow-x-hidden ' +
        (collapsed ? 'space-y-1 px-1 pt-3' : 'space-y-1 p-3')
      }>
        {sidebarEntries.map((entry) => {
          if (entry.type === 'link') {
            const { item } = entry
            return (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.to === '/'}
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
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </NavLink>
              </li>
            )
          }

          // Group entry
          const { group } = entry
          const isOpen = groupOpen[group.key] ?? false

          return (
            <li key={group.key}>
              {collapsed ? (
                <div
                  title={group.label}
                  className="flex justify-center px-0 py-2.5"
                >
                  <span className="shrink-0 text-base leading-none" aria-hidden="true">{group.icon}</span>
                </div>
              ) : (
                <>
                  <button
                    onClick={() => toggleGroup(group.key)}
                    className={
                      'flex w-full items-center gap-2 rounded px-3 py-2 ' +
                      'text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 ' +
                      'hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-100'
                    }
                    aria-expanded={isOpen}
                  >
                    <span className="shrink-0 text-sm leading-none" aria-hidden="true">{group.icon}</span>
                    <span className="flex-1 truncate text-left">{group.label}</span>
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-3 w-3 shrink-0 transition-transform duration-150"
                      style={{ transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}
                    >
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                  </button>
                  {isOpen && (
                    <ul className="ml-5 mt-0.5 space-y-0.5 border-l-2 border-gray-200 dark:border-gray-700">
                      {group.children.map((child) => (
                        <li key={child.to}>
                          <NavLink
                            to={child.to}
                            className={({ isActive }) =>
                              'flex items-center gap-2 rounded py-2 pl-4 pr-3 text-sm font-medium transition-colors duration-100 ' +
                              (isActive
                                ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-400'
                                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-gray-200')
                            }
                          >
                            <span className="shrink-0 text-base leading-none" aria-hidden="true">{child.icon}</span>
                            <span className="truncate">{child.label}</span>
                          </NavLink>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </li>
          )
        })}
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
