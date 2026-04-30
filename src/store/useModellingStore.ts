import { create } from 'zustand'
import type { BMUnit, SettlementPeriodData, ModellingAction } from '@/models/types'
import { computeAggregates } from '@/utils/margin'

function getTomorrow(): string {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
  return tomorrow.toISOString().split('T')[0]
}

function refreshAggregates(
  periods: SettlementPeriodData[],
  actions: ModellingAction[],
  units: BMUnit[]
): SettlementPeriodData[] {
  return periods.map(sp => {
    const aggregates = computeAggregates(sp, actions, units)
    return { ...sp, ...aggregates }
  })
}

interface ModellingState {
  // Core data
  units: BMUnit[]
  settlementPeriods: SettlementPeriodData[]
  modellingActions: ModellingAction[]
  selectedUnits: Set<string>
  selectedDate: string

  // Loading state
  isLoading: boolean
  error: string | null

  // Actions
  setUnits: (units: BMUnit[]) => void
  setSettlementPeriods: (periods: SettlementPeriodData[]) => void
  setSelectedDate: (date: string) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void

  toggleUnitSelection: (bmUnitId: string) => void
  clearSelection: () => void
  setSelectedUnits: (ids: Set<string>) => void

  addModellingAction: (action: ModellingAction) => void
  clearAllModelling: () => void
}

export const useModellingStore = create<ModellingState>((set) => ({
  // Initial state
  units: [],
  settlementPeriods: [],
  modellingActions: [],
  selectedUnits: new Set<string>(),
  selectedDate: getTomorrow(),
  isLoading: false,
  error: null,

  // Actions
  setUnits: (units) => set({ units }),
  setSettlementPeriods: (periods) =>
    set(state => ({
      settlementPeriods: refreshAggregates(periods, state.modellingActions, state.units),
    })),
  setSelectedDate: (date) => set({ selectedDate: date }),
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

  setSelectedUnits: (ids: Set<string>) => set({ selectedUnits: ids }),

  addModellingAction: (action) =>
    set(state => {
      const filtered = state.modellingActions.filter(
        a => !(a.bmUnitId === action.bmUnitId && a.fromPeriod === action.fromPeriod && a.toPeriod === action.toPeriod)
      )
      const newActions = [...filtered, action]
      return {
        modellingActions: newActions,
        settlementPeriods: refreshAggregates(state.settlementPeriods, newActions, state.units),
      }
    }),

  clearAllModelling: () =>
    set(state => {
      const updatedPeriods = refreshAggregates(state.settlementPeriods, [], state.units)
      return {
        modellingActions: [],
        settlementPeriods: updatedPeriods,
        selectedUnits: new Set<string>(),
      }
    }),
}))
