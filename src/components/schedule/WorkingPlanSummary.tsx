'use client'

// Working plan summary (spec §8.3): per-type MW totals, worst margin before → after, and one
// editable row per action.

import { useMemo } from 'react'
import type {
  ActionType, AreaRequirementRow, BMUnit, ModellingAction, OperationType, SettlementPeriodData,
  WorkingPlanAction, WorkingPlanPatch,
} from '@/models/types'
import { ACTION_TYPES, OPERATION_TYPE_LABELS } from '@/models/types'
import { actionTypeOf, changeMw, covers } from '@/utils/actionEffects'
import { applyDraftToBaseline } from '@/utils/margin'
import { ActionChip, REASON_LABEL, describeChange, fmtMw, slotLabel } from './scheduleUi'

const OPERATION_TYPES = Object.keys(OPERATION_TYPE_LABELS) as OperationType[]
const REASON_CODES = Object.keys(REASON_LABEL) as ModellingAction['reasonCode'][]
const DIMMED_OUTPUT: Record<ActionType, string> = { start: '', deload: 'SEL', deloadZero: '0', desync: '0', capacity: '—', unusable: '—', allocate: '—' }

interface Props {
  plan: WorkingPlanAction[]
  settlementPeriods: SettlementPeriodData[]
  units: BMUnit[]
  promotedActions: ModellingAction[]
  planWindow: { fromPeriod: number; toPeriod: number }
  reservePct: number
  generalReserveRequirements: AreaRequirementRow[]
  onUpdate: (bmUnitId: string, patch: WorkingPlanPatch) => void
  onRemove: (bmUnitId: string) => void
  onClear: () => void
  onCommit: () => void
}

export default function WorkingPlanSummary({
  plan, settlementPeriods, units, promotedActions, planWindow, reservePct, generalReserveRequirements,
  onUpdate, onRemove, onClear, onCommit,
}: Props) {
  const unitById = useMemo(() => new Map(units.map(u => [u.bmUnitId, u])), [units])
  const spBySlot = useMemo(() => new Map(settlementPeriods.map(sp => [sp.settlementPeriod, sp])), [settlementPeriods])

  const totals = useMemo(() => {
    const t: Record<ActionType, number> = { start: 0, deload: 0, deloadZero: 0, desync: 0, capacity: 0, unusable: 0, allocate: 0 }
    for (const a of plan) {
      const sp = spBySlot.get(a.fromPeriod)
      if (sp) t[actionTypeOf(a)] += changeMw(actionTypeOf(a), a.bmUnitId, sp, unitById.get(a.bmUnitId))
    }
    return t
  }, [plan, spBySlot, unitById])

  // Worst EMX − TR2 over the Schedule window, without and with the plan (same TR2 as MarginChart).
  const worst = useMemo(() => {
    const genReq = new Map(generalReserveRequirements.map(r => [r.sp, r.requirement]))
    let before = Infinity, after = Infinity
    for (const sp of settlementPeriods) {
      const n = sp.settlementPeriod
      if (n < planWindow.fromPeriod || n > planWindow.toPeriod) continue
      const tr2 = sp.demand * (1 + reservePct / 100) + (genReq.get(n) ?? 0)
      const alreadyModelled = new Set<string>()
      for (const [u, pn] of Object.entries(sp.pn)) if (pn > 1) alreadyModelled.add(u)
      for (const a of promotedActions) if (covers(a, n)) alreadyModelled.add(a.bmUnitId)
      const withPlan = applyDraftToBaseline(sp, sp.emx, sp.eol, sp.emi, plan, alreadyModelled, units)
      before = Math.min(before, sp.emx - tr2)
      after = Math.min(after, withPlan.emx - tr2)
    }
    return Number.isFinite(before) ? { before, after } : null
  }, [settlementPeriods, planWindow, reservePct, generalReserveRequirements, promotedActions, plan, units])

  const slotOptions = settlementPeriods.map(sp => (
    <option key={sp.settlementPeriod} value={sp.settlementPeriod}>{slotLabel(sp.settlementPeriod, settlementPeriods)}</option>
  ))
  const signed = (n: number) => `${n >= 0 ? '+' : '−'}${fmtMw(Math.abs(n))}`

  return (
    <>
      <div className="schedule-section-head">
        <strong>Working plan</strong>
        <span className="schedule-hint">{plan.length} action{plan.length === 1 ? '' : 's'}</span>
        {ACTION_TYPES.filter(t => plan.some(a => actionTypeOf(a) === t)).map(t => (
          <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <ActionChip type={t} /> <span className="mono">{signed(totals[t])} MW</span>
          </span>
        ))}
        {worst && plan.length > 0 && (
          <span className="schedule-hint">
            Worst margin in window: {signed(worst.before)} → <strong style={{ color: worst.after < 0 ? '#ef4444' : '#22c55e' }}>{signed(worst.after)} MW</strong>
          </span>
        )}
        <span className="schedule-spacer" />
        <button className="btn btn-ghost" disabled={plan.length === 0} onClick={onClear}>Clear</button>
        <button className="btn btn-primary" disabled={plan.length === 0} onClick={onCommit}>Action…</button>
      </div>

      {plan.length === 0 ? (
        <div className="workspace-empty" style={{ padding: 24 }}>
          <p>No actions yet. Select units above and add them.</p>
        </div>
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>BMU</th><th>Action</th><th>Change</th><th>From</th><th>To</th>
                <th>Output</th><th>Reason</th><th>Event</th><th>Note</th><th />
              </tr>
            </thead>
            <tbody>
              {plan.map(a => {
                const type = actionTypeOf(a)
                const unit = unitById.get(a.bmUnitId)
                const name = unit?.nationalGridBmUnit ?? a.bmUnitId
                return (
                  <tr key={a.bmUnitId}>
                    <td>
                      <div className="bmu-cell-inner">
                        <span>{name}</span>
                        <span className="site-sub">{unit?.gspGroup ?? ''}</span>
                      </div>
                    </td>
                    <td><ActionChip type={type} /></td>
                    <td className="mono">{describeChange(a, spBySlot.get(a.fromPeriod), unit)}</td>
                    <td>
                      <select className="reason-select" value={a.fromPeriod}
                        onChange={e => {
                          const f = Number(e.target.value)
                          onUpdate(a.bmUnitId, a.toPeriod !== undefined && f > a.toPeriod ? { fromPeriod: f, toPeriod: f } : { fromPeriod: f })
                        }}>
                        {slotOptions}
                      </select>
                    </td>
                    <td>
                      <select className="reason-select" value={a.toPeriod ?? ''}
                        onChange={e => {
                          if (e.target.value === '') { onUpdate(a.bmUnitId, { toPeriod: undefined }); return }
                          const t = Number(e.target.value)
                          onUpdate(a.bmUnitId, t < a.fromPeriod ? { fromPeriod: t, toPeriod: t } : { toPeriod: t })
                        }}>
                        <option value="">—</option>
                        {slotOptions}
                      </select>
                    </td>
                    <td>
                      {type === 'start' ? (
                        <input type="number" className="reason-select" style={{ width: 80 }} min={0} value={a.outputLevel}
                          onChange={e => { const v = Number(e.target.value); if (!Number.isNaN(v)) onUpdate(a.bmUnitId, { outputLevel: Math.max(0, v) }) }} />
                      ) : (
                        <span style={{ color: 'var(--text-faint)' }}>{DIMMED_OUTPUT[type]}</span>
                      )}
                    </td>
                    <td>
                      <select className="reason-select" value={a.reasonCode}
                        onChange={e => onUpdate(a.bmUnitId, { reasonCode: e.target.value as ModellingAction['reasonCode'] })}>
                        {REASON_CODES.map(r => <option key={r} value={r}>{REASON_LABEL[r]}</option>)}
                      </select>
                    </td>
                    <td>
                      <select className="reason-select" value={a.operationType ?? ''}
                        onChange={e => onUpdate(a.bmUnitId, { operationType: e.target.value === '' ? undefined : e.target.value as OperationType })}>
                        <option value="">—</option>
                        {OPERATION_TYPES.map(o => <option key={o} value={o} title={OPERATION_TYPE_LABELS[o]}>{o}</option>)}
                      </select>
                    </td>
                    <td>
                      <input className="reason-select" placeholder="Note" value={a.note ?? ''}
                        onChange={e => onUpdate(a.bmUnitId, { note: e.target.value })} />
                    </td>
                    <td>
                      <button className="btn btn-ghost" aria-label={`Remove ${name}`} onClick={() => onRemove(a.bmUnitId)}>✕</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
