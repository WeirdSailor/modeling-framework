// The operator's working plan as a draft-shaped overlay for MarginChart, AreaChart and
// Dashboard 2. It is never stored in `drafts`. Spec §8.4.
//
// No value imports (type-only imports are fine): loaded directly by `node --test`.

import type { DraftPlan, ModellingAction, UserId, WorkingPlanAction } from '@/models/types'

export const WORKING_PLAN_COLOR = '#22c55e'
export const WORKING_PLAN_NAME = 'Working plan'

export function workingPlanDraftId(user: UserId): string {
  return `wp:${user}`
}

/** Splits working-plan rows into plain actions plus the notes map drafts use. */
export function toModellingActions(plan: WorkingPlanAction[]): {
  actions: ModellingAction[]
  unitNotes: Record<string, string>
} {
  const unitNotes: Record<string, string> = {}
  const actions = plan.map(({ note, ...action }) => {
    if (note) unitNotes[action.bmUnitId] = note
    return action
  })
  return { actions, unitNotes }
}

export function workingPlanAsDraft(plan: WorkingPlanAction[] | undefined, user: UserId): DraftPlan | null {
  if (!plan || plan.length === 0) return null
  const { actions } = toModellingActions(plan)
  return {
    id: workingPlanDraftId(user),
    name: WORKING_PLAN_NAME,
    description: '',
    actions,
    status: 'draft',
    color: WORKING_PLAN_COLOR,
    fromPeriod: Math.min(...actions.map(a => a.fromPeriod)),
    toPeriod: 48,
    unitNotes: {},
    createdAt: 0,
    ownerId: user,
    sharedWith: [],
  }
}
