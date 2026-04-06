import type { ExperimentBlock } from '@/types'

interface DividerBlockProps {
  block: ExperimentBlock
}

export default function DividerBlock({ block }: DividerBlockProps) {
  return (
    <div data-block-id={block.id} className="py-2">
      <hr className="border-gray-200 dark:border-gray-700" />
    </div>
  )
}
