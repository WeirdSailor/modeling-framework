'use client'

// IC row (spec §8.4): change in net interconnector position, one bar per SP boundary.

import { memo, useCallback, useMemo } from 'react'
import type { XScale } from '../../geometry'
import { icSwings, icTone, type IcSwing, type IcTone } from '../../derive'
import { formatSigned } from '../../format'
import type { IcAreaConfig } from '../../dashboard.config'
import type { DrillDownEvent, IcAreaData } from '../../types'
import { CursorLine, Grid, NowLine, PastShade, useChartPointer } from './ChartFrame'

const TONE_COLOUR: Record<IcTone, string> = { red: '#FF6B4A', amber: '#F2B53C', normal: '#7D8A9C' }
const PAD = 8
export const IC_ESTIMATE_OPACITY = 0.4 // bars whose swing comes from estimated (D-1 proxy) data

interface Props {
  area: IcAreaData | undefined
  cfg: IcAreaConfig
  scale: XScale
  height: number
  nowMs: number
  onDrillDown: (e: DrillDownEvent) => void
}

export default function IcChart({ area, cfg, scale, height, nowMs, onDrillDown }: Props) {
  const swings = useMemo(
    () => icSwings(area?.periods ?? [], scale.startMs, scale.endMs),
    [area, scale.startMs, scale.endMs],
  )
  const bySp = useMemo(() => new Map(swings.map(s => [s.boundaryMs, s])), [swings])
  const payloadFor = useCallback((ms: number) => bySp.get(ms) ?? null, [bySp])
  const pointer = useChartPointer({ scale, areaId: 'interconnectors', kind: 'ic', payloadFor, onDrillDown })
  const mid = height / 2

  return (
    <svg width={scale.width} height={height} {...pointer}>
      <PastShade scale={scale} nowMs={nowMs} height={height} />
      <Grid scale={scale} height={height} />
      <line x1={0} x2={scale.width} y1={mid} y2={mid} stroke="#56627A" />
      <Bars swings={swings} scale={scale} height={height} cfg={cfg} />
      <text x={scale.width - 6} y={14} textAnchor="end" fontSize={10.5} fill="#6B7789">▲ Import to GB</text>
      <text x={scale.width - 6} y={height - 6} textAnchor="end" fontSize={10.5} fill="#6B7789">▼ Export from GB</text>
      <CursorLine scale={scale} height={height} />
      <NowLine scale={scale} nowMs={nowMs} height={height} />
    </svg>
  )
}

const Bars = memo(function Bars({ swings, scale, height, cfg }: {
  swings: IcSwing[]; scale: XScale; height: number; cfg: IcAreaConfig
}) {
  const mid = height / 2
  const y = (v: number) => mid - Math.max(-1, Math.min(1, v / cfg.band)) * (mid - PAD)
  return (
    <g>
      {swings.map(({ boundaryMs, swing, estimated }) => {
        const x = scale.x(boundaryMs)
        const tone = icTone(Math.abs(swing), cfg.amber, cfg.red)
        const colour = TONE_COLOUR[tone]
        const end = y(swing)
        const top = Math.min(end, mid)
        const h = Math.max(1, Math.abs(end - mid))
        return (
          <g key={boundaryMs} opacity={estimated ? IC_ESTIMATE_OPACITY : undefined}>
            <rect x={x - 4} y={swing >= 0 ? mid - h : mid} width={8} height={h} rx={1.5} fill={colour} />
            {tone !== 'normal' && (
              <text x={x + 8} y={swing > 0 ? top + 10 : end - 2} fontSize={11.5} fontWeight={600} fill={colour}>
                {formatSigned(swing)}
              </text>
            )}
          </g>
        )
      })}
    </g>
  )
})
