import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import ConnectionStatus from './ConnectionStatus'

export default function Shell() {
  return (
    <div className="flex h-screen flex-col bg-background">
      <ConnectionStatus />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-auto scrollbar-hide p-6">
          <Outlet />
        </main>
        {/* Full-height slot for page-scoped right rails (e.g. the experiment
            spectral rail). Sits beside <main>, so its content stretches top to
            bottom like the sidebar. Empty (0 width) when no rail is mounted. */}
        <div id="right-rail-slot" className="flex" />
      </div>
    </div>
  )
}
