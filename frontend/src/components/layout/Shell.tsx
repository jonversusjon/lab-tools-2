import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'

export default function Shell() {
  return (
    <div className="flex h-screen bg-white dark:bg-gray-900">
      <Sidebar />
      <main className="flex-1 overflow-auto p-6">
        <Outlet />
      </main>
    </div>
  )
}
