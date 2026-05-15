'use client'

import { useMemo, useRef, useState, useEffect } from 'react'
import {
  ComposedChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceArea, ReferenceLine, CartesianGrid,
} from 'recharts'
import { applyDraftToAreaBaseline } from '@/utils/areaAggregates'
import type { SettlementPeriodData, DraftPlan, BMUnit, AreaRequirementRow } from '@/models/types'
import type { AreaConfig } from '@/config/areas'

interface AreaChartProps {
  area: AreaConfig
  settlementPeriods: SettlementPeriodData[]
  areaRequirements: AreaRequirementRow[]   // 48 rows for this area
  drafts: DraftPlan[]                      // active visible drafts for overlay
  units: BMUnit[]
  hiddenDraftIds: Set<string>
  chartInteractionMode: 'drag' | 'twoClick' | 'deficit'
  onSolveSelect: (fromSp: number, toSp: number, worstDeficitMw: number) => void
  isLoading: boolean
}

// ── Deficit range detection ───────────────────────────────────────────────────

interface DeficitRange { start: number; end: number }

function findDeficitRanges(
  data: { slotIdx: number; gap: number }[]
): DeficitRange[] {
  const ranges: DeficitRange[] = []
  let start: number | null = null
  for (const d of data) {
    if (d.gap < 0) {
      if (start === null) start = d.slotIdx
    } else {
      if (start !== null) { ranges.push({ start, end: d.slotIdx - 1 }); start = null }
    }
  }
  if (start !== null) ranges.push({ start, end: data[data.length - 1]?.slotIdx ?? start })
  return ranges
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AreaChart({
  area,
  settlementPeriods,
  areaRequirements,
  drafts,
  units,
  hiddenDraftIds,
  chartInteractionMode,
  onSolveSelect,
  isLoading,
}: AreaChartProps) {
  // Drag state — useRef for synchronous tracking in event handlers (useState batches)
  const isDraggingRef  = useRef(false)
  const dragStartRef   = useRef<number | null>(null)
  const [dragStart, setDragStart] = useState<number | null>(null)
  const [dragEnd,   setDragEnd]   = useState<number | null>(null)

  // 2-click state
  const [clickPhase, setClickPhase] = useState<0 | 1>(0)
  const [clickStart, setClickStart] = useState<number | null>(null)

  // Reset selection state when mode changes
  useEffect(() => {
    isDraggingRef.current = false
    dragStartRef.current  = null
    setDragStart(null)
    setDragEnd(null)
    setClickPhase(0)
    setClickStart(null)
  }, [chartInteractionMode])

  // Active drafts for overlay
  const activeDrafts = useMemo(
    () => drafts.filter(d => d.status === 'draft' && !hiddenDraftIds.has(d.id)),
    [drafts, hiddenDraftIds]
  )

  // Units already counted in the committed baseline (for draft overlay dedup)
  const alreadyModelled = useMemo(() => new Set(
    drafts.filter(d => d.status === 'committed').flatMap(d => d.actions.map(a => a.bmUnitId))
  ), [drafts])

  // Chart data — must be computed before early return to satisfy hooks ordering
  const chartData = useMemo(() => {
    return settlementPeriods.map((sp) => {
      const slotIdx = sp.settlementPeriod
      const requirement = areaRequirements.find(r => r.sp === slotIdx)?.requirement ?? 0
      const availability = sp.areaAvailability?.[area.id] ?? 0
      const gap = availability - requirement

      // Draft overlays
      const overlays: Record<string, number | null> = {}
      for (const draft of activeDrafts) {
        const prevIdx = slotIdx - 1
        const nextIdx = slotIdx + 1
        const covered = draft.actions.some(a =>
          a.fromPeriod <= slotIdx && (a.toPeriod === undefined || a.toPeriod >= slotIdx)
        )
        const prevCovered = draft.actions.some(a =>
          a.fromPeriod <= prevIdx && (a.toPeriod === undefined || a.toPeriod >= prevIdx)
        )
        const nextCovered = draft.actions.some(a =>
          a.fromPeriod <= nextIdx && (a.toPeriod === undefined || a.toPeriod >= nextIdx)
        )
        if (covered) {
          overlays[draft.id] = applyDraftToAreaBaseline(sp, availability, draft.actions, alreadyModelled, units, area.id)
        } else if (prevCovered || nextCovered) {
          overlays[draft.id] = availability  // bridge point
        } else {
          overlays[draft.id] = null
        }
      }

      return { slotIdx, requirement, availability, gap, ...overlays }
    })
  }, [settlementPeriods, areaRequirements, area.id, activeDrafts, alreadyModelled, units])

  // Deficit zones — MUST be before early return
  const deficitRanges = useMemo(() => findDeficitRanges(chartData), [chartData])

  // Midnight index
  const midnightIdx = useMemo(() => {
    for (let i = 1; i < settlementPeriods.length; i++) {
      const prev = settlementPeriods[i - 1]
      const curr = settlementPeriods[i]
      if (curr.settlementDate !== prev.settlementDate) return i
    }
    return null
  }, [settlementPeriods])

  if (isLoading || settlementPeriods.length === 0) {
    return <div style={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>Loading…</div>
  }

  // ── Event helpers ────────────────────────────────────────────────────────

  function indexFromEvent(e: { activeTooltipIndex?: unknown } | null): number | null {
    const raw = e?.activeTooltipIndex
    if (raw == null) return null
    const idx = parseInt(String(raw), 10)
    return isNaN(idx) ? null : idx
  }

  function fireIfDeficit(fromIdx: number, toIdx: number) {
    const lo = Math.min(fromIdx, toIdx)
    const hi = Math.max(fromIdx, toIdx)
    const slice = chartData.slice(lo, hi + 1)
    const deficits = slice.filter(d => d.gap < 0)
    if (deficits.length === 0) return
    const worst = Math.min(...deficits.map(d => d.gap))
    onSolveSelect(lo + 1, hi + 1, worst)  // +1: slotIdx is 1-based
  }

  // ── Mouse handlers for drag mode ─────────────────────────────────────────

  function handleMouseDown(e: { activeTooltipIndex?: unknown } | null) {
    if (chartInteractionMode !== 'drag') return
    const idx = indexFromEvent(e)
    if (idx == null) return
    isDraggingRef.current = true
    dragStartRef.current  = idx
    setDragStart(idx)
    setDragEnd(null)
  }

  function handleMouseMove(e: { activeTooltipIndex?: unknown } | null) {
    if (chartInteractionMode !== 'drag' || !isDraggingRef.current) return
    const idx = indexFromEvent(e)
    if (idx == null) return
    setDragEnd(idx)
  }

  function handleMouseUp() {
    if (chartInteractionMode !== 'drag' || !isDraggingRef.current) return
    isDraggingRef.current = false
    const start = dragStartRef.current
    const end = dragEnd  // read current value before clearing
    dragStartRef.current = null
    if (start != null && end != null) fireIfDeficit(start, end)
    setDragStart(null)
    setDragEnd(null)
  }

  // ── Click handler for 2-click and deficit-zone modes ─────────────────────

  function handleClick(e: { activeTooltipIndex?: unknown } | null) {
    const idx = indexFromEvent(e)
    if (idx == null) return

    if (chartInteractionMode === 'twoClick') {
      if (clickPhase === 0) {
        setClickStart(idx)
        setClickPhase(1)
      } else {
        if (clickStart != null) fireIfDeficit(clickStart, idx)
        setClickPhase(0)
        setClickStart(null)
      }
      return
    }

    if (chartInteractionMode === 'deficit') {
      const range = deficitRanges.find(r => r.start - 1 <= idx && idx <= r.end - 1)
      if (!range) return
      fireIfDeficit(range.start - 1, range.end - 1)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  const selLo = dragStart != null && dragEnd != null ? Math.min(dragStart, dragEnd) : null
  const selHi = dragStart != null && dragEnd != null ? Math.max(dragStart, dragEnd) : null

  return (
    <div style={{ userSelect: 'none' }}>
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart
          data={chartData}
          onMouseDown={handleMouseDown as never}
          onMouseMove={handleMouseMove as never}
          onMouseUp={handleMouseUp}
          onClick={handleClick as never}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis dataKey="slotIdx" hide />
          <YAxis
            label={{ value: area.unit, angle: -90, position: 'insideLeft', offset: 10, style: { fontSize: 10, fill: '#64748b' } }}
            tick={{ fontSize: 10, fill: '#64748b' }}
            width={48}
          />
          <Tooltip
            contentStyle={{ background: '#1e293b', border: '1px solid #334155', fontSize: 11 }}
            labelFormatter={() => ''}
            itemStyle={{ color: '#94a3b8' }}
            formatter={(val: unknown, name: unknown) => [
              typeof val === 'number' ? `${Math.round(val).toLocaleString()} ${area.unit}` : String(val ?? ''),
              String(name ?? ''),
            ] as [string, string]}
          />

          {/* Deficit zone shading */}
          {deficitRanges.map((r, i) => (
            <ReferenceArea
              key={`d${i}`}
              x1={r.start - 1}
              x2={r.end - 1}
              fill="#ef444418"
              stroke="#ef444440"
              strokeWidth={0}
            />
          ))}

          {/* Drag selection highlight */}
          {selLo != null && selHi != null && (
            <ReferenceArea x1={selLo} x2={selHi} fill="#6366f115" stroke="#6366f1" strokeWidth={1} strokeDasharray="2,2" />
          )}

          {/* 2-click first-click marker */}
          {chartInteractionMode === 'twoClick' && clickPhase === 1 && clickStart != null && (
            <ReferenceLine x={clickStart} stroke="#f59e0b" strokeDasharray="3,3" strokeWidth={1.5} />
          )}

          {/* Midnight marker */}
          {midnightIdx != null && (
            <ReferenceLine
              x={midnightIdx}
              stroke="#475569"
              strokeDasharray="2,2"
              label={{ value: '← midnight', position: 'insideTopLeft', fontSize: 9, fill: '#475569' }}
            />
          )}

          {/* Requirement line (dashed) */}
          <Line
            dataKey="requirement"
            stroke="#64748b"
            strokeWidth={1.5}
            strokeDasharray="5,4"
            dot={false}
            isAnimationActive={false}
            name={`Requirement (${area.unit})`}
          />

          {/* Availability line (solid, area-coloured) */}
          <Line
            dataKey="availability"
            stroke={area.color}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
            name={`Available (${area.unit})`}
          />

          {/* Draft overlay lines (dotted) */}
          {activeDrafts.map(draft => (
            <Line
              key={draft.id}
              dataKey={draft.id}
              stroke={draft.color}
              strokeWidth={1.5}
              strokeDasharray="3,2"
              dot={false}
              isAnimationActive={false}
              connectNulls={false}
              name={draft.name}
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
