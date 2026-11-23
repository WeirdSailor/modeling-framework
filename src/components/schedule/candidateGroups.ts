// Candidate groups describe which units to inspect, independently of the action to take.
import type { CandidateRow } from './candidates'
import type { ActionType } from '@/models/types'

export const CANDIDATE_GROUPS = [
  { id: 'syncs', label: 'Syncs to SEL' },
  { id: 'deload', label: 'Deload to SEL' },
  { id: 'desyncs', label: 'Desyncs' },
  { id: 'all', label: 'All Units' },
  { id: 'inertia', label: 'Inertia' },
  { id: 'positiveRecovery', label: 'Positive Recovery Reserve' },
  { id: 'negativeRecovery', label: 'Negative Recovery Reserve' },
  { id: 'lowResponse', label: 'Low Response' },
  { id: 'highResponse', label: 'High Response' },
  { id: 'pullback', label: 'Constrained Pullback' },
] as const

export type CandidateGroup = typeof CANDIDATE_GROUPS[number]['id']

// Same prototype response capability set used by areaAggregates.
const RESPONSE_TYPES = new Set(['PS', 'NPSHYD', 'OCGT', 'CCGT'])
type GroupableRow = Pick<CandidateRow, 'qualifies' | 'running' | 'pn' | 'mel' | 'sel' | 'fuelType' | 'inertiaGvas'>

export function matchesCandidateGroup(row: GroupableRow, group: CandidateGroup): boolean {
  const upward = row.mel > row.pn
  const downward = row.running && row.pn > row.sel
  switch (group) {
    case 'syncs': return row.qualifies.includes('start')
    case 'deload': return row.qualifies.includes('deload')
    case 'desyncs': return row.qualifies.includes('desync')
    case 'all': return true
    case 'inertia': return row.inertiaGvas > 0
    case 'positiveRecovery': return upward
    case 'negativeRecovery': return downward
    case 'lowResponse': return RESPONSE_TYPES.has(row.fuelType) && row.running && upward
    case 'highResponse': return RESPONSE_TYPES.has(row.fuelType) && downward
    case 'pullback': return row.fuelType === 'WIND' && row.running
  }
}

/** Transitional automatic assignment, kept separate from candidate-list membership. */
export function candidateGroupAction(row: GroupableRow, group: CandidateGroup): ActionType | null {
  const preferred: ActionType[] = group === 'syncs' ? ['start']
    : group === 'deload' ? ['deload']
    : group === 'desyncs' || group === 'pullback' ? ['desync']
    : group === 'inertia' || group === 'positiveRecovery' || group === 'lowResponse' ? ['start', 'deload']
    : ['start', 'deload', 'desync']
  return preferred.find(type => row.qualifies.includes(type)) ?? null
}
