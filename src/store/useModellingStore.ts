import { create } from 'zustand'
import type { BMUnit, SettlementPeriodData, ModellingAction } from '@/models/types'
import { computeAggregates } from '@/utils/margin'

function getTomorrow(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().split('T')[0]
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
  setSettlementPeriods: (periods) => set({ settlementPeriods: periods }),
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

  addModellingAction: (action) =>
    set(state => {
      const newActions = [...state.modellingActions, action]
      const updatedPeriods = refreshAggregates(state.settlementPeriods, newActions, state.units)
      return { modellingActions: newActions, settlementPeriods: updatedPeriods }
    }),

  clearAllModelling: () =>
    set(state => {
      const updatedPeriods = refreshAggregates(state.settlementPeriods, [], state.units)
      return { modellingActions: [], settlementPeriods: updatedPeriods }
    }),
}))
