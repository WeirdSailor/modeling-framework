import { create } from 'zustand'
import type {
  ActionType, AreaRequirementRow, BMUnit, DraftPlan, ModellingAction, OperationType, ServiceType,
  SettlementPeriodData, UnitSnapshot, UserId, WorkingPlanAction, WorkingPlanPatch,
} from '@/models/types'
import { USERS } from '@/models/types'
import { computeAggregates } from '@/utils/margin'
import { computeAreaAvailabilities } from '@/utils/areaAggregates'
import { slotValues } from '@/utils/actionEffects'
import { toModellingActions } from '@/utils/workingPlan'

const DRAFT_COLORS = ['#f59e0b', '#8b5cf6', '#06b6d4', '#f97316', '#ec4899']

function getStoredUser(): UserId {
  if (typeof window === 'undefined') return 'NSE'
  const stored = localStorage.getItem('bm-current-user')
  return (USERS as readonly string[]).includes(stored ?? '') ? stored as UserId : 'NSE'
}

function refreshAggregates(
  periods: SettlementPeriodData[],
  drafts: DraftPlan[],
  units: BMUnit[]
): SettlementPeriodData[] {
  const promotedActions = drafts
    .filter(d => d.status === 'promoted')
    .flatMap(d => d.actions)
  return periods.map(sp => ({ ...sp, ...computeAggregates(sp, promotedActions, units) }))
}

const NON_MARGIN_AREA_IDS = [
  'recovery_reserve', 'freq_control_reserve', 'general_reserve',
  'contingency_reserve', 'response', 'inertia', 'voltage',
] as const

function initialAreaRequirements(): Record<string, AreaRequirementRow[]> {
  const result: Record<string, AreaRequirementRow[]> = {}
  for (const area of NON_MARGIN_AREA_IDS) {
    result[area] = Array.from({ length: 48 }, (_, i) => ({
      sp: i + 1, requirement: 0, contracted: 0, constrained: 0,
    }))
  }
  return result
}

// Runs both refreshAggregates (margin) and computeAreaAvailabilities (all other areas).
function refreshAllAggregates(
  periods: SettlementPeriodData[],
  drafts: DraftPlan[],
  units: BMUnit[],
  areaRequirements: Record<string, AreaRequirementRow[]>
): SettlementPeriodData[] {
  const promotedActions = drafts.filter(d => d.status === 'promoted').flatMap(d => d.actions)
  const withMargin = refreshAggregates(periods, drafts, units)
  return computeAreaAvailabilities(withMargin, promotedActions, units, areaRequirements)
}

interface ModellingState {
  units: BMUnit[]
  settlementPeriods: SettlementPeriodData[]
  drafts: DraftPlan[]
  activeDraftId: string | null
  selectedUnits: Set<string>
  isLoading: boolean
  error: string | null
  currentUser: UserId
  dataOverrides: Record<string, Partial<UnitSnapshot>>
  unitServices: Record<string, ServiceType>
  areaRequirements: Record<string, AreaRequirementRow[]>
  setAreaRequirement: (area: string, sp: number, field: 'requirement' | 'contracted' | 'constrained', value: number) => void
  fillAreaRequirements: (area: string, requirement?: number, contracted?: number, constrained?: number) => void
  setAllAreaRequirements: (reqs: Record<string, AreaRequirementRow[]>) => void
  areaThresholds: Record<string, number>
  // Scheduling Actions (spec §4.2): one working plan per operator, in memory only.
  workingPlans: Partial<Record<UserId, WorkingPlanAction[]>>
  workingPlanWindow: { fromPeriod: number; toPeriod: number }
  setWorkingPlanWindow: (fromPeriod: number, toPeriod: number) => void
  addToWorkingPlan: (items: { bmUnitId: string; actionType: ActionType }[], reasonCode?: ModellingAction['reasonCode']) => number
  updateWorkingPlanAction: (bmUnitId: string, patch: WorkingPlanPatch) => void
  removeFromWorkingPlan: (bmUnitId: string) => void
  clearWorkingPlan: () => void
  applyWindowToAll: () => void
  commitWorkingPlan: (name: string, description: string) => string | null
  setAreaThreshold: (area: string, value: number) => void
  setAllAreaThresholds: (thresholds: Record<string, number>) => void

  setUnits: (units: BMUnit[]) => void
  setSettlementPeriods: (periods: SettlementPeriodData[]) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void

  toggleUnitSelection: (bmUnitId: string) => void
  clearSelection: () => void
  setSelectedUnits: (ids: Set<string>) => void

  setDataOverride: (bmUnitId: string, field: keyof UnitSnapshot, value: number) => void
  clearDataOverride: (bmUnitId: string) => void
  clearAllDataOverrides: () => void

  setUnitService: (bmUnitId: string, service: ServiceType | undefined) => void

  setCurrentUser: (id: UserId) => void
  createDraft: () => string
  setActiveDraft: (id: string | null) => void
  addUnitsToDraft: (draftId: string, bmUnitIds: string[], reasonCode?: ModellingAction['reasonCode']) => void
  updateUnitReason: (draftId: string, bmUnitId: string, reasonCode: ModellingAction['reasonCode']) => void
  updateUnitOperationType: (draftId: string, bmUnitId: string, operationType: OperationType | undefined) => void
  updateUnitWindow: (draftId: string, bmUnitId: string, fromPeriod: number, toPeriod: number | undefined) => void
  removeUnitFromDraft: (draftId: string, bmUnitId: string) => void
  renameDraft: (id: string, name: string) => void
  updateDraftDescription: (id: string, description: string) => void
  updateDraftWindow: (id: string, fromPeriod: number, toPeriod: number) => void
  updateUnitNotes: (draftId: string, bmUnitId: string, notes: string) => void
  duplicateDraft: (id: string) => string
  shareDraft: (draftId: string, userId: UserId) => void
  unshareDraft: (draftId: string, userId: UserId) => void
  promoteDraft: (id: string) => void
  discardDraft: (id: string) => void
  reopenDraft: (id: string) => void
  deleteDraft: (id: string) => void
  clearAllDrafts: () => void
}

// Returns a state patch that replaces the current operator's working plan.
function withPlan(
  state: ModellingState,
  fn: (plan: WorkingPlanAction[]) => WorkingPlanAction[],
): Pick<ModellingState, 'workingPlans'> {
  const user = state.currentUser
  return { workingPlans: { ...state.workingPlans, [user]: fn(state.workingPlans[user] ?? []) } }
}

export const useModellingStore = create<ModellingState>((set, get) => ({
  units: [],
  settlementPeriods: [],
  drafts: [],
  activeDraftId: null,
  selectedUnits: new Set<string>(),
  isLoading: false,
  error: null,
  currentUser: getStoredUser(),
  dataOverrides: {},
  unitServices: {},
  areaRequirements: initialAreaRequirements(),
  areaThresholds: Object.fromEntries(NON_MARGIN_AREA_IDS.map(id => [id, 0])),

  workingPlans: {},
  workingPlanWindow: { fromPeriod: 1, toPeriod: 48 },

  setWorkingPlanWindow: (fromPeriod, toPeriod) => set({ workingPlanWindow: { fromPeriod, toPeriod } }),

  addToWorkingPlan: (items, reasonCode = 'MARGIN') => {
    const state = get()
    const user = state.currentUser
    const existing = new Set((state.workingPlans[user] ?? []).map(a => a.bmUnitId))
    const { fromPeriod, toPeriod } = state.workingPlanWindow
    const sp = state.settlementPeriods.find(s => s.settlementPeriod === fromPeriod)
    const added: WorkingPlanAction[] = []
    for (const { bmUnitId, actionType } of items) {
      if (existing.has(bmUnitId)) continue
      existing.add(bmUnitId)
      const unit = state.units.find(u => u.bmUnitId === bmUnitId)
      const outputLevel = actionType !== 'start'
        ? 0
        : sp ? slotValues(bmUnitId, sp, unit).startMel : (unit?.registeredCapacity ?? 0)
      added.push({ bmUnitId, actionType, fromPeriod, toPeriod, outputLevel, reasonCode, timestamp: new Date() })
    }
    if (added.length > 0) set(s => withPlan(s, plan => [...plan, ...added]))
    return added.length
  },

  updateWorkingPlanAction: (bmUnitId, patch) =>
    set(s => withPlan(s, plan => plan.map(a => (a.bmUnitId === bmUnitId ? { ...a, ...patch } : a)))),

  removeFromWorkingPlan: (bmUnitId) =>
    set(s => withPlan(s, plan => plan.filter(a => a.bmUnitId !== bmUnitId))),

  clearWorkingPlan: () => set(s => withPlan(s, () => [])),

  applyWindowToAll: () =>
    set(s => withPlan(s, plan => plan.map(a => ({
      ...a, fromPeriod: s.workingPlanWindow.fromPeriod, toPeriod: s.workingPlanWindow.toPeriod,
    })))),

  // Saves the plan as a new draft and promotes it with the existing promoteDraft, which
  // snapshots unit data and runs refreshAllAggregates. Spec §4.2.
  commitWorkingPlan: (name, description) => {
    const state = get()
    const user = state.currentUser
    const plan = state.workingPlans[user] ?? []
    if (plan.length === 0) return null
    const { actions, unitNotes } = toModellingActions(plan)
    const id = crypto.randomUUID()
    const draft: DraftPlan = {
      id, name, description, actions, status: 'draft',
      color: DRAFT_COLORS[state.drafts.length % DRAFT_COLORS.length],
      fromPeriod: Math.min(...actions.map(a => a.fromPeriod)),
      toPeriod: Math.max(...actions.map(a => a.toPeriod ?? 48)),
      unitNotes, createdAt: Date.now(), ownerId: user, sharedWith: [],
    }
    set(s => ({ drafts: [...s.drafts, draft], ...withPlan(s, () => []) }))
    get().promoteDraft(id)
    return id
  },

  setDataOverride: (bmUnitId, field, value) =>
    set(state => ({
      dataOverrides: {
        ...state.dataOverrides,
        [bmUnitId]: { ...state.dataOverrides[bmUnitId], [field]: value },
      },
    })),

  clearDataOverride: (bmUnitId) =>
    set(state => {
      const next = { ...state.dataOverrides }
      delete next[bmUnitId]
      return { dataOverrides: next }
    }),

  clearAllDataOverrides: () => set({ dataOverrides: {} }),

  setUnitService: (bmUnitId, service) =>
    set(state => {
      const next = { ...state.unitServices }
      if (service === undefined) delete next[bmUnitId]
      else next[bmUnitId] = service
      return { unitServices: next }
    }),

  setAreaRequirement: (area, sp, field, value) =>
    set(state => {
      const rows = (state.areaRequirements[area] ?? []).map(r =>
        r.sp === sp ? { ...r, [field]: value } : r
      )
      const newReqs = { ...state.areaRequirements, [area]: rows }
      const promotedActions = state.drafts.filter(d => d.status === 'promoted').flatMap(d => d.actions)
      return {
        areaRequirements: newReqs,
        settlementPeriods: computeAreaAvailabilities(state.settlementPeriods, promotedActions, state.units, newReqs),
      }
    }),

  fillAreaRequirements: (area, requirement, contracted, constrained) =>
    set(state => {
      const rows = (state.areaRequirements[area] ?? []).map(r => ({
        ...r,
        ...(requirement  !== undefined ? { requirement  } : {}),
        ...(contracted   !== undefined ? { contracted   } : {}),
        ...(constrained  !== undefined ? { constrained  } : {}),
      }))
      const newReqs = { ...state.areaRequirements, [area]: rows }
      const promotedActions = state.drafts.filter(d => d.status === 'promoted').flatMap(d => d.actions)
      return {
        areaRequirements: newReqs,
        settlementPeriods: computeAreaAvailabilities(state.settlementPeriods, promotedActions, state.units, newReqs),
      }
    }),

  setAllAreaRequirements: (reqs) =>
    set(state => {
      const promotedActions = state.drafts.filter(d => d.status === 'promoted').flatMap(d => d.actions)
      return {
        areaRequirements: reqs,
        settlementPeriods: computeAreaAvailabilities(state.settlementPeriods, promotedActions, state.units, reqs),
      }
    }),

  setAreaThreshold: (area, value) =>
    set(state => ({ areaThresholds: { ...state.areaThresholds, [area]: value } })),

  setAllAreaThresholds: (thresholds) => set({ areaThresholds: thresholds }),

  setUnits: (units) => set({ units }),

  setSettlementPeriods: (periods) =>
    set(state => ({
      settlementPeriods: refreshAllAggregates(periods, state.drafts, state.units, state.areaRequirements),
    })),

  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),

  toggleUnitSelection: (bmUnitId) =>
    set(state => {
      const next = new Set(state.selectedUnits)
      if (next.has(bmUnitId)) next.delete(bmUnitId)
      else next.add(bmUnitId)
      return { selectedUnits: next }
    }),

  clearSelection: () => set({ selectedUnits: new Set<string>() }),
  setSelectedUnits: (ids) => set({ selectedUnits: ids }),

  setCurrentUser: (id) => {
    localStorage.setItem('bm-current-user', id)
    set(state => {
      const myDrafts = state.drafts.filter(d => d.ownerId === id)
      const firstDraft = myDrafts.find(d => d.status === 'draft') ?? myDrafts[0]
      return { currentUser: id, activeDraftId: firstDraft?.id ?? null }
    })
  },

  createDraft: () => {
    const id = crypto.randomUUID()
    set(state => {
      const name = `Draft ${state.drafts.length + 1}`
      const color = DRAFT_COLORS[state.drafts.length % DRAFT_COLORS.length]
      const fromPeriod = state.settlementPeriods[0]?.settlementPeriod ?? 1
      const toPeriod = 48
      const newDraft: DraftPlan = {
        id, name, description: '', actions: [], status: 'draft', color,
        fromPeriod, toPeriod, unitNotes: {}, createdAt: Date.now(),
        ownerId: state.currentUser, sharedWith: [],
      }
      return { drafts: [...state.drafts, newDraft], activeDraftId: id }
    })
    return id
  },

  setActiveDraft: (id) => set({ activeDraftId: id }),

  addUnitsToDraft: (draftId, bmUnitIds, reasonCode = 'MARGIN') =>
    set(state => {
      const draft = state.drafts.find(d => d.id === draftId)
      if (!draft || draft.status !== 'draft') return {}
      const { fromPeriod, toPeriod } = draft
      const existingIds = new Set(draft.actions.map(a => a.bmUnitId))
      const newActions: ModellingAction[] = bmUnitIds
        .filter(id => !existingIds.has(id))
        .map(bmUnitId => {
          const unit = state.units.find(u => u.bmUnitId === bmUnitId)
          const outputLevel =
            unit?.sel != null && unit.sel > 0 ? unit.sel : (unit?.registeredCapacity ?? 100)
          return {
            bmUnitId,
            fromPeriod,
            toPeriod,
            outputLevel,
            reasonCode,
            timestamp: new Date(),
          }
        })
      if (newActions.length === 0) return {}
      const drafts = state.drafts.map(d =>
        d.id === draftId ? { ...d, actions: [...d.actions, ...newActions] } : d
      )
      return { drafts }
    }),

  removeUnitFromDraft: (draftId, bmUnitId) =>
    set(state => {
      const draft = state.drafts.find(d => d.id === draftId)
      const isPromoted = draft?.status === 'promoted'
      const drafts = state.drafts.map(d =>
        d.id === draftId
          ? { ...d, actions: d.actions.filter(a => a.bmUnitId !== bmUnitId) }
          : d
      )
      return {
        drafts,
        settlementPeriods: isPromoted
          ? refreshAllAggregates(state.settlementPeriods, drafts, state.units, state.areaRequirements)
          : state.settlementPeriods,
      }
    }),

  renameDraft: (id, name) =>
    set(state => ({
      drafts: state.drafts.map(d => d.id === id ? { ...d, name } : d),
    })),

  updateDraftDescription: (id, description) =>
    set(state => ({
      drafts: state.drafts.map(d => d.id === id ? { ...d, description } : d),
    })),

  updateDraftWindow: (id, fromPeriod, toPeriod) =>
    set(state => {
      const drafts = state.drafts.map(d =>
        d.id === id
          ? {
              ...d,
              fromPeriod,
              toPeriod,
              actions: d.actions.map(a => ({ ...a, fromPeriod, toPeriod })),
            }
          : d
      )
      const draft = state.drafts.find(d => d.id === id)
      const needsRefresh = draft?.status === 'promoted'
      return {
        drafts,
        settlementPeriods: needsRefresh
          ? refreshAllAggregates(state.settlementPeriods, drafts, state.units, state.areaRequirements)
          : state.settlementPeriods,
      }
    }),

  updateUnitNotes: (draftId, bmUnitId, notes) =>
    set(state => ({
      drafts: state.drafts.map(d =>
        d.id === draftId
          ? { ...d, unitNotes: { ...d.unitNotes, [bmUnitId]: notes } }
          : d
      ),
    })),

  updateUnitReason: (draftId, bmUnitId, reasonCode) =>
    set(state => ({
      drafts: state.drafts.map(d =>
        d.id === draftId
          ? { ...d, actions: d.actions.map(a => a.bmUnitId === bmUnitId ? { ...a, reasonCode } : a) }
          : d
      ),
    })),

  updateUnitOperationType: (draftId, bmUnitId, operationType) =>
    set(state => ({
      drafts: state.drafts.map(d =>
        d.id === draftId
          ? { ...d, actions: d.actions.map(a => a.bmUnitId === bmUnitId ? { ...a, operationType } : a) }
          : d
      ),
    })),

  updateUnitWindow: (draftId, bmUnitId, fromPeriod, toPeriod) =>
    set(state => {
      const draft = state.drafts.find(d => d.id === draftId)
      if (!draft) return {}
      const drafts = state.drafts.map(d =>
        d.id === draftId
          ? { ...d, actions: d.actions.map(a => a.bmUnitId === bmUnitId ? { ...a, fromPeriod, toPeriod } : a) }
          : d
      )
      return {
        drafts,
        settlementPeriods: draft.status === 'promoted'
          ? refreshAllAggregates(state.settlementPeriods, drafts, state.units, state.areaRequirements)
          : state.settlementPeriods,
      }
    }),

  duplicateDraft: (id) => {
    const newId = crypto.randomUUID()
    set(state => {
      const source = state.drafts.find(d => d.id === id)
      if (!source) return {}
      const color = DRAFT_COLORS[state.drafts.length % DRAFT_COLORS.length]
      const copy: DraftPlan = {
        ...source,
        id: newId,
        name: `Copy of ${source.name}`,
        status: 'draft',
        color,
        actions: source.actions.map(a => ({ ...a, timestamp: new Date() })),
        unitNotes: { ...source.unitNotes },
        createdAt: Date.now(),
        promotedAt: undefined,
        discardedAt: undefined,
        ownerId: state.currentUser,
        sharedWith: [],
      }
      return { drafts: [...state.drafts, copy], activeDraftId: newId }
    })
    return newId
  },

  shareDraft: (draftId, userId) =>
    set(state => ({
      drafts: state.drafts.map(d =>
        d.id === draftId && !d.sharedWith.includes(userId)
          ? { ...d, sharedWith: [...d.sharedWith, userId] }
          : d
      ),
    })),

  unshareDraft: (draftId, userId) =>
    set(state => ({
      drafts: state.drafts.map(d =>
        d.id === draftId
          ? { ...d, sharedWith: d.sharedWith.filter(u => u !== userId) }
          : d
      ),
    })),

  promoteDraft: (id) =>
    set(state => {
      const draft = state.drafts.find(d => d.id === id)
      if (!draft) return {}
      const dataSnapshot: Record<string, UnitSnapshot> = {}
      for (const action of draft.actions) {
        const u = state.units.find(u => u.bmUnitId === action.bmUnitId)
        if (!u) continue
        const ov = state.dataOverrides[action.bmUnitId] ?? {}
        dataSnapshot[action.bmUnitId] = {
          mel:        ov.mel        ?? u.registeredCapacity,
          sel:        ov.sel        ?? u.sel        ?? 0,
          ndz:        ov.ndz        ?? u.ndz        ?? 0,
          mzt:        ov.mzt        ?? u.mzt        ?? 0,
          mnzt:       ov.mnzt       ?? u.mnzt       ?? 0,
          priceToSel: ov.priceToSel ?? u.priceToSel ?? 0,
          priceToMel: ov.priceToMel ?? u.priceToMel ?? 0,
        }
      }
      const drafts = state.drafts.map(d =>
        d.id === id
          ? { ...d, status: 'promoted' as const, promotedAt: Date.now(), dataSnapshot }
          : d
      )
      return {
        drafts,
        settlementPeriods: refreshAllAggregates(state.settlementPeriods, drafts, state.units, state.areaRequirements),
      }
    }),

  discardDraft: (id) =>
    set(state => {
      const draft = state.drafts.find(d => d.id === id)
      const wasPromoted = draft?.status === 'promoted'
      const drafts = state.drafts.map(d =>
        d.id === id ? { ...d, status: 'discarded' as const, discardedAt: Date.now() } : d
      )
      return {
        drafts,
        settlementPeriods: wasPromoted
          ? refreshAllAggregates(state.settlementPeriods, drafts, state.units, state.areaRequirements)
          : state.settlementPeriods,
      }
    }),

  reopenDraft: (id) =>
    set(state => {
      const draft = state.drafts.find(d => d.id === id)
      const wasPromoted = draft?.status === 'promoted'
      const drafts = state.drafts.map(d =>
        d.id === id
          ? { ...d, status: 'draft' as const, promotedAt: undefined, discardedAt: undefined }
          : d
      )
      return {
        drafts,
        settlementPeriods: wasPromoted
          ? refreshAllAggregates(state.settlementPeriods, drafts, state.units, state.areaRequirements)
          : state.settlementPeriods,
      }
    }),

  deleteDraft: (id) =>
    set(state => {
      const drafts = state.drafts.filter(d => d.id !== id)
      const activeDraftId =
        state.activeDraftId === id ? (drafts.find(d => d.ownerId === state.currentUser)?.id ?? null) : state.activeDraftId
      return { drafts, activeDraftId }
    }),

  clearAllDrafts: () =>
    set(state => {
      const hadPromoted = state.drafts.some(d => d.status === 'promoted')
      return {
        drafts: [],
        activeDraftId: null,
        selectedUnits: new Set<string>(),
        workingPlans: {},
        settlementPeriods: hadPromoted
          ? refreshAllAggregates(state.settlementPeriods, [], state.units, state.areaRequirements)
          : state.settlementPeriods,
      }
    }),
}))
