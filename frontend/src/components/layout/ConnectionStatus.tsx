import { useState, useEffect, useRef } from 'react'

export default function ConnectionStatus() {
  const [isDown, setIsDown] = useState(false)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true

    const check = async () => {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 4000)
      try {
        const res = await fetch('/api/v1/instruments?skip=0&limit=1', {
          signal: controller.signal,
        })
        if (mountedRef.current) setIsDown(!res.ok)
      } catch {
        if (mountedRef.current) setIsDown(true)
      } finally {
        clearTimeout(timer)
      }
    }

    // Initial check after a short delay to avoid flash during normal startup
    const initialTimer = setTimeout(check, 1500)

    // Periodic check every 15 seconds
    const interval = setInterval(check, 15000)

    return () => {
      mountedRef.current = false
      clearTimeout(initialTimer)
      clearInterval(interval)
    }
  }, [])

  if (!isDown) return null

  return (
    <div className="bg-red-600 text-white text-center py-2 px-4 text-sm font-medium">
      Lab Tools 2 Unavailable &mdash; Backend server is not responding
    </div>
  )
}
