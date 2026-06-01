import type { QueryClient } from '@tanstack/react-query'
import type { Editor, Range } from '@tiptap/core'

export interface TemplateListItem {
  id: string
  name: string
  /** Short secondary line, e.g. instrument name or panel_type badge text */
  subtitle?: string
  /** Optional count text shown as a pill, e.g. "5 targets" */
  countLabel?: string
}

export interface TemplateProvider {
  /** Slash menu item title this provider attaches to (must match exactly). */
  readonly slashItemTitle: string
  /** TanStack queryKey used for the list prefetch. */
  readonly listQueryKey: readonly unknown[]
  /** Prefetch the list (and ONLY the list — not individual templates). */
  prefetchList(queryClient: QueryClient): Promise<void>
  /** Read the cached list synchronously for the omnibox. May return [] while loading. */
  readList(queryClient: QueryClient): TemplateListItem[]
  /** True if the prefetched list query is still loading or fetching. */
  isListLoading(queryClient: QueryClient): boolean
  /**
   * Fetch the full template by id and build a Tiptap node JSON ready for
   * editor.chain().insertContent(...). May hit the network if not cached.
   */
  buildNodeJSON(templateId: string, queryClient: QueryClient): Promise<Record<string, unknown>>
  /** Optional: post-insertion side effect (e.g. focus, toast). */
  onInserted?(editor: Editor, range: Range): void
}
