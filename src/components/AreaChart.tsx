'use client'

import { useMemo, useRef, useState, useEffect } from 'react'
import {
  ComposedChart, Area, Line, XAxis, YAxis, Tooltip, Legend,
  ReferenceArea, ReferenceLine, CartesianGrid, ResponsiveContainer,
} from 'recharts'
import type { TooltipContentProps, TooltipPayloadEntry } from 'recharts'
import { applyDraftToAreaBaseline } from '@/utils/areaAggregates'
import type { SettlementPeriodData, DraftPlan, BMUnit, AreaRequirementRow } from '@/models/types'
import type { AreaConfig } from '@/config/areas'

// ── Theme (mirrors MarginChart) ───────────────────────────────────────────────

function useDarkMode() {
  const [isDark, setIsDark] = useState(false)
  useEffect(() => {
    const check = () => setIsDark(document.documentElement.getAttribute('data-theme') === 'dark')
    check()
    const observer = new MutationObserver(check)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])
  return isDark
}

interface ChartTheme {
  bg: string; grid: string; axisText: string; zeroLine: string
  midnight: string; tooltipBg: string; tooltipBorder: string
  tooltipText: string; tooltipMuted: string; legendText: string
}

const LIGHT: ChartTheme = {
  bg: '#ffffff', grid: '#f0f0f0', axisText: '#6b7280', zeroLine: '#9ca3af',
  midnight: '#6b7280',
  tooltipBg: '#ffffff', tooltipBorder: '#e5e7eb', tooltipText: '#111827',
  tooltipMuted: '#6b7280', legendText: '#374151',
}
const DARK: ChartTheme = {
  bg: '#0f1218', grid: '#1f2530', axisText: '#64748b', zeroLine: '#2d3441',
  midnight: '#64748b',
  tooltipBg: '#0f1218', tooltipBorder: '#2d3441', tooltipText: '#f1f5f9',
  tooltipMuted: '#94a3b8', legendText: '#94a3b8',
}

function formatYTick(v: number) {
  return Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(v)
}

// ── Custom tooltip ────────────────────────────────────────────────────────────

function makeTooltip(area: AreaConfig, activeDrafts: DraftPlan[], t: ChartTheme, onHide: () => void) {
  return function TooltipContent(props: TooltipContentProps) {
    const { active, payload } = props
    if (!active || !payload || payload.length === 0) return null
    const raw = (payload as ReadonlyArray<TooltipPayloadEntry>)[0]?.payload as Record<string, number> | undefined
    if (!raw) return null

    const gap = raw.availability - raw.requirement
    const gapColor = gap >= 0 ? '#22c55e' : '#ef4444'
    const gapSign  = gap >= 0 ? '+' : ''

    return (
      <div style={{
        position: 'relative',
        background: t.tooltipBg, border: `1px solid ${t.tooltipBorder}`,
        borderRadius: 8, padding: '10px 12px', fontSize: 11.5,
        fontFamily: 'var(--font-mono, monospace)',
        boxShadow: '0 4px 16px rgba(0,0,0,.25)', minWidth: 180,
      }}>
        <button
          onClick={onHide}
          title="Hide tooltip"
          style={{
            position: 'absolute', top: 6, right: 6,
            border: 'none', background: 'none', cursor: 'pointer',
            color: t.tooltipMuted, fontSize: 13, lineHeight: 1, padding: 2,
          }}
        >
          ✕
        </button>
        <p style={{ fontWeight: 600, color: t.tooltipText, margin: '0 0 6px', paddingRight: 14 }}>
          SP {raw.sp} ({raw.label})
        </p>
        <p style={{ color: t.tooltipMuted, margin: '2px 0' }}>
          Requirement: {Math.round(raw.requirement).toLocaleString()} {area.unit}
        </p>
        <p style={{ color: area.color, margin: '2px 0' }}>
          Available:&nbsp;&nbsp;&nbsp;{Math.round(raw.availability).toLocaleString()} {area.unit}
        </p>
        <p style={{ color: gapColor, fontWeight: 600, margin: '4px 0 0' }}>
          Gap: {gapSign}{Math.round(gap).toLocaleString()} {area.unit}
        </p>
        {activeDrafts.map(draft => {
          const val = raw[draft.id]
          if (val == null) return null
          const draftGap = val - raw.requirement
          const draftGapSign = draftGap >= 0 ? '+' : ''
          return (
            <div key={draft.id} style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${t.tooltipBorder}` }}>
              <p style={{ color: draft.color, fontWeight: 600, margin: '0 0 2px' }}>{draft.name}</p>
              <p style={{ color: draft.color, margin: 0 }}>
                Avail: {Math.round(val).toLocaleString()} {area.unit} &nbsp;|&nbsp;
                Gap: {draftGapSign}{Math.round(draftGap).toLocaleString()}
              </p>
            </div>
          )
        })}
      </div>
    )
  }
}

// ── Deficit / surplus range detection ────────────────────────────────────────

interface Range { lo: number; hi: number }

function findRanges(data: { gap: number }[], inDeficit: boolean): Range[] {
  const ranges: Range[] = []
  let start = -1
  data.forEach((d, i) => {
    const match = inDeficit ? d.gap < 0 : d.gap >= 0
    if (match && start === -1) start = i
    if (!match && start !== -1) { ranges.push({ lo: start, hi: i - 1 }); start = -1 }
  })
  if (start !== -1) ranges.push({ lo: start, hi: data.length - 1 })
  return ranges
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface AreaChartProps {
  area: AreaConfig
  settlementPeriods: SettlementPeriodData[]
  areaRequirements: AreaRequirementRow[]
  drafts: DraftPlan[]
  units: BMUnit[]
  hiddenDraftIds: Set<string>
  chartInteractionMode: 'drag' | 'twoClick' | 'deficit'
  onSolveSelect: (fromSp: number, toSp: number, worstDeficitMw: number) => void
  isLoading: boolean
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AreaChart({
  area, settlementPeriods, areaRequirements, drafts, units,
  hiddenDraftIds, chartInteractionMode, onSolveSelect, isLoading,
}: AreaChartProps) {
  const isDark = useDarkMode()
  const t = isDark ? DARK : LIGHT

  // Drag / click state
  const isDraggingRef = useRef(false)
  const dragStartRef  = useRef<number | null>(null)
  const dragFiredRef  = useRef(false)
  const [dragStart, setDragStart] = useState<number | null>(null)
  const [dragEnd,   setDragEnd]   = useState<number | null>(null)
  const [clickPhase, setClickPhase] = useState<0 | 1>(0)
  const [clickStart, setClickStart] = useState<number | null>(null)
  const [tooltipHidden, setTooltipHidden] = useState(true)

  useEffect(() => {
    function onDocMouseUp() {
      if (!isDraggingRef.current) return
      if (dragFiredRef.current) { dragFiredRef.current = false; return }
      isDraggingRef.current = false
      const start = dragStartRef.current
      dragStartRef.current = null
      if (start !== null && dragEnd !== null && start !== dragEnd) {
        fireSelection(start, dragEnd)
      } else {
        setDragStart(null); setDragEnd(null)
      }
    }
    document.addEventListener('mouseup', onDocMouseUp)
    return () => document.removeEventListener('mouseup', onDocMouseUp)
  }, [dragEnd]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    isDraggingRef.current = false; dragStartRef.current = null
    setDragStart(null); setDragEnd(null); setClickPhase(0); setClickStart(null)
  }, [chartInteractionMode])

  const activeDrafts = useMemo(
    () => drafts.filter(d => d.status === 'draft' && !hiddenDraftIds.has(d.id)),
    [drafts, hiddenDraftIds]
  )

  const alreadyModelled = useMemo(() => new Set(
    drafts.filter(d => d.status === 'committed').flatMap(d => d.actions.map(a => a.bmUnitId))
  ), [drafts])

  // Build chart data with time labels matching MarginChart format
  const firstTomorrowDate = useMemo(() =>
    settlementPeriods.find((sp, i) =>
      i > 0 && sp.settlementDate !== settlementPeriods[i - 1].settlementDate
    )?.settlementDate
  , [settlementPeriods])

  const chartData = useMemo(() => {
    return settlementPeriods.map((sp, index) => {
      const slotIdx     = sp.settlementPeriod
      const requirement = areaRequirements.find(r => r.sp === slotIdx)?.requirement ?? 0
      const availability = sp.areaAvailability?.[area.id] ?? 0
      const gap         = availability - requirement

      // Time label — matches MarginChart's slotLabel()
      const hhmm = sp.startTime.slice(11, 16)
      const isMidnightCross = index > 0 && sp.settlementDate === firstTomorrowDate &&
        settlementPeriods[index - 1].settlementDate !== firstTomorrowDate
      const label = isMidnightCross ? `↑ ${hhmm}` : hhmm

      const point: Record<string, number | string | null> = {
        sp: slotIdx, label,
        requirement, availability, gap,
        surplusShade: Math.max(0, gap),
        deficitShade: Math.min(0, gap),
      }

      for (const draft of activeDrafts) {
        const covered = draft.actions.some(a =>
          a.fromPeriod <= slotIdx && (a.toPeriod === undefined || a.toPeriod >= slotIdx)
        )
        const prevCovered = draft.actions.some(a =>
          a.fromPeriod <= slotIdx - 1 && (a.toPeriod === undefined || a.toPeriod >= slotIdx - 1)
        )
        const nextCovered = draft.actions.some(a =>
          a.fromPeriod <= slotIdx + 1 && (a.toPeriod === undefined || a.toPeriod >= slotIdx + 1)
        )
        if (covered) {
          point[draft.id] = applyDraftToAreaBaseline(sp, availability, draft.actions, alreadyModelled, units, area.id)
        } else if (prevCovered || nextCovered) {
          point[draft.id] = availability
        } else {
          point[draft.id] = null
        }
      }

      return point
    })
  }, [settlementPeriods, areaRequirements, area.id, activeDrafts, alreadyModelled, units, firstTomorrowDate])

  // Must be before early return
  const deficitRanges = useMemo(() => findRanges(chartData as { gap: number }[], true),  [chartData])
  const surplusRanges = useMemo(() => findRanges(chartData as { gap: number }[], false), [chartData])

  const midnightIdx = useMemo(() => {
    for (let i = 1; i < settlementPeriods.length; i++) {
      if (settlementPeriods[i].settlementDate !== settlementPeriods[i - 1].settlementDate) return i
    }
    return null
  }, [settlementPeriods])

  const tickLabels = useMemo(() =>
    (chartData as { label: string }[]).filter((_, i) => i % 4 === 0).map(d => d.label)
  , [chartData])

  if (isLoading || settlementPeriods.length === 0) {
    return (
      <div style={{
        background: t.bg, borderRadius: 12, padding: 16,
        border: `1px solid ${t.tooltipBorder}`,
        flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column',
      }}>
        <h2 style={{ fontSize: 13, fontWeight: 500, color: t.axisText, margin: '0 0 8px' }}>
          {area.name} — {settlementPeriods.length} Settlement Periods
        </h2>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.axisText }}>
          {isLoading ? 'Loading data...' : 'No data available'}
        </div>
      </div>
    )
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  function idxFromEvent(e: { activeTooltipIndex?: unknown } | null) {
    const raw = e?.activeTooltipIndex
    if (raw == null) return null
    const idx = parseInt(String(raw), 10)
    return isNaN(idx) ? null : idx
  }

  function fireSelection(idxA: number, idxB: number) {
    const lo = Math.min(idxA, idxB)
    const hi = Math.max(idxA, idxB)
    const slice = (chartData as { gap: number }[]).slice(lo, hi + 1)
    if (slice.length === 0) return
    const worst = Math.min(...slice.map(d => d.gap))
    onSolveSelect(lo + 1, hi + 1, worst)
  }

  function labelAt(idx: number) {
    return (chartData[idx] as { label: string } | undefined)?.label ?? ''
  }

  // ── Event handlers ────────────────────────────────────────────────────────

  function handleMouseDown(e: { activeTooltipIndex?: unknown } | null) {
    if (chartInteractionMode !== 'drag') return
    const idx = idxFromEvent(e); if (idx == null) return
    isDraggingRef.current = true; dragStartRef.current = idx
    setDragStart(idx); setDragEnd(idx)
  }

  function handleMouseMove(e: { activeTooltipIndex?: unknown } | null) {
    if (chartInteractionMode !== 'drag' || !isDraggingRef.current) return
    const idx = idxFromEvent(e); if (idx == null) return
    setDragEnd(idx)
  }

  function handleMouseUp(e: { activeTooltipIndex?: unknown } | null) {
    if (chartInteractionMode !== 'drag' || !isDraggingRef.current) return
    dragFiredRef.current  = true
    isDraggingRef.current = false
    const rawIdx = idxFromEvent(e)
    const idx    = rawIdx ?? dragEnd
    const start  = dragStartRef.current; dragStartRef.current = null
    if (start !== null && idx !== null && start !== idx) {
      setDragEnd(idx); fireSelection(start, idx)
    } else {
      setDragStart(null); setDragEnd(null)
    }
  }

  function handleClick(e: { activeTooltipIndex?: unknown } | null) {
    const idx = idxFromEvent(e); if (idx == null) return
    if (chartInteractionMode === 'twoClick') {
      if (clickPhase === 0) {
        setClickStart(idx)
        setDragStart(idx)
        setDragEnd(idx)
        setClickPhase(1)
      } else {
        const start = clickStart!
        setClickPhase(0); setClickStart(null)
        if (start !== idx) {
          setDragEnd(idx)
          fireSelection(start, idx)
        } else {
          setDragStart(null); setDragEnd(null)
        }
      }
      return
    }
    if (chartInteractionMode === 'deficit') {
      const range = deficitRanges.find(r => r.lo <= idx && idx <= r.hi)
      if (!range) return
      fireSelection(range.lo, range.hi)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const selLo = dragStart != null && dragEnd != null ? Math.min(dragStart, dragEnd) : null
  const selHi = dragStart != null && dragEnd != null ? Math.max(dragStart, dragEnd) : null
  const tooltipRenderer = makeTooltip(area, activeDrafts, t, () => setTooltipHidden(true))

  return (
    <div style={{
      background: t.bg, borderRadius: 12, padding: '14px 16px',
      border: `1px solid ${t.tooltipBorder}`,
      flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column',
      userSelect: 'none',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexShrink: 0 }}>
        <h2 style={{ margin: 0, fontSize: 13, fontWeight: 500, color: t.axisText }}>
          {area.name} — {chartData.length} Settlement Periods
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 11.5, color: t.tooltipMuted }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 3, background: '#22c55e', opacity: .7 }} />
            Surplus
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 3, background: '#ef4444', opacity: .7 }} />
            Shortfall
          </span>
          <button
            onClick={() => setTooltipHidden(v => !v)}
            title={tooltipHidden ? 'Show tooltip' : 'Hide tooltip'}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 22, height: 22, padding: 0, borderRadius: 4, fontSize: 12,
              cursor: 'pointer',
              border: `1px solid ${tooltipHidden ? t.tooltipBorder : '#6366f1'}`,
              background: tooltipHidden ? 'transparent' : '#6366f1',
              color: tooltipHidden ? t.tooltipMuted : '#fff',
            }}
          >
            💬
          </button>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, cursor: 'crosshair' }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={chartData}
            margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
            onMouseDown={handleMouseDown as never}
            onMouseMove={handleMouseMove as never}
            onMouseUp={handleMouseUp as never}
            onClick={handleClick as never}
            onContextMenu={((_: unknown, e: MouseEvent) => {
              e.preventDefault()
              setTooltipHidden(v => !v)
            }) as never}
          >
            <CartesianGrid strokeDasharray="3 3" stroke={t.grid} />

            <XAxis
              dataKey="label"
              ticks={tickLabels}
              tick={{ fontSize: 11, fill: t.axisText }}
              axisLine={{ stroke: t.grid }}
              tickLine={{ stroke: t.grid }}
            />
            <YAxis
              tickFormatter={formatYTick}
              tick={{ fontSize: 11, fill: t.axisText }}
              axisLine={{ stroke: t.grid }}
              tickLine={{ stroke: t.grid }}
              label={{ value: area.unit, angle: -90, position: 'insideLeft', offset: 10, fontSize: 11, fill: t.axisText }}
            />

            {!tooltipHidden && (
              <Tooltip content={tooltipRenderer} wrapperStyle={{ pointerEvents: 'auto' }} />
            )}
            <Legend
              verticalAlign="bottom"
              height={36}
              wrapperStyle={{ fontSize: 11, color: t.legendText }}
            />

            <ReferenceLine y={0} stroke={t.zeroLine} strokeDasharray="4 4" />

            {/* Surplus / deficit area fills */}
            {surplusRanges.map((r, i) => (
              <ReferenceArea key={`s${i}`} x1={labelAt(r.lo)} x2={labelAt(r.hi)} fill="#22c55e" fillOpacity={0.12} strokeWidth={0} />
            ))}
            {deficitRanges.map((r, i) => (
              <ReferenceArea key={`d${i}`} x1={labelAt(r.lo)} x2={labelAt(r.hi)} fill="#ef4444" fillOpacity={0.18} strokeWidth={0} />
            ))}

            {/* Drag / 2-click selection */}
            {selLo != null && selHi != null && (
              <ReferenceArea x1={labelAt(selLo)} x2={labelAt(selHi)} fill="#6366f1" fillOpacity={0.15} stroke="#6366f1" strokeOpacity={0.6} strokeWidth={1} />
            )}
            {chartInteractionMode === 'twoClick' && clickPhase === 1 && clickStart != null && (
              <ReferenceLine
                x={labelAt(clickStart)} stroke="#fbbf24" strokeDasharray="4 3"
                label={{ value: '① start', position: 'insideTopRight', fontSize: 9, fill: '#fbbf24' }}
              />
            )}

            {/* Midnight marker */}
            {midnightIdx != null && (
              <ReferenceLine
                x={labelAt(midnightIdx)} stroke={t.midnight} strokeDasharray="3 3"
                label={{ value: '← midnight', position: 'insideTopLeft', fontSize: 9, fill: t.midnight }}
              />
            )}

            {/* Requirement line */}
            <Line
              dataKey="requirement" name={`Requirement (${area.unit})`}
              stroke={t.axisText} strokeWidth={1.5} strokeDasharray="5 4"
              dot={false} isAnimationActive={false} activeDot={{ r: 3 }}
            />

            {/* Availability line */}
            <Line
              dataKey="availability" name={`Available (${area.unit})`}
              stroke={area.color} strokeWidth={2}
              dot={false} isAnimationActive={false} activeDot={{ r: 3 }}
            />

            {/* Draft overlay lines */}
            {activeDrafts.map(draft => (
              <Line
                key={draft.id} dataKey={draft.id} name={draft.name}
                stroke={draft.color} strokeWidth={2} strokeDasharray="6 3"
                dot={false} isAnimationActive={false} connectNulls={false} activeDot={{ r: 3 }}
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
