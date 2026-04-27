import { EditorContent, useEditor } from '@tiptap/react'
import { useState } from 'react'
import { tiptapExtensions } from '@/blocks-tiptap/extensions'

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
    { type: 'paragraph', content: [{ type: 'text', text: 'End of seed content.' }] },
  ],
}

export default function TiptapSandbox() {
  const [json, setJson] = useState<unknown>(INITIAL_CONTENT)

  const editor = useEditor({
    extensions: tiptapExtensions,
    content: INITIAL_CONTENT,
    onUpdate: ({ editor }) => setJson(editor.getJSON()),
  })

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold dark:text-gray-100">Tiptap Sandbox</h1>
      <div className="prose dark:prose-invert max-w-none border border-gray-200 dark:border-gray-700 rounded p-4">
        <EditorContent editor={editor} />
      </div>
      <details>
        <summary className="cursor-pointer text-sm text-gray-500 dark:text-gray-400">
          Editor JSON (debug)
        </summary>
        <pre className="mt-2 text-xs bg-gray-50 dark:bg-gray-900 p-3 rounded overflow-x-auto">
          {JSON.stringify(json, null, 2)}
        </pre>
      </details>
    </div>
  )
}
