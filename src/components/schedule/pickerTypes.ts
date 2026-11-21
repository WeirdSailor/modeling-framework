import type { ActionType } from '@/models/types'
import type { CandidateRow } from './candidates'

/** Props shared by the three pickers (A, B, C). */
export interface PickerProps {
  rows: CandidateRow[]
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
