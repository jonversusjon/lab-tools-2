import { NavLink } from 'react-router-dom'

const navItems = [
  { to: '/instruments', label: 'Instruments' },
  { to: '/fluorophores', label: 'Fluorophores' },
  { to: '/antibodies', label: 'Antibodies' },
  { to: '/panels', label: 'Panels' },
]

export default function Sidebar() {
  return (
    <nav className="w-56 shrink-0 border-r border-gray-200 bg-gray-50 p-4">
      <h1 className="mb-6 text-lg font-bold text-gray-800">
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
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900')
              }
            >
              {item.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
