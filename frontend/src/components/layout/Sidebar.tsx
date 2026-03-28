import { NavLink } from 'react-router-dom'
import PreferencesMenu from './PreferencesMenu'

const navItems = [
  { to: '/instruments', label: 'Instruments' },
  { to: '/fluorophores', label: 'Fluorophores' },
  { to: '/antibodies', label: 'Antibodies' },
  { to: '/panels', label: 'Panels' },
  { to: '/settings', label: 'Settings' },
]

export default function Sidebar() {
  return (
    <nav className="flex w-56 shrink-0 flex-col border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-4">
      <h1 className="mb-6 text-lg font-bold text-gray-800 dark:text-gray-100">
        Flow Panel Designer
      </h1>
      <ul className="space-y-1">
        {navItems.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              className={({ isActive }) =>
                'block rounded px-3 py-2 text-sm font-medium ' +
                (isActive
                  ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-400'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-gray-200')
              }
            >
              {item.label}
            </NavLink>
          </li>
        ))}
      </ul>
      <PreferencesMenu />
    </nav>
  )
}
