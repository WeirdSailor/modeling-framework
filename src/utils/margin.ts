import type { BMUnit, SettlementPeriodData, ModellingAction } from '@/models/types'

// Returns true if the unit has a non-trivial PN (> 1 MW) in the given SP.
// Does not account for modelling actions — use computeAggregates for the full picture.
export function isUnitPnCommitted(bmUnitId: string, sp: SettlementPeriodData): boolean {
  return (sp.pn[bmUnitId] ?? 0) > 1
}

// Build a SEL lookup map from the reference units array.
function buildSelMap(units: BMUnit[]): Map<string, number | undefined> {
  return new Map(units.map(u => [u.bmUnitId, u.sel]))
}

// Compute EMX, EOL, EMI, and margin for a SP.
//
// Baseline: all units with PN > 1 MW (iterates sp.pn directly — not filtered
// through the reference units array, so committed units outside the dispatchable
// reference list are still counted).
//
// Actions: units covered by the supplied actions list are added on top of the
// baseline, skipping any unit already PN-committed to avoid double-counting.
export function computeAggregates(
  sp: SettlementPeriodData,
  actions: ModellingAction[],
  units: BMUnit[]
): { emx: number; eol: number; emi: number; margin: number } {
  const selMap = buildSelMap(units)
  const spNum = sp.settlementPeriod

  let emx = 0, eol = 0, emi = 0

  // Baseline — all PN-committed units (regardless of whether they appear in
  // the reference units list)
  for (const [bmUnit, pn] of Object.entries(sp.pn)) {
    if (pn > 1) {
      emx += sp.mel[bmUnit] ?? pn
      eol += pn
      const sel = selMap.get(bmUnit)
      emi += sel !== undefined ? sel : (sp.mil[bmUnit] ?? 0)
    }
  }

  // Modelled units — deduplicated per unit, skipped if already PN-committed
  const seen = new Set<string>()
  for (const action of actions) {
    if (action.fromPeriod <= spNum && (action.toPeriod === undefined || action.toPeriod >= spNum) && !seen.has(action.bmUnitId)) {
      seen.add(action.bmUnitId)
      if ((sp.pn[action.bmUnitId] ?? 0) <= 1) {
        emx += sp.mel[action.bmUnitId] ?? 0
        eol += action.outputLevel
        const sel = selMap.get(action.bmUnitId)
        emi += sel !== undefined ? sel : (sp.mil[action.bmUnitId] ?? 0)
      }
    }
  }

  return { emx, eol, emi, margin: emx - sp.demand }
}

// Apply a draft's actions on top of an already-computed baseline (sp.emx/eol/emi
// from the store, which already includes PN-committed units + any committed plan
// actions). Used by the chart to render per-draft dotted overlays without
// recomputing the full baseline from scratch each render.
//
// alreadyModelled: set of bmUnitIds already counted in the baseline for this SP
// (PN-committed + committed plan units). Draft units in this set are skipped.
export function applyDraftToBaseline(
  sp: SettlementPeriodData,
  baseEmx: number,
  baseEol: number,
  baseEmi: number,
  draftActions: ModellingAction[],
  alreadyModelled: Set<string>,
  units: BMUnit[]
): { emx: number; eol: number; emi: number; margin: number } {
  const selMap = buildSelMap(units)
  const spNum = sp.settlementPeriod

  let addEmx = 0, addEol = 0, addEmi = 0
  const seen = new Set<string>()

  for (const action of draftActions) {
    if (
      action.fromPeriod <= spNum &&
      (action.toPeriod === undefined || action.toPeriod >= spNum) &&
      !seen.has(action.bmUnitId) &&
      !alreadyModelled.has(action.bmUnitId)
    ) {
      seen.add(action.bmUnitId)
      addEmx += sp.mel[action.bmUnitId] ?? 0
      addEol += action.outputLevel
      const sel = selMap.get(action.bmUnitId)
      addEmi += sel !== undefined ? sel : (sp.mil[action.bmUnitId] ?? 0)
    }
  }

  const emx = baseEmx + addEmx
  const eol = baseEol + addEol
  const emi = baseEmi + addEmi
  return { emx, eol, emi, margin: emx - sp.demand }
}
