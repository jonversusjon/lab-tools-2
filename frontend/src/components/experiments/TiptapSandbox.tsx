import { EditorContent, useEditor } from '@tiptap/react'
import { useState, useMemo } from 'react'
import { tiptapExtensions } from '@/blocks-tiptap/extensions'
import { filterJsonTree } from '@/utils/jsonFilter'

function makeColumnLayout(n: number) {
  const widthPct = 100 / n
  return {
    type: 'column_list',
    attrs: { column_count: n },
    content: Array.from({ length: n }, (_, i) => ({
      type: 'column',
      attrs: { width_pct: widthPct },
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Column ' + String(i + 1) }] }],
    })),
  }
}

const INITIAL_CONTENT = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Tiptap Sandbox' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'A scratchpad for verifying schema and NodeView rendering.' }] },
    { type: 'callout', attrs: { icon: '💡', color: 'blue', text: 'Hello from the sandbox' } },
    { type: 'horizontalRule' },
    {
      type: 'bulletList',
      content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'First bullet' }] }] },
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Second bullet' }] }] },
      ],
    },
    {
      type: 'orderedList',
      content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Step one' }] }] },
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Step two' }] }] },
      ],
    },
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Table example' }] },
    {
      type: 'table',
      content: [
        {
          type: 'tableRow',
          content: [
            { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Sample' }] }] },
            { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Result' }] }] },
          ],
        },
        {
          type: 'tableRow',
          content: [
            { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A1' }] }] },
            { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: '0.42' }] }] },
          ],
        },
      ],
    },
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Columns example' }] },
    {
      type: 'column_list',
      attrs: { column_count: 2 },
      content: [
        {
          type: 'column',
          attrs: { width_pct: 60 },
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Left column (60%)' }] }],
        },
        {
          type: 'column',
          attrs: { width_pct: 40 },
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Right column (40%)' }] }],
        },
      ],
    },
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Panels side-by-side' }] },
    {
      type: 'column_list',
      attrs: { column_count: 2 },
      content: [
        {
          type: 'column',
          attrs: { width_pct: 50 },
          content: [
            {
              type: 'flow_panel',
              attrs: {
                source_panel_id: null,
                name: 'Sandbox demo panel',
                instrument: null,
                targets: [],
                assignments: [],
                volume_params: {
                  num_samples: 1,
                  volume_per_sample_ul: 100,
                  pipet_error_factor: 1.1,
                  dilution_source: 'flow',
                },
              },
            },
          ],
        },
        {
          type: 'column',
          attrs: { width_pct: 50 },
          content: [
            {
              type: 'if_panel',
              attrs: {
                source_panel_id: null,
                name: 'Sandbox IF demo panel',
                panel_type: 'IF',
                microscope: null,
                view_mode: 'simple',
                targets: [],
                assignments: [],
                volume_params: {
                  num_samples: 1,
                  volume_per_sample_ul: 200,
                  pipet_error_factor: 1.1,
                  dilution_source: 'icc_if',
                },
              },
            },
          ],
        },
      ],
    },
    { type: 'paragraph', content: [{ type: 'text', text: 'End of seed content.' }] },
  ],
}

export default function TiptapSandbox() {
  const [json, setJson] = useState<unknown>(INITIAL_CONTENT)
  const [jsonFilter, setJsonFilter] = useState('')
  const [copied, setCopied] = useState(false)

  const filteredJson = useMemo(() => {
    if (!jsonFilter.trim()) return json
    return filterJsonTree(json, jsonFilter.toLowerCase())
  }, [json, jsonFilter])

  const editor = useEditor({
    extensions: tiptapExtensions,
    content: INITIAL_CONTENT,
    onUpdate: ({ editor }) => setJson(editor.getJSON()),
  })

  function insertColumnLayout(n: number) {
    editor?.chain().focus().insertContent(makeColumnLayout(n)).run()
  }

  async function handleCopyJson() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(filteredJson, null, 2))
      setCopied(true)
      setTimeout(() => setCopied(false), 1000)
    } catch {
      // clipboard API unavailable — silent no-op
    }
  }

  return (
    <div className="w-full px-[5vw] py-6 space-y-6">
      <h1 className="text-2xl font-bold dark:text-gray-100">Tiptap Sandbox</h1>
      <div className="flex gap-2 text-sm">
        <button
          onClick={() => insertColumnLayout(2)}
          className="px-3 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
        >
          Insert 2 columns
        </button>
        <button
          onClick={() => insertColumnLayout(3)}
          className="px-3 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
        >
          Insert 3 columns
        </button>
        <button
          onClick={() => insertColumnLayout(4)}
          className="px-3 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
        >
          Insert 4 columns
        </button>
      </div>
      <div className="prose dark:prose-invert max-w-none border border-gray-200 dark:border-gray-700 rounded p-4">
        <EditorContent editor={editor} />
      </div>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={jsonFilter}
            onChange={(e) => setJsonFilter(e.target.value)}
            placeholder="Filter JSON (e.g. column_list)"
            className="flex-1 px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-900"
          />
          <button
            type="button"
            onClick={handleCopyJson}
            className="px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            {copied ? 'Copied!' : 'Copy JSON'}
          </button>
        </div>
        <details>
          <summary className="cursor-pointer text-sm text-gray-500 dark:text-gray-400">
            Editor JSON (debug)
          </summary>
          <pre className="mt-2 text-xs bg-gray-50 dark:bg-gray-900 p-3 rounded overflow-x-auto">
            {JSON.stringify(filteredJson, null, 2)}
          </pre>
        </details>
      </div>
    </div>
  )
}
