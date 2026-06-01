import type { TemplateProvider } from './types'

const NOT_IMPLEMENTED = 'flowProvider: not implemented yet'

// Stub — filled in by the next commit. slashItemTitle MUST match items.ts.
export const flowProvider: TemplateProvider = {
  slashItemTitle: 'Flow panel',
  listQueryKey: ['panels', { skip: 0, limit: 500 }],
  prefetchList() {
    throw new Error(NOT_IMPLEMENTED)
  },
  readList() {
    throw new Error(NOT_IMPLEMENTED)
  },
  isListLoading() {
    throw new Error(NOT_IMPLEMENTED)
  },
  buildNodeJSON() {
    throw new Error(NOT_IMPLEMENTED)
  },
}
