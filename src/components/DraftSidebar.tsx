'use client'

import { useState } from 'react'
import type { DraftPlan, SettlementPeriodData, UserId } from '@/models/types'
import { USERS } from '@/models/types'

interface Props {
  drafts: DraftPlan[]
  activeId: string | null
  currentUser: UserId
  onSelectUser: (id: UserId) => void
  onSelect: (id: string) => void
  onCreate: () => void
  showArchive: boolean
  setShowArchive: (v: boolean) => void
  settlementPeriods: SettlementPeriodData[]
  isLoading: boolean
  onRefresh: () => void
  hiddenDraftIds: Set<string>
  onToggleChartVisibility: (id: string) => void
  sidebarOpen: boolean
  onToggleSidebar: () => void
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

function DraftListItem({ draft, active, onClick, periods, sharedBy, isHidden, onToggleVisibility }: {
  draft: DraftPlan
  active: boolean
  onClick: () => void
  periods: SettlementPeriodData[]
  sharedBy?: string
  isHidden?: boolean
  onToggleVisibility?: () => void
}) {
  const from = slotTime(draft.fromPeriod, periods)
  const to   = slotTime(draft.toPeriod,   periods)
  return (
    <li
      className={['draft-item', active ? 'active' : '', 'state-' + draft.status].join(' ')}
      onClick={onClick}
    >
      <div className="draft-item-row">
        {draft.status === 'draft' && onToggleVisibility && (
          <button
            title={isHidden ? 'Show on chart' : 'Hide from chart'}
            onClick={e => { e.stopPropagation(); onToggleVisibility(); }}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: 0, marginRight: 5, flexShrink: 0,
              display: 'flex', alignItems: 'center',
            }}
          >
            <span style={{
              display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
              background: isHidden ? 'transparent' : draft.color,
              border: `2px solid ${isHidden ? 'var(--text-soft)' : draft.color}`,
              transition: 'background 0.15s, border-color 0.15s',
            }} />
          </button>
        )}
        <span className="draft-item-name">{draft.name}</span>
      </div>
      <div className="draft-item-row">
        <span className="draft-item-meta mono">{from} → {to}</span>
        <StateBadge status={draft.status} />
      </div>
      {sharedBy && (
        <div className="draft-item-row">
          <span style={{ fontSize: 10, color: 'var(--text-soft)', fontStyle: 'italic' }}>
            from {sharedBy}
          </span>
        </div>
      )}
    </li>
  )
}

export default function DraftSidebar({
  drafts, activeId, currentUser, onSelectUser, onSelect, onCreate,
  showArchive, setShowArchive, settlementPeriods, isLoading, onRefresh,
  hiddenDraftIds, onToggleChartVisibility, sidebarOpen, onToggleSidebar,
}: Props) {
  const [showCommitted, setShowCommitted] = useState(true)
  const [showShared, setShowShared] = useState(true)

  const myDrafts   = drafts.filter(d => d.ownerId === currentUser)
  const editing    = myDrafts.filter(d => d.status === 'draft')
  const committed  = myDrafts.filter(d => d.status === 'committed')
  const archive    = myDrafts.filter(d => d.status === 'discarded')
  const sharedWithMe = drafts.filter(d =>
    d.ownerId !== currentUser && d.sharedWith.includes(currentUser)
  )

  const windowStart = settlementPeriods[0]?.startTime
  const windowEnd   = settlementPeriods[settlementPeriods.length - 1]?.startTime

  function fmtTime(iso: string): string {
    return iso.slice(11, 16)
  }

  return (
    <aside className="draft-sidebar">
      <button
        className="sidebar-collapse-btn"
        onClick={onToggleSidebar}
        title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
      >
        {sidebarOpen ? '‹' : '›'}
      </button>
      <div className="sidebar-head">
        <div className="brand">
          <div className="brand-mark" />
          <div className="brand-text">
            <span className="brand-title">BM Drafts</span>
            <span className="brand-sub">Balancing Mechanism</span>
          </div>
        </div>

        {/* Identity picker */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '8px 0 4px' }}>
          <span style={{ fontSize: 11, color: 'var(--text-soft)', flexShrink: 0 }}>You are:</span>
          <select
            value={currentUser}
            onChange={e => onSelectUser(e.target.value as UserId)}
            style={{ flex: 1, fontSize: 12, fontWeight: 600 }}
          >
            {USERS.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
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

      </div>

      <div className="sidebar-scroll">
      {editing.length > 0 && (
        <div className="sidebar-section">
          <div className="sidebar-label">
            <span>Editing</span>
            <span className="count-pill count-pill-sm">{editing.length}</span>
          </div>
          <ul className="draft-list">
            {editing.map(d => (
              <DraftListItem
                key={d.id} draft={d} active={d.id === activeId}
                onClick={() => onSelect(d.id)} periods={settlementPeriods}
                isHidden={hiddenDraftIds.has(d.id)}
                onToggleVisibility={() => onToggleChartVisibility(d.id)}
              />
            ))}
          </ul>
        </div>
      )}

      {committed.length > 0 && (
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
              {committed.map(d => (
                <DraftListItem
                  key={d.id} draft={d} active={d.id === activeId}
                  onClick={() => onSelect(d.id)} periods={settlementPeriods}
                />
              ))}
            </ul>
          )}
        </div>
      )}

      {archive.length > 0 && (
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
              {archive.map(d => (
                <DraftListItem
                  key={d.id} draft={d} active={d.id === activeId}
                  onClick={() => onSelect(d.id)} periods={settlementPeriods}
                />
              ))}
            </ul>
          )}
        </div>
      )}

      {sharedWithMe.length > 0 && (
        <div className="sidebar-section">
          <button
            className="sidebar-label-toggle"
            onClick={() => setShowShared(!showShared)}
          >
            <span>Shared with me</span>
            <span className="count-pill count-pill-sm">{sharedWithMe.length}</span>
            <span className={`caret ${showShared ? 'open' : ''}`}>▾</span>
          </button>
          {showShared && (
            <ul className="draft-list">
              {sharedWithMe.map(d => (
                <DraftListItem
                  key={d.id} draft={d} active={d.id === activeId}
                  onClick={() => onSelect(d.id)} periods={settlementPeriods}
                  sharedBy={d.ownerId}
                  isHidden={hiddenDraftIds.has(d.id)}
                  onToggleVisibility={() => onToggleChartVisibility(d.id)}
                />
              ))}
            </ul>
          )}
        </div>
      )}
      </div>

      <div className="sidebar-footer">
        <button className="btn btn-primary btn-block" onClick={onCreate}>
          <span className="plus">+</span> New draft
        </button>
      </div>
    </aside>
  )
}
