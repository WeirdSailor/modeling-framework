'use client'

// Layers shared by every row: past shading, SP grid, cursor line, Now line — plus pointer handling
// that writes to the shared cursor store.

import { memo, useCallback, useId, type MouseEvent } from 'react'
import type { XScale } from '../../geometry'
import { SP_MS } from '../../time'
import { useCursorMs, useCursorStore } from '../../state/cursorStore'
import type { AreaId, AreaKind, DrillDownEvent } from '../../types'

const HOUR_MS = 60 * 60 * 1000

export const PastShade = memo(function PastShade({ scale, nowMs, height }: { scale: XScale; nowMs: number; height: number }) {
  if (nowMs <= scale.startMs) return null
  const w = Math.min(scale.width, scale.x(nowMs))
  return <rect x={0} y={0} width={w} height={height} fill="rgba(255,255,255,.035)" />
})

export const Grid = memo(function Grid({ scale, height }: { scale: XScale; height: number }) {
  const hourOnly = scale.endMs - scale.startMs >= 24 * HOUR_MS
  const lines = []
  for (let k = 1; k < scale.nSp; k++) {
    const t = scale.startMs + k * SP_MS
    const onHour = t % HOUR_MS === 0
    if (hourOnly && !onHour) continue
    const x = k * scale.spWidth
    lines.push(<line key={t} x1={x} x2={x} y1={0} y2={height} stroke={onHour ? '#28313D' : '#1E252F'} />)
  }
  return <g>{lines}</g>
})

/** Single dotted cursor line at the cursor SP's midpoint. */
export function CursorLine({ scale, height }: { scale: XScale; height: number }) {
  const cursorMs = useCursorMs()
  if (cursorMs === null || cursorMs < scale.startMs || cursorMs >= scale.endMs) return null
  const x = scale.x(cursorMs + SP_MS / 2)
  return <line x1={x} x2={x} y1={0} y2={height} stroke="#9AA6B8" strokeDasharray="3 3" pointerEvents="none" />
}

/** Drawn last in every row so it sits above all content. Hidden when Now is outside the window. */
export function NowLine({ scale, nowMs, height }: { scale: XScale; nowMs: number; height: number }) {
  if (nowMs < scale.startMs || nowMs > scale.endMs) return null
  const x = scale.x(nowMs)
  return <line x1={x} x2={x} y1={0} y2={height} stroke="#E7EBF0" strokeWidth={1.5} pointerEvents="none" />
}

/** Unique, url()-safe id for per-row clipPaths. */
export function useSvgId(prefix: string): string {
  return `${prefix}-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
}

interface PointerOptions {
  scale: XScale
  areaId?: AreaId
  kind?: AreaKind
  payloadFor?: (spMs: number) => unknown
  onDrillDown?: (e: DrillDownEvent) => void
}

/** Hover snaps to the SP under the pointer; click pins/unpins and emits a drill-down event. */
export function useChartPointer({ scale, areaId, kind, payloadFor, onDrillDown }: PointerOptions) {
  const store = useCursorStore()

  const spFromEvent = useCallback((e: MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    return scale.spAt(e.clientX - rect.left)
  }, [scale])

  const onPointerMove = useCallback((e: MouseEvent<SVGSVGElement>) => {
    const cur = store.get()
    if (cur.pinnedMs !== null) return // pinned: hovering elsewhere shows nothing extra
    const ms = spFromEvent(e)
    if (cur.hoverMs === ms && (cur.hover?.areaId ?? null) === (areaId ?? null)) return
    store.set({
      hoverMs: ms,
      hover: areaId && kind
        ? { areaId, kind, spStart: new Date(ms).toISOString(), data: payloadFor?.(ms) ?? null }
        : null,
    })
  }, [store, spFromEvent, areaId, kind, payloadFor])

  const onPointerLeave = useCallback(() => {
    store.set({ hoverMs: null, hover: null })
  }, [store])

  const onClick = useCallback((e: MouseEvent<SVGSVGElement>) => {
    const ms = spFromEvent(e)
    if (store.get().pinnedMs === ms) store.set({ pinnedMs: null, hoverMs: ms })
    else store.set({ pinnedMs: ms, hoverMs: null })
    if (areaId) onDrillDown?.({ areaId, spStart: new Date(ms).toISOString() })
  }, [store, spFromEvent, areaId, onDrillDown])

  return { onPointerMove, onPointerLeave, onClick, style: { cursor: 'crosshair' } as const }
}
