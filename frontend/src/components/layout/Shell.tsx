import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import ConnectionStatus from './ConnectionStatus'
import { useLayoutWidth } from '@/hooks/useLayoutWidth'

export default function Shell() {
  const { fullWidth } = useLayoutWidth()
  const innerClass = fullWidth ? '' : 'mx-auto max-w-7xl'
  return (
    <div className="flex h-screen flex-col bg-background">
      <ConnectionStatus />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-auto p-6">
          <div className={innerClass}>
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
