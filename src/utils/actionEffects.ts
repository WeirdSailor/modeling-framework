// Scheduling Actions: which units each action type applies to, and each type's effect in one
// settlement period. Spec: Docs/superpowers/specs/2026-11-21-scheduling-actions-design.md §5–§6.
//
// No value imports (type-only imports are fine): `node --test` loads this file directly with
// type stripping and cannot resolve `@/` or extensionless relative imports.

import type { ActionType, BMUnit, ModellingAction, SettlementPeriodData } from '@/models/types'

// Copies of the sets in areaAggregates.ts, kept local because of the no-value-imports rule.
const SYNCHRONOUS_FUEL_TYPES = new Set(['CCGT', 'NUCLEAR', 'NPSHYD', 'OCGT', 'PS', 'COAL'])
const RESPONSE_FUEL_TYPES = new Set(['PS', 'NPSHYD', 'OCGT', 'CCGT'])
const RESERVE_AREAS = new Set(['recovery_reserve', 'freq_control_reserve', 'general_reserve', 'contingency_reserve'])

// PN above this counts as running (same threshold as isUnitPnCommitted in margin.ts).
const RUNNING_MW = 1

export type UnitInfo = Pick<BMUnit, 'fuelType' | 'registeredCapacity' | 'sel'>
type SlotData = Pick<SettlementPeriodData, 'pn' | 'mel' | 'mil'>

export interface SlotValues {
  pn: number        // physical notification this slot
  mel: number       // sp.mel, falling back to PN (as computeAggregates does)
  sel: number       // unit SEL, falling back to MIL (as today's EMI does)
  reg: number       // registered capacity
  startMel: number  // MEL a started unit adds: declared MEL if above 0, else registered capacity
}

export interface MarginDelta { emx: number; eol: number; emi: number }

const ZERO: MarginDelta = { emx: 0, eol: 0, emi: 0 }

export function actionTypeOf(action: Pick<ModellingAction, 'actionType'>): ActionType {
  return action.actionType ?? 'start'
}

/** True when the action's window includes this slot. `toPeriod` undefined = open-ended. */
export function covers(action: Pick<ModellingAction, 'fromPeriod' | 'toPeriod'>, slot: number): boolean {
  return action.fromPeriod <= slot && (action.toPeriod === undefined || action.toPeriod >= slot)
}

export function slotValues(bmUnitId: string, sp: SlotData, unit: UnitInfo | undefined): SlotValues {
  const pn = sp.pn[bmUnitId] ?? 0
  const declared = sp.mel[bmUnitId]
  const mel = declared ?? pn
  const sel = unit?.sel ?? sp.mil[bmUnitId] ?? 0
  const reg = unit?.registeredCapacity ?? mel
  const startMel = declared !== undefined && declared > 0 ? declared : (unit?.registeredCapacity ?? 0)
  return { pn, mel, sel, reg, startMel }
}

/** Spec §5. Model capacity assumes a running unit's MEL has been cut to its PN (spec D4). */
export function isCandidate(type: ActionType, bmUnitId: string, sp: SlotData, unit: UnitInfo | undefined): boolean {
  const v = slotValues(bmUnitId, sp, unit)
  const running = v.pn > RUNNING_MW
  switch (type) {
    case 'start':    return !running
    case 'deload':   return running && unit?.sel !== undefined && v.pn > unit.sel
    case 'desync':   return running
    case 'capacity': return running && v.reg > v.pn
  }
}

/** Spec §6.1. Change to EMX/EOL/EMI in one covered slot; zero where the action doesn't apply. */
export function marginDelta(
  action: Pick<ModellingAction, 'bmUnitId' | 'actionType' | 'outputLevel'>,
  sp: SlotData,
  unit: UnitInfo | undefined,
): MarginDelta {
  const v = slotValues(action.bmUnitId, sp, unit)
  const running = v.pn > RUNNING_MW
  switch (actionTypeOf(action)) {
    case 'start':    return running ? ZERO : { emx: v.startMel, eol: action.outputLevel, emi: v.sel }
    case 'deload':   return running && v.pn > v.sel ? { emx: 0, eol: -(v.pn - v.sel), emi: 0 } : ZERO
    case 'desync':   return running ? { emx: -v.mel, eol: -v.pn, emi: -v.sel } : ZERO
    case 'capacity': return running && v.reg > v.pn ? { emx: v.reg - v.pn, eol: 0, emi: 0 } : ZERO
  }
}

/**
 * Spec §6.2. Change to a non-margin area in one covered slot for Deload, Desync and Model capacity.
 * Returns 0 for Start (areaAggregates keeps unitAreaContribution for Start) and for 'margin'.
 */
export function areaDelta(
  action: Pick<ModellingAction, 'bmUnitId' | 'actionType'>,
  area: string,
  sp: SlotData,
  unit: UnitInfo | undefined,
): number {
  const type = actionTypeOf(action)
  if (type === 'start' || area === 'margin') return 0
  const v = slotValues(action.bmUnitId, sp, unit)
  if (v.pn <= RUNNING_MW) return 0
  const headroomArea = RESERVE_AREAS.has(area)
    || (area === 'response' && unit !== undefined && RESPONSE_FUEL_TYPES.has(unit.fuelType))
  switch (type) {
    case 'deload':   return headroomArea && v.pn > v.sel ? v.pn - v.sel : 0
    case 'capacity': return headroomArea && v.reg > v.pn ? v.reg - v.pn : 0
    case 'desync':
      if (headroomArea) return -Math.max(0, v.mel - v.pn)
      if (area === 'inertia') return unit !== undefined && SYNCHRONOUS_FUEL_TYPES.has(unit.fuelType) ? -v.reg * 0.05 : 0
      if (area === 'voltage') return -v.reg * 0.3
      return 0
  }
}

/** Signed MW figure shown in pickers and the summary: + for Start / Model capacity, − for reductions. */
export function changeMw(type: ActionType, bmUnitId: string, sp: SlotData, unit: UnitInfo | undefined): number {
  const v = slotValues(bmUnitId, sp, unit)
  switch (type) {
    case 'start':    return v.startMel
    case 'deload':   return 0 - Math.max(0, v.pn - v.sel)  // 0 - x avoids returning -0
    case 'desync':   return 0 - v.pn
    case 'capacity': return Math.max(0, v.reg - v.pn)
  }
}
