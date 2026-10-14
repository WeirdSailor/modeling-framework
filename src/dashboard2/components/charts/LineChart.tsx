'use client'

// Line row (spec §8.2): headroom = available − requirement on a fixed scale centred on the requirement
// line (bandAbove for the upper half, bandBelow for the lower half). Monotone curve through SP midpoints; gaps where SPs are missing.

import { memo, useCallback, useMemo } from 'react'
import { monotoneCommands, type XScale } from '../../geometry'
import { headroom } from '../../derive'
import { formatSigned } from '../../format'
import { SP_MS } from '../../time'
import { useCursorMs } from '../../state/cursorStore'
import type { DrillDownEvent, LineAreaData, LinePeriod } from '../../types'
import type { LineAreaConfig } from '../../dashboard.config'
import { CursorLine, Grid, NowLine, PastShade, useChartPointer, useSvgId } from './ChartFrame'
import { HATCH_FILL } from './SvgDefs'

interface Props {
  area: LineAreaData | undefined
  cfg: LineAreaConfig
  scale: XScale
  height: number
  nowMs: number
  onDrillDown: (e: DrillDownEvent) => void
}

const PAD = 8

function makeY(height: number, bandAbove: number, bandBelow: number) {
  const mid = height / 2
  return (v: number) => mid - Math.max(-1, Math.min(1, v / (v >= 0 ? bandAbove : bandBelow))) * (mid - PAD)
}

export default function LineChart({ area, cfg, scale, height, nowMs, onDrillDown }: Props) {
  const clipUp = useSvgId('d2up')
  const clipDn = useSvgId('d2dn')
  const mid = height / 2

  const byMs = useMemo(() => {
    const m = new Map<number, LinePeriod>()
    for (const p of area?.periods ?? []) {
      const t = Date.parse(p.spStart)
      if (t >= scale.startMs && t < scale.endMs) m.set(t, p)
    }
    return m
  }, [area, scale.startMs, scale.endMs])

  // Path computation memoised on (data, scale) — cursor movement never touches it.
  const paths = useMemo(() => {
    const y = makeY(height, cfg.bandAbove, cfg.bandBelow)
    const times = [...byMs.keys()].sort((a, b) => a - b)
    // Split into runs of consecutive SPs; each run spans its SPs edge to edge (flat at the ends).
    const runs: number[][] = []
    for (const t of times) {
      const last = runs[runs.length - 1]
      if (last && t - last[last.length - 1] === SP_MS) last.push(t)
      else runs.push([t])
    }
    let line = '', fill = ''
    for (const run of runs) {
      const pts = run.map(t => [scale.x(t + SP_MS / 2), y(headroom(byMs.get(t)!))] as [number, number])
      const left = scale.x(run[0]), right = scale.x(run[run.length - 1] + SP_MS)
      const [x0, y0] = pts[0], yN = pts[pts.length - 1][1]
      const body = `M${left},${y0}L${x0},${y0}${monotoneCommands(pts)}L${right},${yN}`
      line += body
      fill += `${body}L${right},${mid}L${left},${mid}Z`
    }
    return { line, fill }
  }, [byMs, scale, height, cfg.bandAbove, cfg.bandBelow, mid])

  const payloadFor = useCallback((ms: number) => byMs.get(ms) ?? null, [byMs])
  const pointer = useChartPointer({ scale, areaId: cfg.id, kind: 'line', payloadFor, onDrillDown })

  return (
    <svg width={scale.width} height={height} {...pointer}>
      <defs>
        <clipPath id={clipUp}><rect x={0} y={0} width={scale.width} height={mid} /></clipPath>
        <clipPath id={clipDn}><rect x={0} y={mid} width={scale.width} height={mid} /></clipPath>
      </defs>
      <PastShade scale={scale} nowMs={nowMs} height={height} />
      <Grid scale={scale} height={height} />
      <LineFills fill={paths.fill} clipUp={clipUp} clipDn={clipDn} />
      <line x1={0} x2={scale.width} y1={mid} y2={mid} stroke="#8C97A7" strokeDasharray="6 4" strokeWidth={1} />
      <path d={paths.line} fill="none" stroke="#D3DCE7" strokeWidth={1.8} />
      <CursorLine scale={scale} height={height} />
      <LineCursorMarker byMs={byMs} scale={scale} height={height} bandAbove={cfg.bandAbove} bandBelow={cfg.bandBelow} />
      <NowLine scale={scale} nowMs={nowMs} height={height} />
    </svg>
  )
}

const LineFills = memo(function LineFills({ fill, clipUp, clipDn }: { fill: string; clipUp: string; clipDn: string }) {
  if (!fill) return null
  return (
    <>
      <path d={fill} fill="rgba(90,169,230,.12)" clipPath={`url(#${clipUp})`} />
      <path d={fill} fill={HATCH_FILL} clipPath={`url(#${clipDn})`} />
    </>
  )
})

function LineCursorMarker({ byMs, scale, height, bandAbove, bandBelow }: {
  byMs: Map<number, LinePeriod>; scale: XScale; height: number; bandAbove: number; bandBelow: number
}) {
  const cursorMs = useCursorMs()
  const p = cursorMs === null ? undefined : byMs.get(cursorMs)
  if (cursorMs === null || !p) return null
  const v = headroom(p)
  const cx = scale.x(cursorMs + SP_MS / 2)
  const cy = makeY(height, bandAbove, bandBelow)(v)
  const above = v >= 0 && cy > 20
  return (
    <g pointerEvents="none">
      <circle cx={cx} cy={cy} r={3.5} fill="#0D1117" stroke="#D3DCE7" strokeWidth={1.5} />
      <text x={cx + 7} y={above ? cy - 7 : cy + 15} fontSize={11.5} fontWeight={600} fill={v < 0 ? '#FF8A70' : '#B9C3D1'}>
        {formatSigned(v)}
      </text>
    </g>
  )
}
