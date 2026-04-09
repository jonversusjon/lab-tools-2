import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import ConnectionStatus from './ConnectionStatus'

export default function Shell() {
  return (
    <div className="flex h-screen flex-col bg-white dark:bg-gray-900">
      <ConnectionStatus />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
