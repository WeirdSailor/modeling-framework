'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { ConstraintTileInput } from '@/models/types'
import {
  DENSE_MODE_SP_THRESHOLD,
  buildConstraintTileViewModel,
  formatDuration,
  formatHHMM,
  isActiveBand,
  sortConstraintRows,
  SP_MS,
  type ConstraintRowSummary,
  type ConstraintSortMode,
  type ConstraintTileViewModel,
  type WindowedCell,
} from '@/utils/constraintSummary'
import { buildDemo24hRun, buildDemo4hRuns, floorToSpMs } from '@/config/constraintFixtures'

const REFRESH_MS = 60_000 // move the "now" marker roughly once a minute, without refetching

interface ConstraintsTileProps {
  spCount: number // number of settlement periods in the dashboard's selected window
  onOpenConstraint?: (id: string) => void
}

export default function ConstraintsTile({ spCount, onOpenConstraint }: ConstraintsTileProps) {
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [sortMode, setSortMode] = useState<ConstraintSortMode>('firstViolation')
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), REFRESH_MS)
    return () => clearInterval(id)
  }, [])

  const input: ConstraintTileInput = useMemo(() => {
    const anchorMs = floorToSpMs(nowMs)
    const windowStartMs = anchorMs
    const windowEndMs = anchorMs + spCount * SP_MS
    const nowIso = new Date(nowMs).toISOString()
    if (spCount <= 8) {
      const { current, previous } = buildDemo4hRuns(nowMs)
      return { window: { start: new Date(windowStartMs).toISOString(), end: new Date(windowEndMs).toISOString() }, now: nowIso, current, previous }
    }
    const current = buildDemo24hRun(nowMs)
    return { window: { start: new Date(windowStartMs).toISOString(), end: new Date(windowEndMs).toISOString() }, now: nowIso, current }
  }, [nowMs, spCount])

  const vm = useMemo(() => buildConstraintTileViewModel(input), [input])

  const sortedRows = useMemo(() => sortConstraintRows(vm.activeRows, vm.nearRows, sortMode), [vm, sortMode])

  // Shared column template — guarantees any active/near cell keeps a minimum
  // visible width, and is identical across the aggregate strip + every row so
  // columns line up vertically (required even under heavy compression).
  const gridTemplateColumns = useMemo(() => {
    const important = vm.slotTimes.map((_, i) =>
      [...vm.activeRows, ...vm.nearRows].some(r => {
        const b = r.cells[i]?.band
        return b && b !== 'within' && b !== 'noData'
      }),
    )
    return important.map(imp => (imp ? 'minmax(6px,1fr)' : '1fr')).join(' ')
  }, [vm])

  const denseMode = vm.denseMode
  const showTimeframe = vm.slotTimes.length

  if (showTimeframe === 0) {
    return <ConstraintsTileSkeleton />
  }

  const changesLine = buildChangesLine(vm)

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        background: 'var(--bg-panel)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        marginBottom: 12,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '14px 16px 10px', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Active constraints</div>
          <div style={{ fontSize: 11, color: 'var(--text-soft)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
            {formatWindowRange(vm.windowStartMs, vm.windowEndMs)} · settlement periods · forecast run {formatHHMM(new Date(vm.runTime).getTime())}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <Kpi value={vm.totals.active} label="Active" color="var(--red)" />
          <Kpi value={vm.totals.near} label="Near" color="var(--amber)" />
          <Kpi value={vm.totals.peakTogether} label="Peak together" color="var(--text)" />
          <SortToggle mode={sortMode} onChange={setSortMode} />
        </div>
      </div>

      {/* Changes since previous run */}
      {changesLine && (
        <div style={{
          margin: '0 16px 10px', padding: '7px 12px', borderRadius: 6,
          border: '1px solid var(--border)', background: 'var(--bg-subtle)',
          fontSize: 11, color: 'var(--text-muted)', display: 'flex', flexWrap: 'wrap', gap: 6,
        }}>
          {changesLine}
        </div>
      )}

      {vm.activeRows.length === 0 && vm.nearRows.length === 0 ? (
        <EmptyState vm={vm} />
      ) : (
        <>
          {/* Aggregate strip + time axis */}
          <div style={{ padding: '0 16px', display: 'grid', gridTemplateColumns: '150px minmax(0,1fr) 90px 150px 120px 110px 70px', gap: 6, alignItems: 'end' }}>
            <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-faint)', paddingBottom: 4 }}>
              Active count
            </div>
            <div style={{ position: 'relative' }}>
              <div style={{ display: 'grid', gridTemplateColumns, gap: denseMode ? 1 : 3, alignItems: 'end', height: 34 }}>
                {vm.slotTimes.map((_, i) => {
                  const count = vm.activeCountPerSlot[i]
                  const h = vm.totals.peakTogether > 0 ? Math.max(2, (count / vm.totals.peakTogether) * 30) : 2
                  return (
                    <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: 34 }}>
                      {!denseMode && count > 0 && (
                        <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginBottom: 1 }}>{count}</span>
                      )}
                      <div
                        className={count > 0 ? 'cc-cell-active2' : 'cc-cell-within'}
                        style={{ width: '100%', height: h, borderRadius: 1 }}
                      />
                    </div>
                  )
                })}
              </div>
              <NowMarker vm={vm} top={0} bottom={0} />
            </div>
            <div /><div /><div /><div /><div />
          </div>

          {/* Time axis */}
          <TimeAxis vm={vm} gridTemplateColumns={gridTemplateColumns} denseMode={denseMode} />

          {/* Rows */}
          <div style={{ padding: '2px 16px 6px' }}>
            {sortedRows.map(row => (
              <ConstraintRow
                key={row.id}
                row={row}
                vm={vm}
                gridTemplateColumns={gridTemplateColumns}
                denseMode={denseMode}
                onOpen={() => onOpenConstraint?.(row.id)}
                containerRef={containerRef}
              />
            ))}
          </div>

          {/* Collapsed within-limits line */}
          <div style={{ padding: '8px 16px 12px', fontSize: 11, color: 'var(--text-soft)', borderTop: '1px solid var(--border)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <span>+{vm.withinCount} within limits all window</span>
            {vm.closestWithinLimits && (
              <span>· closest: <span className="mono">{vm.closestWithinLimits.id}</span> at {Math.round(vm.closestWithinLimits.worstUtilisationPct)}% ({formatHHMM(vm.closestWithinLimits.worstAtMs)})</span>
            )}
          </div>
        </>
      )}

      {/* Footer legend */}
      <Footer />
    </div>
  )
}

/** "HH:MM–HH:MM" when the window stays within one UTC day, else "DD/MM HH:MM – DD/MM HH:MM". */
function formatWindowRange(startMs: number, endMs: number): string {
  const s = new Date(startMs), e = new Date(endMs)
  const sameDay = s.getUTCFullYear() === e.getUTCFullYear() && s.getUTCMonth() === e.getUTCMonth() && s.getUTCDate() === e.getUTCDate()
  if (sameDay) return `${formatHHMM(startMs)}–${formatHHMM(endMs)}`
  const dd = (d: Date) => `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`
  return `${dd(s)} ${formatHHMM(startMs)} – ${dd(e)} ${formatHHMM(endMs)}`
}

// ── Header pieces ───────────────────────────────────────────────────────

function Kpi({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div style={{ textAlign: 'right' }}>
      <div style={{ fontSize: 18, fontWeight: 800, color, fontFamily: 'var(--font-mono)', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 8, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-faint)' }}>{label}</div>
    </div>
  )
}

function SortToggle({ mode, onChange }: { mode: ConstraintSortMode; onChange: (m: ConstraintSortMode) => void }) {
  const opts: { id: ConstraintSortMode; label: string }[] = [
    { id: 'firstViolation', label: 'First violation' },
    { id: 'severity', label: 'Severity' },
  ]
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <span style={{ fontSize: 9, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '.06em', marginRight: 2 }}>Sort</span>
      <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
        {opts.map(o => (
          <button
            key={o.id}
            type="button"
            aria-pressed={mode === o.id}
            onClick={() => onChange(o.id)}
            style={{
              padding: '4px 9px', fontSize: 11, border: 0, cursor: 'pointer',
              background: mode === o.id ? 'var(--accent)' : 'var(--bg-subtle)',
              color: mode === o.id ? '#fff' : 'var(--text-muted)',
            }}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Changes-since-previous-run line ────────────────────────────────────

function buildChangesLine(vm: ConstraintTileViewModel): string | null {
  const { new: n, cleared: c, worse: w } = vm.changes
  if (n.length === 0 && c.length === 0 && w.length === 0) return null
  const parts: string[] = []
  if (n.length) parts.push(`${n.length} new ${n.map(r => r.id).join(', ')}`)
  if (c.length) {
    parts.push(c.map(r => {
      const at = r.previousWorstAtMs != null ? ` at ${formatHHMM(r.previousWorstAtMs)}` : ''
      const util = r.previousWorstUtilisationPct != null ? `${Math.round(r.previousWorstUtilisationPct)}%` : '?'
      return `1 cleared ${r.id} (was ${util}${at})`
    }).join(' · '))
  }
  if (w.length) {
    parts.push(w.map(r => {
      const prev = r.previousWorstUtilisationPct != null ? `${Math.round(r.previousWorstUtilisationPct)}%` : '?'
      const cur = r.worstUtilisationPct != null ? `${Math.round(r.worstUtilisationPct)}%` : '?'
      return `1 worse ${r.id} ${prev} → ${cur}`
    }).join(' · '))
  }
  return parts.join(' · ')
}

// ── Time axis ────────────────────────────────────────────────────────────

function TimeAxis({ vm, gridTemplateColumns, denseMode }: { vm: ConstraintTileViewModel; gridTemplateColumns: string; denseMode: boolean }) {
  const totalHours = (vm.windowEndMs - vm.windowStartMs) / 3_600_000
  const tickStepSp = totalHours <= 4 ? 1 : totalHours <= 12 ? 2 : 4
  return (
    <div style={{ padding: '2px 16px 4px', display: 'grid', gridTemplateColumns: '150px minmax(0,1fr) 90px 150px 120px 110px 70px', gap: 6 }}>
      <div />
      <div style={{ position: 'relative', display: 'grid', gridTemplateColumns, gap: denseMode ? 1 : 3 }}>
        {vm.slotTimes.map((t, i) => (
          <div key={i} style={{ fontSize: 9, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', textAlign: 'left' }}>
            {i % tickStepSp === 0 ? formatHHMM(t) : ''}
          </div>
        ))}
        <NowMarker vm={vm} top={0} bottom={0} />
      </div>
      <div style={{ fontSize: 9, color: 'var(--text-faint)' }}>WORST OVERLOAD</div>
      <div style={{ fontSize: 9, color: 'var(--text-faint)' }}>WORST UTILISATION</div>
      <div style={{ fontSize: 9, color: 'var(--text-faint)' }}>FIRST VIOLATION</div>
      <div style={{ fontSize: 9, color: 'var(--text-faint)' }}>VIOLATED FOR</div>
      <div style={{ fontSize: 9, color: 'var(--text-faint)' }}>WORST AT</div>
    </div>
  )
}

function NowMarker({ vm, top, bottom }: { vm: ConstraintTileViewModel; top: number; bottom: number }) {
  if (!vm.nowInWindow) return null
  const pct = ((vm.nowMs - vm.windowStartMs) / (vm.windowEndMs - vm.windowStartMs)) * 100
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute', left: `${pct}%`, top, bottom, width: 1,
        background: 'var(--accent)', opacity: 0.7, pointerEvents: 'none',
      }}
    />
  )
}

// ── Constraint row ───────────────────────────────────────────────────────

function ConstraintRow({ row, vm, gridTemplateColumns, denseMode, onOpen, containerRef }: {
  row: ConstraintRowSummary
  vm: ConstraintTileViewModel
  gridTemplateColumns: string
  denseMode: boolean
  onOpen: () => void
  containerRef: React.RefObject<HTMLDivElement | null>
}) {
  const isActive = row.status === 'active'
  const color = isActive ? 'var(--red)' : 'var(--amber)'

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={e => { if (e.key === 'Enter') onOpen() }}
      style={{
        display: 'grid', gridTemplateColumns: '150px minmax(0,1fr) 90px 150px 120px 110px 70px', gap: 6,
        alignItems: 'center', padding: '5px 0', cursor: 'pointer', borderRadius: 4,
      }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      {/* Name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        {isActive
          ? <span aria-hidden style={{ width: 8, height: 8, background: color, flexShrink: 0 }} />
          : <span aria-hidden style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />}
        <span className="mono" style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{row.id}</span>
        {row.change === 'new' && (
          <span style={{ fontSize: 8, fontWeight: 700, color: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: 3, padding: '1px 4px' }}>NEW</span>
        )}
      </div>

      {/* Time strip */}
      <div style={{ position: 'relative', display: 'grid', gridTemplateColumns, gap: denseMode ? 1 : 3 }}>
        {row.cells.map((cell, i) => (
          <Cell key={i} row={row} cell={cell} denseMode={denseMode} containerRef={containerRef} />
        ))}
        <NowMarker vm={vm} top={0} bottom={0} />
      </div>

      {/* Worst overload */}
      <div className="mono" style={{ fontSize: 11, textAlign: 'right', color: isActive ? 'var(--red)' : 'var(--text-faint)' }}>
        {row.worstOverloadMw == null ? '—' : isActive
          ? `+${Math.round(row.worstOverloadMw).toLocaleString()} MW`
          : `${Math.round(Math.abs(row.worstOverloadMw)).toLocaleString()} MW spare`}
      </div>

      {/* Worst utilisation bullet bar */}
      <WorstUtilisationBar utilisationPct={row.worstUtilisationPct} worstOverloadMw={row.worstOverloadMw} color={color} />

      {/* First violation */}
      <div style={{ fontSize: 11 }}>
        {row.timeUntilFirstViolation ? (
          <>
            <span className="mono" style={{ fontWeight: 700, color: 'var(--text)' }}>{row.timeUntilFirstViolation.primary}</span>
            {row.timeUntilFirstViolation.detail && (
              <span style={{ color: 'var(--text-faint)', marginLeft: 4 }}>{row.timeUntilFirstViolation.detail}</span>
            )}
          </>
        ) : <span style={{ color: 'var(--text-faint)' }}>—</span>}
      </div>

      {/* Violated for */}
      <div className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
        {isActive ? `${formatDuration(row.violatedDurationMs)} · ${row.violatedIntervalCount} int` : <span style={{ color: 'var(--text-faint)' }}>—</span>}
      </div>

      {/* Worst at */}
      <div className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
        {row.worstAtMs != null ? formatHHMM(row.worstAtMs) : '—'}
      </div>
    </div>
  )
}

// Bar position/colour are driven by utilisation % (calculation-only); the printed
// value is the margin in MW (limit - flow), per the operator's preferred units.
function WorstUtilisationBar({ utilisationPct, worstOverloadMw, color }: { utilisationPct: number | null; worstOverloadMw: number | null; color: string }) {
  if (utilisationPct == null || worstOverloadMw == null) return <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>—</div>
  const MIN = 85, MAX = 112
  const clamp = (v: number) => Math.max(MIN, Math.min(MAX, v))
  const pct = ((clamp(utilisationPct) - MIN) / (MAX - MIN)) * 100
  const hundredPct = ((100 - MIN) / (MAX - MIN)) * 100
  const marginMw = Math.round(-worstOverloadMw)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ position: 'relative', flex: 1, height: 6, background: 'var(--bg-subtle)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, background: color, borderRadius: 3 }} />
        <div style={{ position: 'absolute', left: `${hundredPct}%`, top: 0, bottom: 0, width: 1, background: 'var(--text-faint)' }} />
      </div>
      <span className="mono" style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)', width: 56, textAlign: 'right' }}>
        {marginMw > 0 ? `+${marginMw}` : marginMw} MW
      </span>
    </div>
  )
}

// ── Cell with tooltip ─────────────────────────────────────────────────────

function bandClass(band: WindowedCell['band']): string {
  switch (band) {
    case 'active1': return 'cc-cell-active1'
    case 'active2': return 'cc-cell-active2'
    case 'active3': return 'cc-cell-active3'
    case 'near': return 'cc-cell-near'
    case 'noData': return 'cc-cell-nodata'
    default: return 'cc-cell-within'
  }
}

function cellAriaLabel(row: ConstraintRowSummary, cell: WindowedCell): string {
  const start = formatHHMM(new Date(cell.start).getTime())
  const end = formatHHMM(new Date(cell.end).getTime())
  if (cell.band === 'noData' || cell.flowMw == null || cell.limitMw == null) {
    return `${row.id}, ${start} to ${end}, no data`
  }
  const margin = cell.limitMw - cell.flowMw
  const stateWord = isActiveBand(cell.band) ? 'active' : cell.band === 'near' ? 'near' : 'within limits'
  return `${row.id}, ${start} to ${end}, flow ${Math.round(cell.flowMw).toLocaleString()} MW, limit ${Math.round(cell.limitMw).toLocaleString()} MW, margin ${margin < 0 ? '−' : ''}${Math.round(Math.abs(margin)).toLocaleString()} MW, ${stateWord}`
}

function Cell({ row, cell, denseMode, containerRef }: {
  row: ConstraintRowSummary
  cell: WindowedCell
  denseMode: boolean
  containerRef: React.RefObject<HTMLDivElement | null>
}) {
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const label = cellAriaLabel(row, cell)
  const showValue = !denseMode && (cell.band === 'near' || isActiveBand(cell.band)) && cell.utilisationPct != null

  function showTip() {
    if (!ref.current || !containerRef.current) return
    const cr = containerRef.current.getBoundingClientRect()
    const er = ref.current.getBoundingClientRect()
    const x = Math.min(Math.max(er.left - cr.left + er.width / 2, 60), cr.width - 60)
    const y = er.top - cr.top
    setTip({ x, y })
  }

  return (
    <div
      ref={ref}
      tabIndex={0}
      role="img"
      aria-label={label}
      className={bandClass(cell.band)}
      onMouseEnter={showTip}
      onMouseLeave={() => setTip(null)}
      onFocus={showTip}
      onBlur={() => setTip(null)}
      style={{
        height: denseMode ? 22 : 26, borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center',
        outline: 'none',
      }}
    >
      {showValue && (
        <span className="mono" style={{ fontSize: 10, fontWeight: 700, color: 'var(--text)' }}>
          {Math.round((cell.limitMw as number) - (cell.flowMw as number))}
        </span>
      )}
      {tip && (
        <div style={{
          position: 'absolute', left: tip.x, top: tip.y, transform: 'translate(-50%, calc(-100% - 6px))',
          background: 'var(--bg-panel)', border: '1px solid var(--border-strong)', borderRadius: 6,
          padding: '6px 8px', fontSize: 11, color: 'var(--text)', whiteSpace: 'nowrap', zIndex: 20,
          boxShadow: 'var(--shadow-md)', pointerEvents: 'none',
        }}>
          {label}
        </div>
      )}
    </div>
  )
}

// ── Empty / loading states ─────────────────────────────────────────────

function EmptyState({ vm }: { vm: ConstraintTileViewModel }) {
  return (
    <div style={{ padding: '20px 16px 24px', textAlign: 'center' }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>No constraints forecast active in selected window</div>
      <div style={{ fontSize: 12, color: 'var(--text-soft)', marginTop: 4 }}>
        All {vm.activeRows.length + vm.nearRows.length + vm.withinCount} monitored constraints stay below 95% utilisation
      </div>
      {vm.closestWithinLimits && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
          Closest to limit: <span className="mono">{vm.closestWithinLimits.id}</span>{' '}
          at {Math.round(vm.closestWithinLimits.worstUtilisationPct)}% ({formatHHMM(vm.closestWithinLimits.worstAtMs)})
        </div>
      )}
    </div>
  )
}

export function ConstraintsTileSkeleton() {
  return (
    <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 12, padding: 16 }}>
      <div style={{ height: 14, width: 160, background: 'var(--bg-subtle)', borderRadius: 4, marginBottom: 10 }} />
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} style={{ height: 26, background: 'var(--bg-subtle)', borderRadius: 4, marginBottom: 6, opacity: 1 - i * 0.15 }} />
      ))}
    </div>
  )
}

// ── Footer legend ─────────────────────────────────────────────────────

function Footer() {
  const items: { cls: string; label: string }[] = [
    { cls: 'cc-cell-active1', label: '>100–103%' },
    { cls: 'cc-cell-active2', label: '>103–106%' },
    { cls: 'cc-cell-active3', label: '>106%' },
    { cls: 'cc-cell-near', label: '95–100% near' },
    { cls: 'cc-cell-within', label: '<95%' },
    { cls: 'cc-cell-nodata', label: 'no data' },
  ]
  return (
    <div style={{
      borderTop: '1px solid var(--border)', padding: '8px 16px', display: 'flex', alignItems: 'center',
      justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, fontSize: 10, color: 'var(--text-faint)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        {items.map(it => (
          <span key={it.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span className={it.cls} style={{ width: 14, height: 10, borderRadius: 2, display: 'inline-block' }} />
            {it.label}
          </span>
        ))}
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 1, height: 10, background: 'var(--accent)', display: 'inline-block' }} /> Now
        </span>
      </div>
      <span>Hover a period for flow, limit, margin · click a constraint for its detail view</span>
    </div>
  )
}
