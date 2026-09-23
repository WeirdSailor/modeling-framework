'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ConstraintTileInput } from '@/models/types'
import {
  DENSE_MODE_SP_THRESHOLD,
  buildConstraintTileViewModel,
  formatHHMM,
  formatPeriodTooltip,
  isActiveBand,
  sortConstraintRows,
  SP_MS,
  type ConstraintRowSummary,
  type ConstraintSortMode,
  type ConstraintTileViewModel,
  type PeriodTooltipContent,
  type WindowedCell,
} from '@/utils/constraintSummary'
import { buildDemo24hRun, buildDemo4hRuns, floorToSpMs, getContractedServices } from '@/config/constraintFixtures'

const REFRESH_MS = 60_000 // move the "now" marker roughly once a minute, without refetching

const TOOLTIP_ID = 'constraint-period-tooltip'
const ROW_GRID_COLUMNS = '150px minmax(0,1fr)'

interface ActiveCell {
  row: ConstraintRowSummary
  index: number
  el: HTMLElement
}

interface SelectedCell {
  row: ConstraintRowSummary
  index: number
}

interface ConstraintsTileProps {
  spCount: number // number of settlement periods in the dashboard's selected window
  onOpenConstraint?: (id: string) => void
}

export default function ConstraintsTile({ spCount, onOpenConstraint }: ConstraintsTileProps) {
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [sortMode, setSortMode] = useState<ConstraintSortMode>('firstViolation')
  const containerRef = useRef<HTMLDivElement>(null)

  // Single shared tooltip instance for the whole tile — moving between adjacent
  // cells (mouse glide or arrow keys) never drops through a "hidden" state, so
  // it never re-fades; only a genuine show after being fully hidden fades in.
  const [activeCell, setActiveCell] = useState<ActiveCell | null>(null)
  const hideTimeoutRef = useRef<number | null>(null)

  // The persistent right-hand detail panel — set by clicking (or Enter-ing) a
  // cell; independent of the hover tooltip above.
  const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(null)
  const selectCell = useCallback((row: ConstraintRowSummary, index: number) => {
    setSelectedCell({ row, index })
  }, [])

  const showCellTooltip = useCallback((row: ConstraintRowSummary, index: number, el: HTMLElement) => {
    if (hideTimeoutRef.current != null) { window.clearTimeout(hideTimeoutRef.current); hideTimeoutRef.current = null }
    setActiveCell({ row, index, el })
  }, [])

  const scheduleHideTooltip = useCallback(() => {
    hideTimeoutRef.current = window.setTimeout(() => { setActiveCell(null); hideTimeoutRef.current = null }, 0)
  }, [])

  const hideTooltipImmediate = useCallback(() => {
    if (hideTimeoutRef.current != null) { window.clearTimeout(hideTimeoutRef.current); hideTimeoutRef.current = null }
    setActiveCell(null)
  }, [])

  useEffect(() => () => { if (hideTimeoutRef.current != null) window.clearTimeout(hideTimeoutRef.current) }, [])

  // Touch: a tap elsewhere while a tooltip is open (from the touch-tap-to-show
  // path in Cell) dismisses it.
  useEffect(() => {
    if (!activeCell) return
    function handlePointerDown(e: PointerEvent) {
      if (e.pointerType !== 'touch') return
      if (activeCell && !activeCell.el.contains(e.target as Node)) hideTooltipImmediate()
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [activeCell, hideTooltipImmediate])

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
            {formatWindowRange(vm.windowStartMs, vm.windowEndMs)} · settlement periods · last updated {formatHHMM(new Date(vm.runTime).getTime())}
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
          <div style={{ display: 'flex', alignItems: 'stretch' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
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
                    activeCell={activeCell}
                    selectedCell={selectedCell}
                    showCellTooltip={showCellTooltip}
                    scheduleHideTooltip={scheduleHideTooltip}
                    hideTooltipImmediate={hideTooltipImmediate}
                    selectCell={selectCell}
                  />
                ))}
              </div>
            </div>

            <DetailSidebar selected={selectedCell} />
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

      {activeCell && containerRef.current && (
        <PeriodTooltip
          content={formatPeriodTooltip(activeCell.row, activeCell.index)}
          cellEl={activeCell.el}
          containerEl={containerRef.current}
        />
      )}
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

function formatOverloadMw(mw: number | undefined): string {
  return mw != null ? `+${Math.round(mw).toLocaleString()} MW` : '?'
}

function buildChangesLine(vm: ConstraintTileViewModel): string | null {
  const { new: n, cleared: c, worse: w } = vm.changes
  if (n.length === 0 && c.length === 0 && w.length === 0) return null
  const parts: string[] = []
  if (n.length) parts.push(`${n.length} new ${n.map(r => r.id).join(', ')}`)
  if (c.length) {
    parts.push(c.map(r => {
      const at = r.previousWorstAtMs != null ? ` at ${formatHHMM(r.previousWorstAtMs)}` : ''
      return `1 cleared ${r.id} (was ${formatOverloadMw(r.previousWorstOverloadMw)}${at})`
    }).join(' · '))
  }
  if (w.length) {
    parts.push(w.map(r => `1 worse ${r.id} ${formatOverloadMw(r.previousWorstOverloadMw)} → ${formatOverloadMw(r.worstOverloadMw ?? undefined)}`).join(' · '))
  }
  return parts.join(' · ')
}

// ── Time axis ────────────────────────────────────────────────────────────

function TimeAxis({ vm, gridTemplateColumns, denseMode }: { vm: ConstraintTileViewModel; gridTemplateColumns: string; denseMode: boolean }) {
  const totalHours = (vm.windowEndMs - vm.windowStartMs) / 3_600_000
  const tickStepSp = totalHours <= 4 ? 1 : totalHours <= 12 ? 2 : 4
  return (
    <div style={{ padding: '2px 16px 4px', display: 'grid', gridTemplateColumns: ROW_GRID_COLUMNS, gap: 6 }}>
      <div />
      <div style={{ position: 'relative', display: 'grid', gridTemplateColumns, gap: denseMode ? 1 : 3 }}>
        {vm.slotTimes.map((t, i) => (
          <div key={i} style={{ fontSize: 11, color: 'var(--text-soft)', fontFamily: 'var(--font-mono)', textAlign: 'left' }}>
            {i % tickStepSp === 0 ? formatHHMM(t) : ''}
          </div>
        ))}
        <NowMarker vm={vm} top={0} bottom={0} />
      </div>
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

function ConstraintRow({ row, vm, gridTemplateColumns, denseMode, onOpen, activeCell, selectedCell, showCellTooltip, scheduleHideTooltip, hideTooltipImmediate, selectCell }: {
  row: ConstraintRowSummary
  vm: ConstraintTileViewModel
  gridTemplateColumns: string
  denseMode: boolean
  onOpen: () => void
  activeCell: ActiveCell | null
  selectedCell: SelectedCell | null
  showCellTooltip: (row: ConstraintRowSummary, index: number, el: HTMLElement) => void
  scheduleHideTooltip: () => void
  hideTooltipImmediate: () => void
  selectCell: (row: ConstraintRowSummary, index: number) => void
}) {
  const isActive = row.status === 'active'
  const color = isActive ? 'var(--red)' : 'var(--amber)'
  const [mouseHover, setMouseHover] = useState(false)
  const [focusedIndex, setFocusedIndex] = useState(0)
  const cellRefs = useRef<(HTMLDivElement | null)[]>([])

  const isRowActive = mouseHover || activeCell?.row.id === row.id

  function focusCellAt(index: number) {
    const clamped = Math.max(0, Math.min(row.cells.length - 1, index))
    cellRefs.current[clamped]?.focus()
  }

  return (
    <div
      onClick={onOpen}
      style={{
        display: 'grid', gridTemplateColumns: ROW_GRID_COLUMNS, gap: 6,
        alignItems: 'center', padding: '5px 0', cursor: 'pointer', borderRadius: 4,
        background: isRowActive ? '#161E29' : 'transparent',
      }}
      onMouseEnter={() => setMouseHover(true)}
      onMouseLeave={() => setMouseHover(false)}
    >
      {/* Name — the only remaining way to open the constraint's detail view */}
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
          <Cell
            key={i}
            row={row}
            index={i}
            cell={cell}
            denseMode={denseMode}
            isTabbable={i === focusedIndex}
            isTooltipActive={activeCell?.row.id === row.id && activeCell.index === i}
            isSelected={selectedCell?.row.id === row.id && selectedCell.index === i}
            cellRef={el => { cellRefs.current[i] = el }}
            onFocusCell={() => setFocusedIndex(i)}
            onShow={el => showCellTooltip(row, i, el)}
            onScheduleHide={scheduleHideTooltip}
            onHideImmediate={hideTooltipImmediate}
            onSelect={() => selectCell(row, i)}
            onArrow={dir => focusCellAt(i + dir)}
          />
        ))}
        <NowMarker vm={vm} top={0} bottom={0} />
      </div>
    </div>
  )
}

// ── Cell ───────────────────────────────────────────────────────────────

function bandClass(band: WindowedCell['band'], denseMode: boolean): string {
  switch (band) {
    case 'activeSevere': return 'cc-cell-active-severe'
    case 'active': return 'cc-cell-active'
    // Below ~6px an outline gets swamped by the fill, so dense mode swaps the
    // near band's border for a translucent amber fill instead.
    case 'near': return denseMode ? 'cc-cell-near-dense' : 'cc-cell-near'
    case 'noData': return 'cc-cell-nodata'
    default: return 'cc-cell-within'
  }
}

// Coloured text matching each band's outline — within/noData print no value.
function cellTextColor(band: WindowedCell['band']): string | undefined {
  if (band === 'activeSevere') return '#FFD3D5'
  if (band === 'active') return '#FFA3A7'
  if (band === 'near') return '#E3A845'
  return undefined
}

function Cell({ row, index, cell, denseMode, isTabbable, isTooltipActive, isSelected, cellRef, onFocusCell, onShow, onScheduleHide, onHideImmediate, onSelect, onArrow }: {
  row: ConstraintRowSummary
  index: number
  cell: WindowedCell
  denseMode: boolean
  isTabbable: boolean
  isTooltipActive: boolean
  isSelected: boolean
  cellRef: (el: HTMLDivElement | null) => void
  onFocusCell: () => void
  onShow: (el: HTMLElement) => void
  onScheduleHide: () => void
  onHideImmediate: () => void
  onSelect: () => void
  onArrow: (dir: -1 | 1) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  // Cheap: only computes the aria-label sentence, not the whole tooltip layout.
  const label = useMemo(() => formatPeriodTooltip(row, index).ariaLabel, [row, index])
  const showValue = !denseMode && (cell.band === 'near' || isActiveBand(cell.band)) && cell.utilisationPct != null

  function setRef(el: HTMLDivElement | null) {
    ref.current = el
    cellRef(el)
  }

  function handleShow() {
    if (ref.current) onShow(ref.current)
  }

  function handleClick(e: React.MouseEvent) {
    // Selecting a cell is distinct from the row's own onClick (which opens the
    // constraint's detail view via its name) — stop it bubbling there.
    e.stopPropagation()
    onSelect()
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowLeft') { e.preventDefault(); onArrow(-1) }
    else if (e.key === 'ArrowRight') { e.preventDefault(); onArrow(1) }
    else if (e.key === 'Enter') { onSelect() }
    else if (e.key === 'Escape') { onHideImmediate() }
  }

  // Touch: first tap shows the tooltip without selecting; a second tap on the
  // same (already-tooltipped) cell falls through to the click handler above.
  function handlePointerUp(e: React.PointerEvent) {
    if (e.pointerType !== 'touch') return
    if (!isTooltipActive) { e.preventDefault(); e.stopPropagation(); handleShow() }
  }

  return (
    <div
      ref={setRef}
      tabIndex={isTabbable ? 0 : -1}
      role="button"
      aria-label={label}
      aria-describedby={isTooltipActive ? TOOLTIP_ID : undefined}
      aria-pressed={isSelected}
      className={bandClass(cell.band, denseMode)}
      onMouseEnter={handleShow}
      onMouseLeave={onScheduleHide}
      onFocus={() => { onFocusCell(); handleShow() }}
      onBlur={onScheduleHide}
      onKeyDown={handleKeyDown}
      onPointerUp={handlePointerUp}
      onClick={handleClick}
      style={{
        height: denseMode ? 22 : 26, borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer',
        outline: isTooltipActive ? '2px solid #E6EAF0' : isSelected ? '2px solid var(--accent)' : 'none',
        outlineOffset: isTooltipActive || isSelected ? 1 : 0,
      }}
    >
      {showValue && (
        <span className="mono" style={{ fontSize: 10, fontWeight: 600, color: cellTextColor(cell.band) ?? 'var(--text)' }}>
          {Math.round((cell.limitMw as number) - (cell.flowMw as number))}
        </span>
      )}
    </div>
  )
}

// ── Detail sidebar ───────────────────────────────────────────────────────

function DetailSidebar({ selected }: { selected: SelectedCell | null }) {
  return (
    <div style={{
      width: 260, flexShrink: 0, borderLeft: '1px solid var(--border)',
      padding: '10px 14px', display: 'flex', flexDirection: 'column',
    }}>
      {!selected ? (
        <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--text-faint)', fontSize: 12, lineHeight: 1.5 }}>
          Nothing selected
          <br />
          Click a settlement period to see details.
        </div>
      ) : (
        <SelectedCellDetail row={selected.row} index={selected.index} />
      )}
    </div>
  )
}

function SelectedCellDetail({ row, index }: { row: ConstraintRowSummary; index: number }) {
  const content = formatPeriodTooltip(row, index)
  const services = getContractedServices(row.id)
  return (
    <div>
      <div className="mono" style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>{content.title}</div>

      {content.flow && <DetailRow label={content.flow.label} value={content.flow.value} />}
      {content.limit && <DetailRow label={content.limit.label} value={content.limit.value} />}
      {content.margin && (
        <DetailRow label={content.margin.label} value={content.margin.value} color={content.margin.negative ? '#FFA3A7' : undefined} />
      )}
      <DetailRow label="State" value={content.state} />

      <div style={{ borderTop: '1px solid var(--border)', margin: '12px 0 8px' }} />

      <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-faint)', marginBottom: 6 }}>
        Contracted services
      </div>

      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', margin: '0 0 4px' }}>Reserve</div>
      <DetailRow label="Slow Reserve" value={`${services.slowReserveMw.toLocaleString()} MW`} indent />
      <DetailRow label="Quick Reserve" value={`${services.quickReserveMw.toLocaleString()} MW`} indent />

      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', margin: '10px 0 4px' }}>Response</div>
      <DetailRow label="DM" value={`${services.response.dm.toLocaleString()} MW`} indent />
      <DetailRow label="DR" value={`${services.response.dr.toLocaleString()} MW`} indent />
      <DetailRow label="DC" value={`${services.response.dc.toLocaleString()} MW`} indent />
    </div>
  )
}

function DetailRow({ label, value, color, indent }: { label: string; value: string; color?: string; indent?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, padding: '2px 0', paddingLeft: indent ? 10 : 0 }}>
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span className="mono" style={{ color: color ?? 'var(--text)', fontWeight: 600 }}>{value}</span>
    </div>
  )
}

// ── Period tooltip ─────────────────────────────────────────────────────

const TOOLTIP_WIDTH = 190
const TOOLTIP_GAP = 4
const TOOLTIP_EDGE_MARGIN = 8

function PeriodTooltip({ content, cellEl, containerEl }: {
  content: PeriodTooltipContent
  cellEl: HTMLElement
  containerEl: HTMLElement
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const [ready, setReady] = useState(false)

  // Position before paint on every move (no jump); never causes the opacity fade.
  useLayoutEffect(() => {
    if (!ref.current) return
    const cellRect = cellEl.getBoundingClientRect()
    const tileRect = containerEl.getBoundingClientRect()
    const h = ref.current.getBoundingClientRect().height

    const centerX = cellRect.left + cellRect.width / 2
    let left = centerX - TOOLTIP_WIDTH / 2
    left = Math.max(tileRect.left + TOOLTIP_EDGE_MARGIN, Math.min(left, tileRect.right - TOOLTIP_EDGE_MARGIN - TOOLTIP_WIDTH))

    const spaceAbove = cellRect.top - tileRect.top
    const top = spaceAbove >= h + TOOLTIP_GAP ? cellRect.top - TOOLTIP_GAP - h : cellRect.bottom + TOOLTIP_GAP

    setPos({ left, top })
  }, [content, cellEl, containerEl])

  // Fades in once, on mount only; subsequent prop updates (moving between
  // cells) never touch `ready`, so they never re-trigger the transition.
  useEffect(() => { setReady(true) }, [])

  return createPortal(
    <div
      ref={ref}
      id={TOOLTIP_ID}
      role="tooltip"
      style={{
        position: 'fixed',
        left: pos?.left ?? -9999,
        top: pos?.top ?? -9999,
        width: TOOLTIP_WIDTH,
        background: '#05080C',
        border: '1px solid #3A4656',
        borderRadius: 6,
        padding: '8px 10px',
        fontFamily: 'var(--font-mono)',
        fontSize: 12,
        lineHeight: 1.45,
        color: '#E6EAF0',
        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        zIndex: 1000,
        pointerEvents: 'none',
        opacity: ready ? 1 : 0,
        transition: 'opacity 100ms',
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{content.title}</div>
      {content.flow && (
        <div><span style={{ color: '#98A3B3' }}>{content.flow.label} </span>{content.flow.value}</div>
      )}
      {content.limit && (
        <div><span style={{ color: '#98A3B3' }}>{content.limit.label} </span>{content.limit.value}</div>
      )}
      {content.margin && (
        <div>
          <span style={{ color: '#98A3B3' }}>{content.margin.label} </span>
          <span style={{ color: content.margin.negative ? '#FFA3A7' : '#E6EAF0' }}>{content.margin.value}</span>
        </div>
      )}
      <div style={{ color: '#98A3B3', marginTop: 2 }}>{content.state}</div>
    </div>,
    document.body,
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
    { cls: 'cc-cell-active-severe', label: '>105%' },
    { cls: 'cc-cell-active', label: '100 to 105%' },
    { cls: 'cc-cell-near', label: '95 to 100% near' },
    { cls: 'cc-cell-within', label: '<95%' },
    { cls: 'cc-cell-nodata', label: 'No data' },
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
      <span>Hover a period for a quick preview · click a period for full details · click a constraint's name for its detail view</span>
    </div>
  )
}
