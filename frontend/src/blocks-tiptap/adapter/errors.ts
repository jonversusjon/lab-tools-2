export class UnsupportedBlockTypeError extends Error {
  constructor(public readonly blockType: string, public readonly blockId: string) {
    super('Unsupported block type "' + blockType + '" (block id: ' + blockId + ')')
    this.name = 'UnsupportedBlockTypeError'
  }
}
