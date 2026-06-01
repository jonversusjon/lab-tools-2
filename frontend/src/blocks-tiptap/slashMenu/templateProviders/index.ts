import type { TemplateProvider } from './types'
import { flowProvider } from './flowProvider'
import { ifProvider } from './ifProvider'

export const TEMPLATE_PROVIDERS: Record<string, TemplateProvider> = {
  [flowProvider.slashItemTitle]: flowProvider,
  [ifProvider.slashItemTitle]: ifProvider,
}

export function getProviderForItem(itemTitle: string): TemplateProvider | undefined {
  return TEMPLATE_PROVIDERS[itemTitle]
}

export type { TemplateProvider, TemplateListItem } from './types'
