'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import type { DraftPlan, SettlementPeriodData, UserId } from '@/models/types'
import { USERS } from '@/models/types'
import { SCENARIOS, GSP_AREAS } from '@/config/scenarios'

interface Props {
  draft: DraftPlan
  settlementPeriods: SettlementPeriodData[]
  currentUser: UserId
  onChangeName: (name: string) => void
  onChangeDescription: (description: string) => void
  onChangeFrom: (period: number) => void
  onChangeTo: (period: number) => void
  onCommit: () => void
  onDiscard: () => void
  onReopen: () => void
  onDelete: () => void
  onDuplicate: () => void
  onShare: (userId: UserId) => void
  onUnshare: (userId: UserId) => void
  scenario: string
  onScenarioChange: (s: string) => void
  gspFilter: Record<string, 'include' | 'exclude'>
  onGspFilterChange: (f: Record<string, 'include' | 'exclude'>) => void
  solveMw?: number | null
  onSolveMwChange?: (mw: number) => void
}


function slotLabel(slot: number, periods: SettlementPeriodData[]): string {
  const sp = periods.find(s => s.settlementPeriod === slot)
  return sp ? `${sp.startTime.slice(8, 10)}|${sp.startTime.slice(11, 16)}` : `SP ${slot}`
}


function usePopoverDismiss(
  popoverRef: React.RefObject<HTMLDivElement | null>,
  wrapperRef: React.RefObject<HTMLDivElement | null>,
  onClose: () => void,
) {
  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
        wrapperRef.current && !wrapperRef.current.contains(e.target as Node)
      ) onClose()
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])
}

function ScenarioPopover({ scenario, onChange, onClose, wrapperRef }: {
  scenario: string
  onChange: (s: string) => void
  onClose: () => void
  wrapperRef: React.RefObject<HTMLDivElement | null>
}) {
  const ref = useRef<HTMLDivElement>(null)
  usePopoverDismiss(ref, wrapperRef, onClose)

  return (
    <div ref={ref} style={{
      position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 50,
      background: 'var(--bg-panel)', border: '1px solid var(--border-strong)',
      borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.35)', width: 200, overflow: 'hidden',
    }}>
      <div style={{ padding: '7px 12px', borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-faint)' }}>Scenario</span>
      </div>
      {[{ id: 'none', name: 'No scenario' }, ...SCENARIOS].map(s => {
        const active = scenario === s.id
        return (
          <button key={s.id} onClick={() => { onChange(active ? 'none' : s.id); onClose() }} style={{
            display: 'block', width: '100%', textAlign: 'left',
            padding: '7px 12px', fontSize: 12, border: 'none', cursor: 'pointer',
            background: active ? 'rgba(79,70,229,.15)' : 'var(--bg-panel)',
            color: active ? '#a5b4fc' : 'var(--text)', fontWeight: active ? 600 : 400,
          }}>{s.name}</button>
        )
      })}
    </div>
  )
}

function GspFilterPopover({ gspFilter, onChange, onClose, wrapperRef }: {
  gspFilter: Record<string, 'include' | 'exclude'>
  onChange: (f: Record<string, 'include' | 'exclude'>) => void
  onClose: () => void
  wrapperRef: React.RefObject<HTMLDivElement | null>
}) {
  const ref = useRef<HTMLDivElement>(null)
  usePopoverDismiss(ref, wrapperRef, onClose)

  function setZone(id: string, seg: 'include' | 'exclude' | null) {
    const next = { ...gspFilter }
    if (seg === null) delete next[id]; else next[id] = seg
    onChange(next)
  }

  const includedIds = Object.entries(gspFilter).filter(([, v]) => v === 'include').map(([k]) => k)
  const excludedIds = Object.entries(gspFilter).filter(([, v]) => v === 'exclude').map(([k]) => k)

  return (
    <div ref={ref} style={{
      position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 50,
      background: 'var(--bg-panel)', border: '1px solid var(--border-strong)',
      borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.35)', width: 268, overflow: 'hidden',
    }}>
      <div style={{ padding: '7px 12px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-faint)' }}>GSP Groups</span>
        <button style={{ background: 'none', border: 0, color: '#6366f1', fontSize: 11, cursor: 'pointer', padding: '0 2px' }} onClick={() => onChange({})}>Clear all</button>
      </div>
      <div style={{ maxHeight: 280, overflowY: 'auto' }}>
        {GSP_AREAS.map(area => {
          const state = gspFilter[area.id] ?? null
          return (
            <div key={area.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 12px', gap: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--text)' }}>{area.label}</span>
              <div style={{ display: 'flex', border: '1px solid var(--border-strong)', borderRadius: 5, overflow: 'hidden', flexShrink: 0 }}>
                {(['include', null, 'exclude'] as const).map((seg, i) => {
                  const active = state === seg
                  const lbl = seg === 'include' ? '+' : seg === 'exclude' ? '−' : '·'
                  let bg = 'var(--bg-panel)', color = 'var(--text-faint)'
                  if (active && seg === 'include') { bg = 'rgba(5,150,105,.15)'; color = '#6ee7b7' }
                  if (active && seg === null)      { bg = 'var(--bg-subtle)';    color = 'var(--text)' }
                  if (active && seg === 'exclude') { bg = 'rgba(220,38,38,.15)'; color = '#fca5a5' }
                  return (
                    <button key={i} style={{
                      padding: '3px 8px', fontSize: 11, fontWeight: 600, background: bg, color,
                      border: 'none', borderRight: i < 2 ? '1px solid var(--border-strong)' : 'none',
                      cursor: 'pointer', lineHeight: 1.4,
                    }} aria-pressed={active} onClick={() => setZone(area.id, seg)}>{lbl}</button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
      {(includedIds.length > 0 || excludedIds.length > 0) && (
        <div style={{ padding: '6px 12px', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text-faint)' }}>
          {includedIds.length > 0 && <span>Showing: <span style={{ color: '#6ee7b7' }}>{includedIds.join(', ')}</span></span>}
          {includedIds.length > 0 && excludedIds.length > 0 && <span style={{ margin: '0 6px' }}>·</span>}
          {excludedIds.length > 0 && <span>Hiding: <span style={{ color: '#fca5a5' }}>{excludedIds.join(', ')}</span></span>}
        </div>
      )}
    </div>
  )
}

export default function DraftDetails({
  draft, settlementPeriods, currentUser,
  onChangeName, onChangeFrom, onChangeTo,
  onChangeDescription,
  onCommit, onDiscard, onReopen, onDelete, onDuplicate,
  onShare, onUnshare,
  scenario, onScenarioChange, gspFilter, onGspFilterChange,
  solveMw = null, onSolveMwChange,
}: Props) {
  const [shareOpen, setShareOpen] = useState(false)
  const [scenarioOpen, setScenarioOpen] = useState(false)
  const [gspOpen, setGspOpen] = useState(false)
  const scenarioWrapperRef = useRef<HTMLDivElement>(null)
  const gspWrapperRef = useRef<HTMLDivElement>(null)
  const closeScenario = useCallback(() => setScenarioOpen(false), [])
  const closeGsp = useCallback(() => setGspOpen(false), [])

  const isOwner = draft.ownerId === currentUser
  const readOnly = !isOwner || draft.status !== 'draft'
  const unitCount = new Set(draft.actions.map(a => a.bmUnitId)).size

  const spOptions = settlementPeriods.map(sp => ({
    value: sp.settlementPeriod,
    label: `${sp.startTime.slice(8, 10)}|${sp.startTime.slice(11, 16)}`,
  }))

  const availableToShare = USERS.filter(
    u => u !== draft.ownerId && !draft.sharedWith.includes(u)
  )

  return (
    <div className="draft-details">
      <div className="dd-left">
        <div className="dd-name-row">
          {/* Share icon — owner only */}
          {isOwner && (
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <button
                onClick={() => setShareOpen(v => !v)}
                title="Share"
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  background: shareOpen ? 'var(--bg-inset)' : 'none',
                  border: '1px solid var(--border-strong)',
                  borderRadius: 5, padding: '3px 7px', cursor: 'pointer',
                  color: draft.sharedWith.length > 0 ? '#6366f1' : 'var(--text-soft)',
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                  <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                </svg>
                {draft.sharedWith.length > 0 && (
                  <span style={{ fontSize: 10, fontWeight: 600 }}>{draft.sharedWith.length}</span>
                )}
              </button>
              {shareOpen && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 50,
                  background: 'var(--bg-panel)', border: '1px solid var(--border-strong)',
                  borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.35)',
                  minWidth: 160, overflow: 'hidden',
                }}>
                  <div style={{ padding: '7px 12px', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-faint)' }}>
                      Shared with
                    </span>
                  </div>
                  {draft.sharedWith.length === 0 && (
                    <div style={{ padding: '7px 12px', fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>Nobody yet</div>
                  )}
                  {draft.sharedWith.map(u => (
                    <div key={u} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '5px 12px', gap: 8, fontSize: 12, fontWeight: 600, color: 'var(--text)',
                    }}>
                      {u}
                      <button
                        onClick={() => onUnshare(u)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-soft)', padding: 0, fontSize: 14, lineHeight: 1 }}
                        title={`Unshare with ${u}`}
                      >×</button>
                    </div>
                  ))}
                  {availableToShare.length > 0 && (
                    <div style={{ borderTop: '1px solid var(--border)' }}>
                      {availableToShare.map(u => (
                        <button
                          key={u}
                          onClick={() => { onShare(u); setShareOpen(false) }}
                          style={{
                            display: 'block', width: '100%', textAlign: 'left',
                            background: 'none', border: 'none', cursor: 'pointer',
                            padding: '6px 12px', fontSize: 12, color: 'var(--text-soft)',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-inset)'; e.currentTarget.style.color = 'var(--text)' }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--text-soft)' }}
                        >
                          + {u}
                        </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
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
        <div className="dd-description-row">
          {readOnly ? (
            draft.description ? (
              <p className="dd-description" title={draft.description}>{draft.description}</p>
            ) : null
          ) : (
            <input
              className="dd-description-input"
              value={draft.description}
              onChange={e => onChangeDescription(e.target.value)}
              placeholder="Add a description…"
              title={draft.description || undefined}
            />
          )}
        </div>
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
          {solveMw !== null && solveMw !== undefined && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <button
                style={{ width: 22, height: 22, border: '1px solid rgba(239,68,68,0.4)', borderRadius: '4px 0 0 4px', background: 'rgba(239,68,68,0.08)', color: '#ef4444', fontSize: 14, lineHeight: 1, cursor: 'pointer', padding: 0 }}
                onClick={() => onSolveMwChange?.(solveMw - 50)}
              >−</button>
              <input
                type="number"
                value={Math.round(solveMw)}
                min={1}
                onChange={e => { const v = parseInt(e.target.value, 10); if (!isNaN(v)) onSolveMwChange?.(v) }}
                style={{
                  width: 72, height: 22, textAlign: 'center', fontSize: 12,
                  fontFamily: 'monospace', fontWeight: 700, color: '#ef4444',
                  background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)',
                  borderLeft: 'none', borderRight: 'none', outline: 'none',
                  MozAppearance: 'textfield',
                }}
              />
              <button
                style={{ width: 22, height: 22, border: '1px solid rgba(239,68,68,0.4)', borderRadius: '0 4px 4px 0', background: 'rgba(239,68,68,0.08)', color: '#ef4444', fontSize: 14, lineHeight: 1, cursor: 'pointer', padding: 0 }}
                onClick={() => onSolveMwChange?.(solveMw + 50)}
              >+</button>
            </div>
          )}
          <span style={{ width: 1, background: 'var(--border)', alignSelf: 'stretch', margin: '0 4px' }} />
          {/* Scenario */}
          {(() => {
            const active = scenario !== 'none'
            const activeScenario = SCENARIOS.find(s => s.id === scenario)
            return (
              <div ref={scenarioWrapperRef} style={{ position: 'relative' }}>
                <button style={{
                  border: `1px solid ${active ? '#4f46e5' : 'var(--border-strong)'}`,
                  borderRadius: 6, padding: '5px 10px', fontSize: 12, cursor: 'pointer',
                  background: active ? 'rgba(79,70,229,.1)' : 'var(--bg-panel)',
                  color: active ? '#a5b4fc' : 'var(--text-soft)',
                  display: 'flex', alignItems: 'center', gap: 6,
                }} onClick={() => setScenarioOpen(o => !o)}>
                  {activeScenario ? activeScenario.name : 'Scenario'} ▾
                </button>
                {scenarioOpen && <ScenarioPopover scenario={scenario} onChange={onScenarioChange} onClose={closeScenario} wrapperRef={scenarioWrapperRef} />}
              </div>
            )
          })()}
          {/* GSP */}
          {(() => {
            const incCount = Object.values(gspFilter).filter(v => v === 'include').length
            const excCount = Object.values(gspFilter).filter(v => v === 'exclude').length
            const active = incCount > 0 || excCount > 0
            const excOnly = excCount > 0 && incCount === 0
            return (
              <div ref={gspWrapperRef} style={{ position: 'relative' }}>
                <button style={{
                  border: `1px solid ${active ? (excOnly ? '#dc2626' : '#4f46e5') : 'var(--border-strong)'}`,
                  borderRadius: 6, padding: '5px 10px', fontSize: 12, cursor: 'pointer',
                  background: active ? (excOnly ? 'rgba(220,38,38,.1)' : 'rgba(79,70,229,.1)') : 'var(--bg-panel)',
                  color: active ? (excOnly ? '#fca5a5' : '#a5b4fc') : 'var(--text-soft)',
                  display: 'flex', alignItems: 'center', gap: 6,
                }} onClick={() => setGspOpen(o => !o)}>
                  GSP ▾
                  {incCount > 0 && <span style={{ background: '#4f46e5', color: '#fff', fontSize: 10, borderRadius: 999, padding: '1px 5px', fontWeight: 600 }}>+{incCount}</span>}
                  {excCount > 0 && <span style={{ background: '#dc2626', color: '#fff', fontSize: 10, borderRadius: 999, padding: '1px 5px', fontWeight: 600 }}>−{excCount}</span>}
                </button>
                {gspOpen && <GspFilterPopover gspFilter={gspFilter} onChange={onGspFilterChange} onClose={closeGsp} wrapperRef={gspWrapperRef} />}
              </div>
            )
          })()}
        </div>
      </div>


<div className="dd-right">
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
