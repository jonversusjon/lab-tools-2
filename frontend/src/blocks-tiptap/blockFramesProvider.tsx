import { useEffect } from 'react'
import { useBlockFramesConfig } from '@/hooks/useBlockFramesConfig'
import type { BlockFramesConfig } from '@/types'
import { DEFAULT_BLOCK_FRAMES } from '@/types'

// A mutable ref holding the latest config. The Tiptap extension reads from this
// at render time. Tiptap's ProseMirror plugins run outside React's render tree,
// so a module-level ref read from inside the extension is the simplest reliable
// way to expose the current config to it.
const configRef: { current: BlockFramesConfig } = { current: DEFAULT_BLOCK_FRAMES }

export function getCurrentBlockFramesConfig(): BlockFramesConfig {
  return configRef.current
}

export function BlockFramesProvider({ children }: { children: React.ReactNode }) {
  const { config } = useBlockFramesConfig()

  useEffect(() => {
    configRef.current = config
    // Tell the editor to rebuild its data-frame decorations with the new config.
    window.dispatchEvent(new CustomEvent('block-frames-config-changed'))
  }, [config])

  return <>{children}</>
}
