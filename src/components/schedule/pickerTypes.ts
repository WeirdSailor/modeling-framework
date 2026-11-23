import type { ActionType } from '@/models/types'
import type { FilteredCandidateRow } from '@/utils/candidateFilters'

/** Props shared by the three pickers (A, B, C). */
export interface PickerProps {
  rows: FilteredCandidateRow[]
  activeAction: ActionType
  onActionChange: (type: ActionType) => void
  inPlan: Map<string, ActionType>   // units already in the working plan → their action type
  onAdd: (items: { bmUnitId: string; actionType: ActionType }[]) => void
  timeLabel: string                 // "DD|HH:MM" of the window's first slot
}

export function toggleIn(set: Set<string>, id: string): Set<string> {
  const next = new Set(set)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

export function setManyIn(set: Set<string>, ids: string[], on: boolean): Set<string> {
  const next = new Set(set)
  for (const id of ids) {
    if (on) next.add(id)
    else next.delete(id)
  }
  return next
}

export function filteredReason(row: FilteredCandidateRow): string | null {
  switch (row.category) {
    case 'constrained': return 'Excluded by Constraint filter'
    case 'contracted': return 'Excluded by AS Services filter'
    case 'highPrice': return 'Above maximum price'
    default: return null
  }
}
