import type { BMUnit, SettlementPeriodData, ModellingAction } from '@/models/types'
import { actionTypeOf, covers, marginDelta } from '@/utils/actionEffects'

// Returns true if the unit has a non-trivial PN (> 1 MW) in the given SP.
// Does not account for modelling actions — use computeAggregates for the full picture.
export function isUnitPnCommitted(bmUnitId: string, sp: SettlementPeriodData): boolean {
  return (sp.pn[bmUnitId] ?? 0) > 1
}

function buildUnitMap(units: BMUnit[]): Map<string, BMUnit> {
  return new Map(units.map(u => [u.bmUnitId, u]))
}

// Compute EMX, EOL, EMI, and margin for a SP.
//
// Baseline: all units with PN > 1 MW (iterates sp.pn directly — not filtered
// through the reference units array, so committed units outside the dispatchable
// reference list are still counted).
//
// Actions: one action per unit per SP, each applying its type's change
// (actionEffects.marginDelta). Start does nothing for a unit that is already running,
// which is the old "skip if PN-committed" rule.
export function computeAggregates(
  sp: SettlementPeriodData,
  actions: ModellingAction[],
  units: BMUnit[]
): { emx: number; eol: number; emi: number; margin: number } {
  const unitMap = buildUnitMap(units)
  const spNum = sp.settlementPeriod

  let emx = 0, eol = 0, emi = 0

  // Baseline — all PN-committed units (regardless of whether they appear in
  // the reference units list)
  for (const [bmUnit, pn] of Object.entries(sp.pn)) {
    if (pn > 1) {
      emx += sp.mel[bmUnit] ?? pn
      eol += pn
      const sel = unitMap.get(bmUnit)?.sel
      emi += sel !== undefined ? sel : (sp.mil[bmUnit] ?? 0)
    }
  }

  const seen = new Set<string>()
  for (const action of actions) {
    if (!covers(action, spNum) || seen.has(action.bmUnitId)) continue
    seen.add(action.bmUnitId)
    const d = marginDelta(action, sp, unitMap.get(action.bmUnitId))
    emx += d.emx
    eol += d.eol
    emi += d.emi
  }

  return { emx, eol, emi, margin: emx - sp.demand }
}

// Apply a draft's actions on top of an already-computed baseline (sp.emx/eol/emi
// from the store, which already includes PN-committed units + any committed plan
// actions). Used by the charts to render per-draft dotted overlays without
// recomputing the full baseline from scratch each render.
//
// alreadyModelled: bmUnitIds already counted in the baseline for this SP
// (PN-committed + committed plan units). It only blocks Start actions: the other
// action types act on running units by definition.
export function applyDraftToBaseline(
  sp: SettlementPeriodData,
  baseEmx: number,
  baseEol: number,
  baseEmi: number,
  draftActions: ModellingAction[],
  alreadyModelled: Set<string>,
  units: BMUnit[]
): { emx: number; eol: number; emi: number; margin: number } {
  const unitMap = buildUnitMap(units)
  const spNum = sp.settlementPeriod

  let addEmx = 0, addEol = 0, addEmi = 0
  const seen = new Set<string>()

  for (const action of draftActions) {
    if (!covers(action, spNum) || seen.has(action.bmUnitId)) continue
    if (actionTypeOf(action) === 'start' && alreadyModelled.has(action.bmUnitId)) continue
    seen.add(action.bmUnitId)
    const d = marginDelta(action, sp, unitMap.get(action.bmUnitId))
    addEmx += d.emx
    addEol += d.eol
    addEmi += d.emi
  }

  const emx = baseEmx + addEmx
  const eol = baseEol + addEol
  const emi = baseEmi + addEmi
  return { emx, eol, emi, margin: emx - sp.demand }
}
