'use client'

import type { DraftPlan, SettlementPeriodData } from '@/models/types'

interface Props {
  draft: DraftPlan
  settlementPeriods: SettlementPeriodData[]
  cost: number
  onChangeName: (name: string) => void
  onChangeFrom: (period: number) => void
  onChangeTo: (period: number) => void
  onCommit: () => void
  onDiscard: () => void
  onReopen: () => void
  onDelete: () => void
}

function StateBadge({ status }: { status: DraftPlan['status'] }) {
  const map = {
    draft:     { label: 'Draft',     cls: 'badge-state-draft' },
    committed: { label: 'Committed', cls: 'badge-state-committed' },
    discarded: { label: 'Discarded', cls: 'badge-state-discarded' },
  } as const
  const m = map[status]
  return <span className={`state-badge ${m.cls}`}>{m.label}</span>
}

function slotLabel(slot: number, periods: SettlementPeriodData[]): string {
  const sp = periods.find(s => s.settlementPeriod === slot)
  return sp ? sp.startTime.slice(11, 16) : `SP ${slot}`
}

function durationLabel(from: number, to: number): string {
  const mins = (to - from) * 30
  if (mins <= 0) return '—'
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h > 0 ? `${h}h ${m > 0 ? m + 'm' : ''}`.trim() : `${m}m`
}

function formatCost(cost: number): string {
  if (cost === 0) return '—'
  return '£' + Math.round(cost).toLocaleString('en-GB')
}

export default function DraftDetails({
  draft, settlementPeriods, cost,
  onChangeName, onChangeFrom, onChangeTo,
  onCommit, onDiscard, onReopen, onDelete,
}: Props) {
  const readOnly = draft.status !== 'draft'
  const unitCount = new Set(draft.actions.map(a => a.bmUnitId)).size
  const from = slotLabel(draft.fromPeriod, settlementPeriods)
  const to   = slotLabel(draft.toPeriod,   settlementPeriods)
  const duration = durationLabel(draft.fromPeriod, draft.toPeriod)

  const spOptions = settlementPeriods.map(sp => ({
    value: sp.settlementPeriod,
    label: `SP ${sp.settlementPeriod} · ${sp.startTime.slice(11, 16)}`,
  }))

  return (
    <div className="draft-details">
      <div className="dd-left">
        <div className="dd-name-row">
          {readOnly ? (
            <h1 className="dd-name">{draft.name}</h1>
          ) : (
            <input
              className="dd-name-input"
              value={draft.name}
              onChange={e => onChangeName(e.target.value)}
              placeholder="Untitled draft"
            />
          )}
          <StateBadge status={draft.status} />
        </div>
        <div className="dd-meta">
          <span className="dd-meta-item">
            <span className="dd-meta-label">Window</span>
            <span className="dd-meta-value mono">{from} → {to}</span>
          </span>
          <span className="dd-meta-item">
            <span className="dd-meta-label">Duration</span>
            <span className="dd-meta-value mono">{duration}</span>
          </span>
          <span className="dd-meta-item">
            <span className="dd-meta-label">Units</span>
            <span className="dd-meta-value mono">{unitCount}</span>
          </span>
          <span className="dd-meta-item">
            <span className="dd-meta-label">Cost</span>
            <span className="dd-meta-value mono">{formatCost(cost)}</span>
          </span>
        </div>
      </div>

      <div className="dd-right">
        <div className="time-pickers">
          <label className={`settle-select${readOnly ? ' disabled' : ''}`}>
            <span className="settle-label">From</span>
            <select
              value={draft.fromPeriod}
              onChange={e => onChangeFrom(Number(e.target.value))}
              disabled={readOnly}
            >
              {spOptions.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
          <span className="time-arrow">→</span>
          <label className={`settle-select${readOnly ? ' disabled' : ''}`}>
            <span className="settle-label">To</span>
            <select
              value={draft.toPeriod}
              onChange={e => onChangeTo(Number(e.target.value))}
              disabled={readOnly}
            >
              {spOptions.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="dd-actions">
          {draft.status === 'draft' && (
            <>
              <button className="btn btn-ghost" onClick={onDiscard}>Discard</button>
              <button
                className="btn btn-primary"
                onClick={onCommit}
                disabled={unitCount === 0}
                title={unitCount === 0 ? 'Add at least one unit before committing' : ''}
              >
                Commit draft
              </button>
            </>
          )}
          {draft.status === 'committed' && (
            <>
              <span className="dd-readonly-hint">Committed — read only</span>
              <button className="btn btn-ghost" onClick={onReopen}>Reopen</button>
            </>
          )}
          {draft.status === 'discarded' && (
            <>
              <span className="dd-readonly-hint">Discarded</span>
              <button className="btn btn-ghost" onClick={onReopen}>Restore</button>
              <button className="btn btn-danger-ghost" onClick={onDelete}>Delete</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
