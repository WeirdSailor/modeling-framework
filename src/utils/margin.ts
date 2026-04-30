import type { BMUnit, SettlementPeriodData, ModellingAction } from '@/models/types'

// Returns true if the unit has a non-trivial PN (> 1 MW) in the given SP,
// OR if it appears in the modellingActions list for that SP.
export function isUnitCommitted(
  bmUnitId: string,
  sp: SettlementPeriodData,
  modellingActions: ModellingAction[]
): boolean {
  const pn = sp.pn[bmUnitId] ?? 0
  if (pn > 1) return true

  const spNum = sp.settlementPeriod
  return modellingActions.some(
    (action) =>
      action.bmUnitId === bmUnitId &&
      action.fromPeriod <= spNum &&
      action.toPeriod >= spNum
  )
}

// For a set of committed + modelled units, compute EMX for a SP.
// EMX = sum of MEL for all committed units + sum of MEL for modelled units.
export function calculateEmx(
  sp: SettlementPeriodData,
  modellingActions: ModellingAction[],
  units: BMUnit[]
): number {
  let emx = 0

  for (const unit of units) {
    if (isUnitCommitted(unit.bmUnitId, sp, modellingActions)) {
      emx += sp.mel[unit.bmUnitId] ?? 0
    }
  }

  return emx
}

// EOL = sum of PN for originally committed units + output level for modelled units.
export function calculateEol(
  sp: SettlementPeriodData,
  modellingActions: ModellingAction[]
): number {
  const spNum = sp.settlementPeriod

  // Sum of PN for originally committed units (PN > 1 MW, not just modelled)
  let eol = 0
  for (const [, pn] of Object.entries(sp.pn)) {
    if (pn > 1) {
      eol += pn
    }
  }

  // Add output levels for modelled units that are not already committed by PN
  for (const action of modellingActions) {
    if (action.fromPeriod <= spNum && action.toPeriod >= spNum) {
      const existingPn = sp.pn[action.bmUnitId] ?? 0
      if (existingPn <= 1) {
        // Not already counted via PN
        eol += action.outputLevel
      }
    }
  }

  return eol
}

// EMI = sum of SEL (or MIL if no SEL) for all committed + modelled units.
export function calculateEmi(
  sp: SettlementPeriodData,
  modellingActions: ModellingAction[],
  units: BMUnit[]
): number {
  let emi = 0

  for (const unit of units) {
    if (isUnitCommitted(unit.bmUnitId, sp, modellingActions)) {
      // Prefer SEL; fall back to MIL from sp.mil; if neither, 0
      const minimum =
        unit.sel !== undefined
          ? unit.sel
          : (sp.mil[unit.bmUnitId] ?? 0)
      emi += minimum
    }
  }

  return emi
}

// Compute all four aggregates for one SP.
export function computeAggregates(
  sp: SettlementPeriodData,
  modellingActions: ModellingAction[],
  units: BMUnit[]
): { emx: number; eol: number; emi: number; margin: number } {
  const emx = calculateEmx(sp, modellingActions, units)
  const eol = calculateEol(sp, modellingActions)
  const emi = calculateEmi(sp, modellingActions, units)
  const margin = emx - sp.demand

  return { emx, eol, emi, margin }
}
