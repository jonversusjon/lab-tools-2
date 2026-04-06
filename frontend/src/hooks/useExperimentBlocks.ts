import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  createBlock,
  updateBlock,
  deleteBlock,
  reorderBlocks,
  snapshotPanel,
} from '@/api/experiments'
import type {
  ExperimentBlockCreate,
  ExperimentBlockUpdate,
  ExperimentBlockReorderItem,
  SnapshotPanelRequest,
} from '@/types'

export function useCreateBlock() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      experimentId,
      data,
    }: {
      experimentId: string
      data: ExperimentBlockCreate
    }) => createBlock(experimentId, data),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({
        queryKey: ['experiments', variables.experimentId],
      })
    },
  })
}

export function useUpdateBlock() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      experimentId,
      blockId,
      data,
    }: {
      experimentId: string
      blockId: string
      data: ExperimentBlockUpdate
    }) => updateBlock(experimentId, blockId, data),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({
        queryKey: ['experiments', variables.experimentId],
      })
    },
  })
}

export function useDeleteBlock() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      experimentId,
      blockId,
    }: {
      experimentId: string
      blockId: string
    }) => deleteBlock(experimentId, blockId),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({
        queryKey: ['experiments', variables.experimentId],
      })
    },
  })
}

export function useReorderBlocks() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      experimentId,
      blocks,
    }: {
      experimentId: string
      blocks: ExperimentBlockReorderItem[]
    }) => reorderBlocks(experimentId, blocks),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({
        queryKey: ['experiments', variables.experimentId],
      })
    },
  })
}

export function useSnapshotPanel() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      experimentId,
      data,
    }: {
      experimentId: string
      data: SnapshotPanelRequest
    }) => snapshotPanel(experimentId, data),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({
        queryKey: ['experiments', variables.experimentId],
      })
    },
  })
}
