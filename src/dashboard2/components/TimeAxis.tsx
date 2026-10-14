'use client'

// Header row time axis (spec §8.5): tick labels, midnight day badges, Now badge, cursor badge.

import { useMemo } from 'react'
import type { XScale } from '../geometry'
import { SP_MS, axisTicks, formatHHMM, formatWeekday, isLondonMidnight } from '../time'
import { HEADER_HEIGHT, MIN_TICK_PX } from '../dashboard.config'
import { useCursorMs } from '../state/cursorStore'
import { CursorLine, PastShade, useChartPointer } from './charts/ChartFrame'

interface Props {
  scale: XScale
  nowMs: number
  tickMinutes: number
}

const H = HEADER_HEIGHT
const clampBadge = (x: number, w: number, width: number) => Math.max(w / 2, Math.min(width - w / 2, x))

function Badge({ x, w, label, fill, stroke, color, weight }: {
  x: number; w: number; label: string; fill: string; stroke?: string; color: string; weight: number
}) {
  return (
    <g pointerEvents="none">
      <rect x={x - w / 2} y={7} width={w} height={20} rx={4} fill={fill} stroke={stroke} />
      <text x={x} y={21} textAnchor="middle" fontSize={11.5} fontWeight={weight} fill={color}>{label}</text>
    </g>
  )
}

export default function TimeAxis({ scale, nowMs, tickMinutes }: Props) {
  const cursorMs = useCursorMs()
  const pointer = useChartPointer({ scale })
  const ticks = useMemo(() => axisTicks(scale.startMs, scale.endMs, tickMinutes), [scale.startMs, scale.endMs, tickMinutes])

  const nowVisible = nowMs >= scale.startMs && nowMs <= scale.endMs
  const nowX = nowVisible ? scale.x(nowMs) : null
  const cursorVisible = cursorMs !== null && cursorMs >= scale.startMs && cursorMs < scale.endMs
  const cursorX = cursorVisible ? scale.x(cursorMs + SP_MS / 2) : null

  // Hide tick labels that would collide with the Now or cursor badge.
  const tickPx = tickMinutes * (scale.width / ((scale.endMs - scale.startMs) / 60000))
  const minGap = 0.9 * Math.min(tickPx, MIN_TICK_PX)
  const collides = (x: number) =>
    (nowX !== null && Math.abs(x - nowX) < minGap) || (cursorX !== null && Math.abs(x - cursorX) < minGap)

  return (
    <svg width={scale.width} height={H} {...pointer}>
      <PastShade scale={scale} nowMs={nowMs} height={H} />
      {ticks.map(t => {
        const x = scale.x(t)
        if (collides(x)) return null
        if (isLondonMidnight(t)) {
          return (
            <Badge key={t} x={clampBadge(x, 76, scale.width)} w={76} label={`${formatWeekday(t)} 00:00`}
              fill="#2A3442" color="#E7EBF0" weight={600} />
          )
        }
        return (
          <text key={t} x={x} y={21} textAnchor="middle" fontSize={11.5} fill="#8C97A7" pointerEvents="none">
            {formatHHMM(t)}
          </text>
        )
      })}
      <CursorLine scale={scale} height={H} />
      {cursorX !== null && cursorMs !== null && (
        <Badge x={clampBadge(cursorX, 52, scale.width)} w={52} label={formatHHMM(cursorMs)}
          fill="#2A3442" stroke="#9AA6B8" color="#E7EBF0" weight={600} />
      )}
      {nowX !== null && (
        <Badge x={clampBadge(nowX, 68, scale.width)} w={68} label={`Now ${formatHHMM(nowMs)}`}
          fill="#E7EBF0" color="#0D1117" weight={700} />
      )}
    </svg>
  )
}
