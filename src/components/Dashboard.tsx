'use client'

import { useMemo, useState } from 'react'
import { AREAS, getArea, type AreaId } from '@/config/areas'
import { computeAreaStatus, type AreaStatus, type AreaStatusResult } from '@/utils/areaAggregates'
import type { SettlementPeriodData, AreaRequirementRow, DraftPlan, UnitSnapshot } from '@/models/types'

const CHANGE_THRESHOLD = 10 // percent — must match CommittedTab

interface TileAlert {
  dataArrow: '↑' | '↓' | null
  dataColor: string
  priceArrow: '↑' | '↓' | null
  priceColor: string
}

function computeTileAlert(
  areaId: string,
  drafts: DraftPlan[],
  dataOverrides: Record<string, Partial<UnitSnapshot>>,
): TileAlert {
  const reasonCode = areaId.toUpperCase()
  const DATA_FIELDS: (keyof UnitSnapshot)[] = ['mel', 'sel', 'ndz', 'mzt', 'mnzt']
  const PRICE_FIELDS: (keyof UnitSnapshot)[] = ['priceToSel', 'priceToMel']

  let dataHasUp = false, dataHasDown = false
  let priceHasUp = false, priceHasDown = false

  for (const draft of drafts) {
    if (draft.status !== 'committed') continue
    for (const action of draft.actions) {
      if (action.reasonCode !== reasonCode) continue
      const snap = draft.dataSnapshot?.[action.bmUnitId]
      if (!snap) continue
      const ov = dataOverrides[action.bmUnitId] ?? {}

      for (const field of DATA_FIELDS) {
        const snapVal = snap[field] as number
        const curr    = (ov[field] as number | undefined) ?? snapVal
        if (snapVal === 0) continue
        const pct = (curr - snapVal) / snapVal * 100
        if (Math.abs(pct) < CHANGE_THRESHOLD) continue
        if (pct > 0) dataHasUp = true; else dataHasDown = true
      }

      for (const field of PRICE_FIELDS) {
        const snapVal = snap[field] as number
        const curr    = (ov[field] as number | undefined) ?? snapVal
        if (snapVal === 0) continue
        const pct = (curr - snapVal) / snapVal * 100
        if (Math.abs(pct) < CHANGE_THRESHOLD) continue
        if (pct > 0) priceHasUp = true; else priceHasDown = true
      }
    }
  }

  // Worst data position: any down beats all up (down = capacity lost = bad)
  const dataArrow  = dataHasDown  ? '↓' : dataHasUp  ? '↑' : null
  const dataColor  = dataHasDown  ? '#ef4444' : '#22c55e'
  // Worst price position: any up beats all down (up = more expensive = bad, inverted)
  const priceArrow = priceHasUp   ? '↑' : priceHasDown ? '↓' : null
  const priceColor = priceHasUp   ? '#ef4444' : '#22c55e'

  return { dataArrow, dataColor, priceArrow, priceColor }
}

interface DashboardProps {
  settlementPeriods: SettlementPeriodData[]
  areaRequirements: Record<string, AreaRequirementRow[]>
  areaThresholds: Record<string, number>
  reservePct: number
  drafts: DraftPlan[]
  dataOverrides: Record<string, Partial<UnitSnapshot>>
  onTileClick: (area: AreaId) => void
}

const TIMEFRAME_OPTIONS = [
  { label: 'Next 2h',  spCount: 4  },
  { label: 'Next 4h',  spCount: 8  },
  { label: 'Next 8h',  spCount: 16 },
  { label: 'Next 12h', spCount: 24 },
  { label: 'Next 24h', spCount: 48 },
]

const STATUS_COLORS: Record<AreaStatus, string> = {
  shortfall: 'var(--red,#ef4444)',
  tight:     'var(--amber,#f59e0b)',
  ok:        'var(--green,#22c55e)',
}

const STATUS_LABELS: Record<AreaStatus, string> = {
  shortfall: 'Shortfall',
  tight:     'Tight',
  ok:        'OK',
}

export default function Dashboard({ settlementPeriods, areaRequirements, areaThresholds, reservePct, drafts, dataOverrides, onTileClick }: DashboardProps) {
  const [tfIndex, setTfIndex] = useState(1)  // default Next 4h

  const { spCount } = TIMEFRAME_OPTIONS[tfIndex]

  const areaStatuses = useMemo(() =>
    AREAS.map(a => ({
      area: a,
      status: computeAreaStatus(a.id, settlementPeriods, areaRequirements, spCount, reservePct),
    }))
  , [settlementPeriods, areaRequirements, spCount, reservePct])

  if (settlementPeriods.length === 0) {
    return <div style={{ padding: 24, color: 'var(--text-muted)' }}>Loading system data…</div>
  }

  return (
    <div style={{ padding: '12px 16px' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.06em', color: 'var(--text)' }}>
          System Dashboard — {TIMEFRAME_OPTIONS[tfIndex].label}
        </span>
        <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
          {TIMEFRAME_OPTIONS.map((opt, i) => (
            <button
              key={opt.label}
              onClick={() => setTfIndex(i)}
              style={{
                padding: '3px 10px', borderRadius: 4, fontSize: 11, cursor: 'pointer',
                background: tfIndex === i ? 'var(--accent,#6366f1)' : 'var(--surface)',
                color: tfIndex === i ? '#fff' : 'var(--text-muted)',
                border: '1px solid var(--border)',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tile grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        {areaStatuses.map(({ area, status }) => {
          const color = STATUS_COLORS[status.status]
          const borderSide = `3px solid ${color}`
          const rows = areaRequirements[area.id] ?? []

          return (
            <div
              key={area.id}
              onClick={() => onTileClick(area.id)}
              style={{
                background: 'var(--surface)',
                borderRadius: 8,
                padding: '12px 14px',
                borderLeft: borderSide,
                cursor: 'pointer',
                transition: 'filter .15s',
                position: 'relative',
              }}
              onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(1.1)')}
              onMouseLeave={e => (e.currentTarget.style.filter = '')}
            >
              {(() => {
                const alert = computeTileAlert(area.id, drafts, dataOverrides)
                const hasAlert = alert.dataArrow !== null || alert.priceArrow !== null
                return hasAlert ? (
                  <div style={{
                    position: 'absolute', top: 8, right: 8,
                    display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1,
                    pointerEvents: 'none',
                  }}>
                    {alert.dataArrow !== null && (
                      <span style={{ fontSize: 9, fontWeight: 700, color: alert.dataColor, letterSpacing: '.02em' }}>
                        DATA {alert.dataArrow}
                      </span>
                    )}
                    {alert.priceArrow !== null && (
                      <span style={{ fontSize: 9, fontWeight: 700, color: alert.priceColor, letterSpacing: '.02em' }}>
                        £ {alert.priceArrow}
                      </span>
                    )}
                  </div>
                ) : null
              })()}
              <TileViewA area={area} status={status} color={color} />
              <Sparkline
                area={area.id}
                settlementPeriods={settlementPeriods}
                areaRequirements={rows}
                reservePct={reservePct}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── View A: status-first ──────────────────────────────────────────────────────

function TileViewA({ area, status, color }: {
  area: ReturnType<typeof getArea>
  status: AreaStatusResult
  color: string
}) {
  const sign = status.worstGap >= 0 ? '+' : ''
  return (
    <>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
        {area.name}
      </div>
      <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '.08em', color, marginBottom: 1 }}>
        {STATUS_LABELS[status.status]}
      </div>
      <div style={{ fontSize: 20, fontWeight: 800, color, lineHeight: 1.1 }}>
        {sign}{Math.round(status.worstGap).toLocaleString()} {area.unit}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--text-muted)', marginBottom: 6 }}>
        <span>Req: {Math.round(status.worstReq).toLocaleString()}</span>
        <span>Avail: {Math.round(status.worstAvail).toLocaleString()}</span>
      </div>
    </>
  )
}

// ── Sparkline ─────────────────────────────────────────────────────────────────

function Sparkline({ area, settlementPeriods, areaRequirements, reservePct }: {
  area: string
  settlementPeriods: SettlementPeriodData[]
  areaRequirements: AreaRequirementRow[]
  reservePct: number
}) {
  const points = settlementPeriods.map((sp, i) => {
    let avail: number
    let req: number
    if (area === 'margin') {
      avail = sp.emx
      req = sp.demand * (1 + reservePct / 100)
    } else {
      avail = sp.areaAvailability?.[area] ?? 0
      req = areaRequirements[i]?.requirement ?? 0
    }
    return { avail, req }
  })

  if (points.length === 0) return null

  const allVals = points.flatMap(p => [p.avail, p.req]).filter(v => v > 0)
  const min = Math.min(...allVals, 0)
  const max = Math.max(...allVals, 1)
  const range = max - min || 1

  const W = 100, H = 28
  const toY = (v: number) => H - ((v - min) / range) * H

  const n = points.length
  const hasReq = points.some(p => p.req > 0)
  const reqPts = hasReq
    ? points.map((p, i) => `${(i / (n - 1)) * W},${toY(p.req)}`).join(' ')
    : null

  const xOf = (i: number) => (i / (n - 1)) * W
  const closedPts = [
    ...points.map((p, i) => `${xOf(i)},${toY(p.avail)}`),
    `${W},${H}`, `0,${H}`,
  ].join(' ')

  // one <line> segment per adjacent pair, coloured independently
  const segments = points.slice(0, -1).map((p, i) => {
    const next = points[i + 1]
    const deficit = p.avail < p.req || next.avail < next.req
    return {
      x1: xOf(i),     y1: toY(p.avail),
      x2: xOf(i + 1), y2: toY(next.avail),
      color: deficit ? '#ef4444' : '#22c55e',
    }
  })

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H, display: 'block' }} preserveAspectRatio="none">
      <polygon points={closedPts} fill="#64748b14" />
      {reqPts && <polyline points={reqPts} fill="none" stroke="#64748b" strokeWidth=".8" strokeDasharray="2,2" />}
      {segments.map((s, i) => (
        <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={s.color} strokeWidth="1.5" />
      ))}
    </svg>
  )
}
