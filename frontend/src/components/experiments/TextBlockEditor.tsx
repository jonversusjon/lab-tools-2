import { useCallback, useEffect, useRef, useState } from 'react'
import type { ExperimentBlock, TextBlockContent } from '@/types'

const DEBOUNCE_MS = 1500

interface TextBlockEditorProps {
  experimentId: string
  block: ExperimentBlock
  onCreateBlockBelow: (blockId: string) => void
  onDeleteBlock: (blockId: string) => void
  children?: React.ReactNode
}

const placeholders: Record<string, string> = {
  paragraph: "Type '/' for commands...",
  heading_1: 'Heading 1',
  heading_2: 'Heading 2',
  heading_3: 'Heading 3',
  heading_4: 'Heading 4',
  bulleted_list_item: '',
  numbered_list_item: '',
}

const headingStyles: Record<string, string> = {
  heading_1: 'text-3xl font-bold',
  heading_2: 'text-2xl font-semibold',
  heading_3: 'text-xl font-semibold',
  heading_4: 'text-lg font-semibold',
}

function parseContent(block: ExperimentBlock): TextBlockContent {
  const c = block.content as Record<string, unknown>
  return {
    text: typeof c.text === 'string' ? c.text : '',
    is_toggleable: typeof c.is_toggleable === 'boolean' ? c.is_toggleable : false,
  }
}

/** Fire-and-forget PUT with keepalive for unmount/unload flush. */
function flushBlockSave(
  experimentId: string,
  blockId: string,
  text: string
) {
  fetch('/api/v1/experiments/' + experimentId + '/blocks/' + blockId, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: { text } }),
    keepalive: true,
  })
}

export default function TextBlockEditor({
  experimentId,
  block,
  onCreateBlockBelow,
  onDeleteBlock,
  children,
}: TextBlockEditorProps) {
  const parsed = parseContent(block)
  const [value, setValue] = useState(parsed.text)
  const [isOpen, setIsOpen] = useState(true)

  const userEdited = useRef(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dirtyRef = useRef(false)
  const valueRef = useRef(value)
  valueRef.current = value

  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  // Sync from props when block changes externally (not during user edit)
  useEffect(() => {
    if (!userEdited.current) {
      const newText = parseContent(block).text
      if (newText !== value) {
        setValue(newText)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [block.content, block.updated_at])

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = el.scrollHeight + 'px'
    }
  }, [value])

  // Debounced auto-save
  const saveBlock = useCallback(
    (text: string) => {
      fetch(
        '/api/v1/experiments/' + experimentId + '/blocks/' + block.id,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: { text } }),
        }
      )
      dirtyRef.current = false
    },
    [experimentId, block.id]
  )

  useEffect(() => {
    if (!userEdited.current) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      saveBlock(value)
    }, DEBOUNCE_MS)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [value, saveBlock])

  // Flush on unmount via keepalive
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      if (dirtyRef.current) {
        flushBlockSave(experimentId, block.id, valueRef.current)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleChange = (newValue: string) => {
    userEdited.current = true
    dirtyRef.current = true
    setValue(newValue)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      // For headings (input), always create block below
      // For textarea (paragraph/list), Enter without Shift creates block below
      const isHeading = block.block_type.startsWith('heading_')
      if (isHeading || !e.shiftKey) {
        e.preventDefault()
        onCreateBlockBelow(block.id)
      }
    }
    if (e.key === 'Backspace' && value === '') {
      e.preventDefault()
      onDeleteBlock(block.id)
    }
  }

  const baseInputClass =
    'w-full border-none outline-none focus:ring-0 bg-transparent ' +
    'text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-600 resize-none'

  const isHeading = block.block_type.startsWith('heading_')
  const isList = block.block_type === 'bulleted_list_item' || block.block_type === 'numbered_list_item'
  const isToggleable = parsed.is_toggleable && isHeading

  const renderInput = () => {
    if (isHeading) {
      return (
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholders[block.block_type] ?? ''}
          className={baseInputClass + ' ' + (headingStyles[block.block_type] ?? '')}
          data-block-input="true"
        />
      )
    }

    return (
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholders[block.block_type] ?? ''}
        rows={1}
        className={baseInputClass + ' text-base overflow-y-hidden'}
        style={{ minHeight: '1.5rem' }}
        data-block-input="true"
      />
    )
  }

  const listPrefix = () => {
    if (block.block_type === 'bulleted_list_item') {
      return (
        <span className="mt-0.5 mr-2 text-gray-400 dark:text-gray-500 select-none">
          &bull;
        </span>
      )
    }
    return null
  }

  return (
    <div data-block-id={block.id}>
      <div className="flex items-start">
        {isToggleable && (
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="mr-1 mt-1 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 select-none text-sm"
          >
            {isOpen ? '▼' : '▶'}
          </button>
        )}
        {isList && listPrefix()}
        <div className="flex-1 min-w-0">{renderInput()}</div>
      </div>
      {isToggleable && isOpen && children && (
        <div className="ml-6 mt-1">{children}</div>
      )}
    </div>
  )
}
