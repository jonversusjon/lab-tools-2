import { useCallback, useEffect, useRef, useState } from 'react'
import type { ExperimentBlock, CalloutBlockContent } from '@/types'

const DEBOUNCE_MS = 1500

const ICON_OPTIONS = ['💡', '⚠️', '📝', '🔬', '🧬', '✅', '❌', 'ℹ️', '🎯', '📌']

const COLOR_MAP: Record<string, string> = {
  gray_background: 'bg-gray-100 dark:bg-gray-800',
  yellow_background: 'bg-yellow-50 dark:bg-yellow-900/20',
  blue_background: 'bg-blue-50 dark:bg-blue-900/20',
  green_background: 'bg-green-50 dark:bg-green-900/20',
  red_background: 'bg-red-50 dark:bg-red-900/20',
  purple_background: 'bg-purple-50 dark:bg-purple-900/20',
}

const COLOR_OPTIONS = Object.keys(COLOR_MAP)

const COLOR_PREVIEW: Record<string, string> = {
  gray_background: 'bg-gray-300 dark:bg-gray-500',
  yellow_background: 'bg-yellow-300 dark:bg-yellow-500',
  blue_background: 'bg-blue-300 dark:bg-blue-500',
  green_background: 'bg-green-300 dark:bg-green-500',
  red_background: 'bg-red-300 dark:bg-red-500',
  purple_background: 'bg-purple-300 dark:bg-purple-500',
}

interface CalloutBlockProps {
  experimentId: string
  block: ExperimentBlock
}

function parseContent(block: ExperimentBlock): CalloutBlockContent {
  const c = block.content as Record<string, unknown>
  return {
    text: typeof c.text === 'string' ? c.text : '',
    icon: typeof c.icon === 'string' ? c.icon : '💡',
    color: typeof c.color === 'string' ? c.color : 'gray_background',
  }
}

function flushCalloutSave(
  experimentId: string,
  blockId: string,
  content: CalloutBlockContent
) {
  fetch('/api/v1/experiments/' + experimentId + '/blocks/' + blockId, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
    keepalive: true,
  })
}

export default function CalloutBlock({
  experimentId,
  block,
}: CalloutBlockProps) {
  const parsed = parseContent(block)
  const [text, setText] = useState(parsed.text)
  const [icon, setIcon] = useState(parsed.icon)
  const [color, setColor] = useState(parsed.color)
  const [showIconPicker, setShowIconPicker] = useState(false)

  const userEdited = useRef(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dirtyRef = useRef(false)
  const textRef = useRef(text)
  const iconRef = useRef(icon)
  const colorRef = useRef(color)
  textRef.current = text
  iconRef.current = icon
  colorRef.current = color

  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  // Sync from props when not editing
  useEffect(() => {
    if (!userEdited.current) {
      const p = parseContent(block)
      setText(p.text)
      setIcon(p.icon)
      setColor(p.color)
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
  }, [text])

  const saveContent = useCallback(
    (t: string, i: string, c: string) => {
      fetch(
        '/api/v1/experiments/' + experimentId + '/blocks/' + block.id,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: { text: t, icon: i, color: c } }),
        }
      )
      dirtyRef.current = false
    },
    [experimentId, block.id]
  )

  // Debounced save on any change
  useEffect(() => {
    if (!userEdited.current) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      saveContent(text, icon, color)
    }, DEBOUNCE_MS)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [text, icon, color, saveContent])

  // Flush on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      if (dirtyRef.current) {
        flushCalloutSave(experimentId, block.id, {
          text: textRef.current,
          icon: iconRef.current,
          color: colorRef.current,
        })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleEdit = () => {
    userEdited.current = true
    dirtyRef.current = true
  }

  const bgClass = COLOR_MAP[color] ?? COLOR_MAP.gray_background

  return (
    <div
      data-block-id={block.id}
      className={'rounded-lg px-4 py-3 flex items-start gap-3 ' + bgClass}
    >
      <div className="relative">
        <button
          onClick={() => {
            setShowIconPicker(!showIconPicker)
          }}
          className="text-xl leading-none hover:opacity-70 select-none"
        >
          {icon}
        </button>
        {showIconPicker && (
          <div className="absolute top-8 left-0 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-2 flex flex-wrap gap-1 w-48">
            {ICON_OPTIONS.map((opt) => (
              <button
                key={opt}
                onClick={() => {
                  setIcon(opt)
                  handleEdit()
                  setShowIconPicker(false)
                }}
                className="text-lg p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                {opt}
              </button>
            ))}
            <div className="w-full border-t border-gray-200 dark:border-gray-700 mt-1 pt-1">
              <div className="flex flex-wrap gap-1">
                {COLOR_OPTIONS.map((c) => (
                  <button
                    key={c}
                    onClick={() => {
                      setColor(c)
                      handleEdit()
                      setShowIconPicker(false)
                    }}
                    className={
                      'w-5 h-5 rounded-full border border-gray-300 dark:border-gray-600 ' +
                      (COLOR_PREVIEW[c] ?? '') +
                      (c === color ? ' ring-2 ring-blue-500' : '')
                    }
                    title={c.replace('_background', '')}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          handleEdit()
        }}
        placeholder="Type something..."
        rows={1}
        className="flex-1 min-w-0 border-none outline-none focus:ring-0 bg-transparent text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-600 resize-none text-sm overflow-y-hidden"
        style={{ minHeight: '1.5rem' }}
      />
    </div>
  )
}
