export function computeSpilloverMatrix(
  _fluorophoreSpectra: Record<string, { emission: number[][] }>,
  _detectorConfigs: Array<{ filter_midpoint: number; filter_width: number }>,
  _fluorophoreIds: string[]
): number[][] {
  throw new Error('not implemented')
}
