import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { NavLink, useLocation } from 'react-router-dom'
import PreferencesMenu from './PreferencesMenu'
import DarkModeToggle from './DarkModeToggle'

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
  { type: 'link', item: { to: '/experiments', label: 'Experiments', icon: '🧪' } },
  {
    type: 'group',
    group: {
      key: 'templates',
      label: 'Templates',
      icon: '📋',
      children: [
        { to: '/flow/panels', label: 'Flow Cytometry', icon: '🔬' },
        { to: '/if-ihc/panels', label: 'Immunostaining', icon: '🔬' },
        { to: '/plate-maps', label: 'Plate Maps', icon: '🧫' },
        { to: '/qpcr/plates', label: 'qPCR', icon: '📋' },
      ],
    },
  },
  {
    type: 'group',
    group: {
      key: 'resources',
      label: 'Resources',
      icon: '📦',
      children: [
        { to: '/flow/instruments', label: 'Instruments', icon: '🔧' },
        { to: '/if-ihc/microscopes', label: 'Microscopes', icon: '🔧' },
        { to: '/resources/primaries', label: 'Primaries', icon: '🧬' },
        { to: '/resources/secondaries', label: 'Secondaries', icon: '🔗' },
        { to: '/resources/fluorophores', label: 'Fluorophores', icon: '🌈' },
        { to: '/resources/dyes-labels', label: 'Dyes & Labels', icon: '🏷️' },
        { to: '/qpcr/primers', label: 'Primers', icon: '🧪' },
      ],
    },
  },
  { type: 'link', item: { to: '/settings', label: 'Settings', icon: '⚙️' } },
]

const STORAGE_KEY = 'sidebar-collapsed'
const GROUPS_STORAGE_KEY = 'sidebar-groups'

const defaultGroupState: Record<string, boolean> = { resources: true, flow: true, 'if-ihc': true, qpcr: false }

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
  const navRef = useRef<HTMLElement>(null)

  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true'
    } catch {
      return false
    }
  })

  const [groupOpen, setGroupOpen] = useState<Record<string, boolean>>(readGroupState)

  // Flyout state (collapsed mode — nav groups)
  const [flyoutGroup, setFlyoutGroup] = useState<string | null>(null)
  const [flyoutPos, setFlyoutPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  const flyoutRef = useRef<HTMLDivElement>(null)

  // Prefs flyout state (collapsed mode only)
  const [prefsFlyoutOpen, setPrefsFlyoutOpen] = useState(false)
  const [prefsFlyoutPos, setPrefsFlyoutPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  const prefsFlyoutRef = useRef<HTMLDivElement>(null)

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

  // Close flyouts when sidebar expands
  useEffect(() => {
    if (!collapsed) {
      setFlyoutGroup(null)
      setPrefsFlyoutOpen(false)
    }
  }, [collapsed])

  // Close flyouts on outside click or Escape
  useEffect(() => {
    if (!flyoutGroup && !prefsFlyoutOpen) return
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node
      // Clicks inside the nav (trigger buttons) are handled by the toggle — don't double-close
      if (navRef.current && navRef.current.contains(target)) return
      if (flyoutGroup && flyoutRef.current && !flyoutRef.current.contains(target)) {
        setFlyoutGroup(null)
      }
      if (prefsFlyoutOpen && prefsFlyoutRef.current && !prefsFlyoutRef.current.contains(target)) {
        setPrefsFlyoutOpen(false)
      }
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setFlyoutGroup(null)
        setPrefsFlyoutOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [flyoutGroup, prefsFlyoutOpen])

  function toggleGroup(key: string) {
    setGroupOpen((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  function openFlyout(e: React.MouseEvent<HTMLButtonElement>, group: NavGroup) {
    if (flyoutGroup === group.key) {
      setFlyoutGroup(null)
      return
    }
    const rect = e.currentTarget.getBoundingClientRect()
    const flyoutHeight = group.children.length * 40 + 48
    const maxTop = window.innerHeight - flyoutHeight - 8
    setFlyoutPos({
      top: Math.min(rect.top, maxTop),
      left: rect.right + 4,
    })
    setFlyoutGroup(group.key)
  }

  function openPrefsFlyout(e: React.MouseEvent<HTMLButtonElement>) {
    if (prefsFlyoutOpen) {
      setPrefsFlyoutOpen(false)
      return
    }
    const rect = e.currentTarget.getBoundingClientRect()
    const flyoutHeight = 80
    const maxTop = window.innerHeight - flyoutHeight - 8
    setPrefsFlyoutPos({
      top: Math.min(rect.top, maxTop),
      left: rect.right + 4,
    })
    setPrefsFlyoutOpen(true)
  }

  // Find the active flyout group object
  const activeFlyoutGroup = flyoutGroup
    ? (sidebarEntries.find(
        (e): e is { type: 'group'; group: NavGroup } =>
          e.type === 'group' && e.group.key === flyoutGroup
      )?.group ?? null)
    : null

  return (
    <>
      <nav
        ref={navRef}
        className={
          'flex shrink-0 flex-col border-r border-border ' +
          'bg-surface transition-all duration-200 ease-in-out overflow-hidden ' +
          (collapsed ? 'w-14' : 'w-56')
        }
      >
        {/* Header */}
        <div className={
          'flex items-center border-b border-border ' +
          (collapsed ? 'justify-center px-2 py-4' : 'justify-between px-4 py-4')
        }>
          {!collapsed && (
            <span className="text-base font-bold text-foreground whitespace-nowrap overflow-hidden">
              Lab Tools
            </span>
          )}
          <button
            onClick={() => setCollapsed((c) => !c)}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={
              'flex items-center justify-center rounded p-1 text-foreground-muted ' +
              'hover:bg-hover hover:text-foreground ' +
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
                        ? 'bg-accent-soft text-accent-soft-foreground'
                        : 'text-foreground-muted hover:bg-hover hover:text-foreground')
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
            const hasActiveChild = group.children.some(
              (child) =>
                location.pathname === child.to ||
                location.pathname.startsWith(child.to + '/')
            )

            return (
              <li key={group.key}>
                {collapsed ? (
                  <button
                    onClick={(e) => openFlyout(e, group)}
                    title={group.label}
                    aria-expanded={flyoutGroup === group.key}
                    className={
                      'flex w-full items-center justify-center rounded py-2.5 transition-colors duration-100 ' +
                      (hasActiveChild
                        ? 'bg-accent-soft text-accent-soft-foreground'
                        : 'text-foreground-muted hover:bg-hover hover:text-foreground')
                    }
                  >
                    <span className="shrink-0 text-base leading-none" aria-hidden="true">{group.icon}</span>
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => toggleGroup(group.key)}
                      className={
                        'flex w-full items-center gap-2 rounded px-3 py-2 ' +
                        'text-xs font-semibold uppercase tracking-wider text-foreground-subtle ' +
                        'hover:bg-hover transition-colors duration-100'
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
                      <ul className="ml-5 mt-0.5 space-y-0.5 border-l-2 border-border">
                        {group.children.map((child) => (
                          <li key={child.to}>
                            <NavLink
                              to={child.to}
                              className={({ isActive }) =>
                                'flex items-center gap-2 rounded py-2 pl-4 pr-3 text-sm font-medium transition-colors duration-100 ' +
                                (isActive
                                  ? 'bg-accent-soft text-accent-soft-foreground'
                                  : 'text-foreground-muted hover:bg-hover hover:text-foreground')
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

        {/* Preferences — expanded: full menu; collapsed: gear icon that opens flyout */}
        {collapsed ? (
          <div className="border-t border-border px-1 py-2">
            <button
              onClick={openPrefsFlyout}
              title="Preferences"
              aria-expanded={prefsFlyoutOpen}
              className="flex w-full items-center justify-center rounded py-2.5 text-foreground-muted hover:bg-hover hover:text-foreground transition-colors duration-100"
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
            </button>
          </div>
        ) : (
          <div className="px-3 pb-3">
            <PreferencesMenu />
          </div>
        )}
      </nav>

      {/* Group flyout portal — only rendered in collapsed mode */}
      {collapsed && activeFlyoutGroup && createPortal(
        <div
          ref={flyoutRef}
          className="fixed z-50 w-48 rounded-r-lg border border-border bg-elevated shadow-lg py-2"
          style={{ top: flyoutPos.top, left: flyoutPos.left }}
        >
          <div className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-foreground-subtle">
            {activeFlyoutGroup.label}
          </div>
          {activeFlyoutGroup.children.map((child) => (
            <NavLink
              key={child.to}
              to={child.to}
              onClick={() => setFlyoutGroup(null)}
              className={({ isActive }) =>
                'flex items-center gap-2 px-3 py-2 text-sm font-medium transition-colors duration-100 ' +
                (isActive
                  ? 'bg-accent-soft text-accent-soft-foreground'
                  : 'text-foreground-muted hover:bg-hover hover:text-foreground')
              }
            >
              <span className="shrink-0 text-base leading-none" aria-hidden="true">{child.icon}</span>
              <span>{child.label}</span>
            </NavLink>
          ))}
        </div>,
        document.body
      )}

      {/* Prefs flyout portal — only rendered in collapsed mode */}
      {collapsed && prefsFlyoutOpen && createPortal(
        <div
          ref={prefsFlyoutRef}
          className="fixed z-50 w-52 rounded-r-lg border border-border bg-elevated shadow-lg p-3"
          style={{ top: prefsFlyoutPos.top, left: prefsFlyoutPos.left }}
        >
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-foreground-subtle">
            Preferences
          </div>
          <DarkModeToggle />
        </div>,
        document.body
      )}
    </>
  )
}
