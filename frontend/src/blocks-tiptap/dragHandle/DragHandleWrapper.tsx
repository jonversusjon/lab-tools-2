import { useState, useRef, useCallback } from 'react'
import { DragHandle } from '@tiptap/extension-drag-handle-react'
import type { Editor } from '@tiptap/react'
import type { Node as PMNode } from '@tiptap/pm/model'
import BlockMenu from './BlockMenu'

interface DragHandleWrapperProps {
  editor: Editor
}

export function DragHandleWrapper({ editor }: DragHandleWrapperProps) {
  const [currentNode, setCurrentNode] = useState<PMNode | null>(null)
  const [currentNodePos, setCurrentNodePos] = useState(-1)
  // Tracks whether the context menu is open so we can freeze the node target
  // while the user is interacting with menu items.
  const menuOpenRef = useRef(false)

  const handleMenuOpenChange = useCallback((open: boolean) => {
    menuOpenRef.current = open
  }, [])

  return (
    <DragHandle
      editor={editor}
      onNodeChange={({ node, pos }) => {
        if (!menuOpenRef.current) {
          setCurrentNode(node)
          setCurrentNodePos(pos)
        }
      }}
    >
      <BlockMenu
        editor={editor}
        currentNode={currentNode}
        currentNodePos={currentNodePos}
        onMenuOpenChange={handleMenuOpenChange}
      />
    </DragHandle>
  )
}
