'use client'

import { useState } from 'react'
import type { DraftPlan, SettlementPeriodData, UserId } from '@/models/types'
import { USERS } from '@/models/types'

interface Props {
  draft: DraftPlan
  settlementPeriods: SettlementPeriodData[]
  cost: number
  currentUser: UserId
  onChangeName: (name: string) => void
  onChangeFrom: (period: number) => void
  onChangeTo: (period: number) => void
  onCommit: () => void
  onDiscard: () => void
  onReopen: () => void
  onDelete: () => void
  onDuplicate: () => void
  onShare: (userId: UserId) => void
  onUnshare: (userId: UserId) => void
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
  draft, settlementPeriods, cost, currentUser,
  onChangeName, onChangeFrom, onChangeTo,
  onCommit, onDiscard, onReopen, onDelete, onDuplicate,
  onShare, onUnshare,
}: Props) {
  const [shareOpen, setShareOpen] = useState(false)

  const isOwner = draft.ownerId === currentUser
  const readOnly = !isOwner || draft.status !== 'draft'
  const unitCount = new Set(draft.actions.map(a => a.bmUnitId)).size
  const from = slotLabel(draft.fromPeriod, settlementPeriods)
  const to   = slotLabel(draft.toPeriod,   settlementPeriods)
  const duration = durationLabel(draft.fromPeriod, draft.toPeriod)

  const spOptions = settlementPeriods.map(sp => ({
    value: sp.settlementPeriod,
    label: `SP ${sp.settlementPeriod} · ${sp.startTime.slice(11, 16)}`,
  }))

  const availableToShare = USERS.filter(
    u => u !== draft.ownerId && !draft.sharedWith.includes(u)
  )

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
          {!isOwner && (
            <span style={{
              fontSize: 11, color: 'var(--text-soft)',
              background: 'var(--bg-inset)', border: '1px solid var(--border)',
              borderRadius: 4, padding: '2px 8px', whiteSpace: 'nowrap',
            }}>
              Shared by {draft.ownerId}
            </span>
          )}
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

        {/* Share controls — owner only */}
        {isOwner && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
            <span style={{ fontSize: 11, color: 'var(--text-soft)', flexShrink: 0 }}>Shared with:</span>
            {draft.sharedWith.length === 0 && (
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>nobody</span>
            )}
            {draft.sharedWith.map(u => (
              <span key={u} style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                fontSize: 11, fontWeight: 600,
                background: 'var(--bg-inset)', border: '1px solid var(--border)',
                borderRadius: 4, padding: '2px 6px',
              }}>
                {u}
                <button
                  onClick={() => onUnshare(u)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--text-soft)', padding: 0, fontSize: 13, lineHeight: 1,
                  }}
                  title={`Unshare with ${u}`}
                >×</button>
              </span>
            ))}
            {availableToShare.length > 0 && (
              <div style={{ position: 'relative' }}>
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: 11, padding: '2px 8px' }}
                  onClick={() => setShareOpen(v => !v)}
                >
                  + Share
                </button>
                {shareOpen && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, zIndex: 50,
                    background: 'var(--bg-panel)', border: '1px solid var(--border)',
                    borderRadius: 6, padding: 4, marginTop: 2,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                    minWidth: 100,
                  }}>
                    {availableToShare.map(u => (
                      <button
                        key={u}
                        onClick={() => { onShare(u); setShareOpen(false) }}
                        style={{
                          display: 'block', width: '100%', textAlign: 'left',
                          background: 'none', border: 'none', cursor: 'pointer',
                          padding: '5px 10px', fontSize: 12, fontWeight: 600,
                          color: 'var(--text)', borderRadius: 4,
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-inset)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                      >
                        {u}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
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
          {/* Owner actions */}
          {isOwner && draft.status === 'draft' && (
            <>
              <button className="btn btn-ghost" onClick={onDuplicate}>Duplicate</button>
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
          {isOwner && draft.status === 'committed' && (
            <>
              <span className="dd-readonly-hint">Committed — read only</span>
              <button className="btn btn-ghost" onClick={onDuplicate}>Duplicate</button>
              <button className="btn btn-ghost" onClick={onReopen}>Uncommit</button>
            </>
          )}
          {isOwner && draft.status === 'discarded' && (
            <>
              <span className="dd-readonly-hint">Discarded</span>
              <button className="btn btn-ghost" onClick={onDuplicate}>Duplicate</button>
              <button className="btn btn-ghost" onClick={onReopen}>Restore</button>
              <button className="btn btn-danger-ghost" onClick={onDelete}>Delete</button>
            </>
          )}
          {/* Shared-with-me: duplicate only */}
          {!isOwner && (
            <>
              <span className="dd-readonly-hint">View only</span>
              <button className="btn btn-ghost" onClick={onDuplicate}>Duplicate to my drafts</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
