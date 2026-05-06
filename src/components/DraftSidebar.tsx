'use client'

import { useState } from 'react'
import type { DraftPlan, SettlementPeriodData } from '@/models/types'

interface Props {
  drafts: DraftPlan[]
  activeId: string | null
  onSelect: (id: string) => void
  onCreate: () => void
  showArchive: boolean
  setShowArchive: (v: boolean) => void
  settlementPeriods: SettlementPeriodData[]
  isLoading: boolean
  onRefresh: () => void
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

function slotTime(slot: number, periods: SettlementPeriodData[]): string {
  const sp = periods.find(s => s.settlementPeriod === slot)
  return sp ? sp.startTime.slice(11, 16) : `SP ${slot}`
}

function DraftListItem({ draft, active, onClick, periods }: {
  draft: DraftPlan
  active: boolean
  onClick: () => void
  periods: SettlementPeriodData[]
}) {
  const unitCount = new Set(draft.actions.map(a => a.bmUnitId)).size
  const from = slotTime(draft.fromPeriod, periods)
  const to   = slotTime(draft.toPeriod,   periods)
  return (
    <li
      className={['draft-item', active ? 'active' : '', 'state-' + draft.status].join(' ')}
      onClick={onClick}
    >
      <div className="draft-item-row">
        <span className="draft-item-name">{draft.name}</span>
        <StateBadge status={draft.status} />
      </div>
      <div className="draft-item-row">
        <span className="draft-item-meta mono">{from} → {to}</span>
        <span className="draft-item-count">{unitCount} unit{unitCount !== 1 ? 's' : ''}</span>
      </div>
    </li>
  )
}

export default function DraftSidebar({
  drafts, activeId, onSelect, onCreate, showArchive, setShowArchive,
  settlementPeriods, isLoading, onRefresh,
}: Props) {
  const [showCommitted, setShowCommitted] = useState(true)
  const editing   = drafts.filter(d => d.status === 'draft')
  const committed = drafts.filter(d => d.status === 'committed')
  const archive   = drafts.filter(d => d.status === 'discarded')

  const windowStart = settlementPeriods[0]?.startTime
  const windowEnd   = settlementPeriods[settlementPeriods.length - 1]?.startTime

  function fmtTime(iso: string): string {
    return iso.slice(11, 16)
  }

  return (
    <aside className="draft-sidebar">
      <div className="sidebar-head">
        <div className="brand">
          <div className="brand-mark" />
          <div className="brand-text">
            <span className="brand-title">BM Drafts</span>
            <span className="brand-sub">Balancing Mechanism</span>
          </div>
        </div>

        {windowStart && windowEnd && (
          <div className="sidebar-window">
            <span className="sidebar-window-time mono">
              {fmtTime(windowStart)} → {fmtTime(windowEnd)} UTC
            </span>
            <button
              className="sidebar-refresh"
              onClick={onRefresh}
              disabled={isLoading}
            >
              {isLoading ? '…' : 'Refresh'}
            </button>
          </div>
        )}

        <button className="btn btn-primary btn-block" onClick={onCreate}>
          <span className="plus">+</span> New draft
        </button>
      </div>

      <div className="sidebar-section">
        <div className="sidebar-label">
          <span>Editing</span>
          <span className="count-pill count-pill-sm">{editing.length}</span>
        </div>
        <ul className="draft-list">
          {editing.length === 0 && (
            <li className="draft-list-empty">No drafts in progress</li>
          )}
          {editing.map(d => (
            <DraftListItem
              key={d.id} draft={d} active={d.id === activeId}
              onClick={() => onSelect(d.id)} periods={settlementPeriods}
            />
          ))}
        </ul>
      </div>

      <div className="sidebar-section">
        <button
          className="sidebar-label-toggle"
          onClick={() => setShowCommitted(!showCommitted)}
        >
          <span>Committed</span>
          <span className="count-pill count-pill-sm">{committed.length}</span>
          <span className={`caret ${showCommitted ? 'open' : ''}`}>▾</span>
        </button>
        {showCommitted && (
          <ul className="draft-list">
            {committed.length === 0 && (
              <li className="draft-list-empty">No committed drafts</li>
            )}
            {committed.map(d => (
              <DraftListItem
                key={d.id} draft={d} active={d.id === activeId}
                onClick={() => onSelect(d.id)} periods={settlementPeriods}
              />
            ))}
          </ul>
        )}
      </div>

      <div className="sidebar-section">
        <button
          className="sidebar-label-toggle"
          onClick={() => setShowArchive(!showArchive)}
        >
          <span>Discarded</span>
          <span className="count-pill count-pill-sm">{archive.length}</span>
          <span className={`caret ${showArchive ? 'open' : ''}`}>▾</span>
        </button>
        {showArchive && (
          <ul className="draft-list">
            {archive.length === 0 && (
              <li className="draft-list-empty">Nothing discarded yet</li>
            )}
            {archive.map(d => (
              <DraftListItem
                key={d.id} draft={d} active={d.id === activeId}
                onClick={() => onSelect(d.id)} periods={settlementPeriods}
              />
            ))}
          </ul>
        )}
      </div>
    </aside>
  )
}
