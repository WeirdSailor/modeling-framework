'use client'

// Strip row (spec §8.3): one cell per SP coloured by worst item state, with aggregated action markers.
// The cursor line runs underneath the cells; the Now line stays on top.

import { memo, useCallback, useMemo } from 'react'
import { arrowPoints, type XScale } from '../../geometry'
import { aggregateActions, cellVisual, type CellVisual } from '../../derive'
import { formatInt } from '../../format'
import { SP_MS } from '../../time'
import { MARKER_MIN_PX, MARKER_NUMBERS_MIN_PX } from '../../dashboard.config'
import type { AreaId, DrillDownEvent, StripAreaData, StripPeriod } from '../../types'
import { CursorLine, Grid, NowLine, PastShade, useChartPointer } from './ChartFrame'
import { HATCH_FILL } from './SvgDefs'

const CELL_STYLE: Record<CellVisual, { fill: string; stroke: string }> = {
  violated: { fill: HATCH_FILL, stroke: 'rgba(255,107,74,.9)' },
  tight:    { fill: 'rgba(242,181,60,.30)', stroke: 'rgba(242,181,60,.85)' },
  managed:  { fill: '#2C3746', stroke: '#5B6B82' },
  ok:       { fill: '#1F2630', stroke: '#2A323D' },
}
const MARKER = '#F2F5F8'

interface Props {
  area: StripAreaData | undefined
  areaId: AreaId
  scale: XScale
  height: number
  nowMs: number
  onDrillDown: (e: DrillDownEvent) => void
}

export default function StripChart({ area, areaId, scale, height, nowMs, onDrillDown }: Props) {
  const byMs = useMemo(() => {
    const m = new Map<number, StripPeriod>()
    for (const p of area?.periods ?? []) m.set(Date.parse(p.spStart), p)
    return m
  }, [area])

  const payloadFor = useCallback((ms: number) => byMs.get(ms) ?? null, [byMs])
  const pointer = useChartPointer({ scale, areaId, kind: 'strip', payloadFor, onDrillDown })

  return (
    <svg width={scale.width} height={height} {...pointer}>
      <PastShade scale={scale} nowMs={nowMs} height={height} />
      <Grid scale={scale} height={height} />
      <CursorLine scale={scale} height={height} />
      <Cells byMs={byMs} scale={scale} height={height} />
      <NowLine scale={scale} nowMs={nowMs} height={height} />
    </svg>
  )
}

const Cells = memo(function Cells({ byMs, scale, height }: { byMs: Map<number, StripPeriod>; scale: XScale; height: number }) {
  const y = 12, h = height - 24
  const out = []
  for (let k = 0; k < scale.nSp; k++) {
    const t = scale.startMs + k * SP_MS
    const x = k * scale.spWidth + 2
    const w = Math.max(0, scale.spWidth - 4)
    const p = byMs.get(t)
    if (!p) {
      // Missing SP: empty outline, never a filled "ok" cell.
      out.push(<rect key={t} x={x} y={y} width={w} height={h} rx={3} fill="none" stroke="#2A323D" strokeDasharray="2 3" />)
      continue
    }
    const s = CELL_STYLE[cellVisual(p)]
    out.push(
      <g key={t}>
        <rect x={x} y={y} width={w} height={h} rx={3} fill={s.fill} stroke={s.stroke} />
        <Markers period={p} x={x} w={w} cy={y + h / 2} />
      </g>,
    )
  }
  return <g>{out}</g>
})

function Markers({ period, x, w, cy }: { period: StripPeriod; x: number; w: number; cy: number }) {
  if (period.actions.length === 0 || w < MARKER_MIN_PX) return null
  const { down, up } = aggregateActions(period.actions)
  const lines = [
    ...(down > 0 ? [{ dir: 'down' as const, mw: down }] : []),
    ...(up > 0 ? [{ dir: 'up' as const, mw: up }] : []),
  ]
  if (lines.length === 0) return null
  const withNumbers = w >= MARKER_NUMBERS_MIN_PX
  const stacked = lines.length === 2
  const cx = x + w / 2
  const ax = withNumbers ? cx - 14 : cx
  return (
    <g pointerEvents="none">
      {lines.map((l, i) => {
        const ly = stacked ? cy + (i === 0 ? -9 : 9) : cy
        return (
          <g key={l.dir}>
            <polygon points={arrowPoints(ax, ly, l.dir, stacked ? 0.85 : 1)} fill={MARKER} />
            {withNumbers && (
              <text x={cx - 5} y={ly + 4.5} fontSize={12} fontWeight={600} fill={MARKER}>{formatInt(l.mw)}</text>
            )}
          </g>
        )
      })}
    </g>
  )
}
