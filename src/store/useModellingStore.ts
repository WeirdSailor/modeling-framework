import { create } from 'zustand'
import type { BMUnit, SettlementPeriodData, ModellingAction, DraftPlan, OperationType, UserId, UnitSnapshot, ServiceType } from '@/models/types'
import { USERS } from '@/models/types'
import { computeAggregates } from '@/utils/margin'

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
  const committedActions = drafts
    .filter(d => d.status === 'committed')
    .flatMap(d => d.actions)
  return periods.map(sp => ({ ...sp, ...computeAggregates(sp, committedActions, units) }))
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
  commitDraft: (id: string) => void
  discardDraft: (id: string) => void
  reopenDraft: (id: string) => void
  deleteDraft: (id: string) => void
  clearAllDrafts: () => void
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

  setUnits: (units) => set({ units }),

  setSettlementPeriods: (periods) =>
    set(state => ({
      settlementPeriods: refreshAggregates(periods, state.drafts, state.units),
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
      const isCommitted = draft?.status === 'committed'
      const drafts = state.drafts.map(d =>
        d.id === draftId
          ? { ...d, actions: d.actions.filter(a => a.bmUnitId !== bmUnitId) }
          : d
      )
      return {
        drafts,
        settlementPeriods: isCommitted
          ? refreshAggregates(state.settlementPeriods, drafts, state.units)
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
      const needsRefresh = draft?.status === 'committed'
      return {
        drafts,
        settlementPeriods: needsRefresh
          ? refreshAggregates(state.settlementPeriods, drafts, state.units)
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
        settlementPeriods: draft.status === 'committed'
          ? refreshAggregates(state.settlementPeriods, drafts, state.units)
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
        committedAt: undefined,
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

  commitDraft: (id) =>
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
          ? { ...d, status: 'committed' as const, committedAt: Date.now(), dataSnapshot }
          : d
      )
      return {
        drafts,
        settlementPeriods: refreshAggregates(state.settlementPeriods, drafts, state.units),
      }
    }),

  discardDraft: (id) =>
    set(state => {
      const draft = state.drafts.find(d => d.id === id)
      const wasCommitted = draft?.status === 'committed'
      const drafts = state.drafts.map(d =>
        d.id === id ? { ...d, status: 'discarded' as const, discardedAt: Date.now() } : d
      )
      return {
        drafts,
        settlementPeriods: wasCommitted
          ? refreshAggregates(state.settlementPeriods, drafts, state.units)
          : state.settlementPeriods,
      }
    }),

  reopenDraft: (id) =>
    set(state => {
      const draft = state.drafts.find(d => d.id === id)
      const wasCommitted = draft?.status === 'committed'
      const drafts = state.drafts.map(d =>
        d.id === id
          ? { ...d, status: 'draft' as const, committedAt: undefined, discardedAt: undefined }
          : d
      )
      return {
        drafts,
        settlementPeriods: wasCommitted
          ? refreshAggregates(state.settlementPeriods, drafts, state.units)
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
      const hadCommitted = state.drafts.some(d => d.status === 'committed')
      return {
        drafts: [],
        activeDraftId: null,
        selectedUnits: new Set<string>(),
        settlementPeriods: hadCommitted
          ? refreshAggregates(state.settlementPeriods, [], state.units)
          : state.settlementPeriods,
      }
    }),
}))
