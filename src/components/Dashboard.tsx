'use client'

import { useMemo, useState } from 'react'
import { AREAS, getArea, type AreaId } from '@/config/areas'
import { computeAreaStatus, type AreaStatus, type AreaStatusResult } from '@/utils/areaAggregates'
import type { SettlementPeriodData, AreaRequirementRow } from '@/models/types'

interface DashboardProps {
  settlementPeriods: SettlementPeriodData[]
  areaRequirements: Record<string, AreaRequirementRow[]>
  reservePct: number
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

export default function Dashboard({ settlementPeriods, areaRequirements, reservePct, onTileClick }: DashboardProps) {
  const [tfIndex, setTfIndex] = useState(1)  // default Next 4h
  const [view, setView]       = useState<'A' | 'B'>('A')

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
          SYSTEM BALANCE DASHBOARD
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
        <div style={{ display: 'flex', gap: 2, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 5, padding: 2 }}>
          {(['A', 'B'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                padding: '2px 10px', borderRadius: 4, fontSize: 10, cursor: 'pointer', border: 'none',
                background: view === v ? 'var(--accent,#6366f1)' : 'transparent',
                color: view === v ? '#fff' : 'var(--text-muted)',
              }}
            >
              {v}
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
              }}
              onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(1.1)')}
              onMouseLeave={e => (e.currentTarget.style.filter = '')}
            >
              {view === 'A' ? (
                <TileViewA area={area} status={status} color={color} />
              ) : (
                <TileViewB area={area} status={status} color={color} />
              )}
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
      <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '.08em', color, marginBottom: 1 }}>
        {STATUS_LABELS[status.status]}
      </div>
      <div style={{ fontSize: 20, fontWeight: 800, color, lineHeight: 1.1 }}>
        {sign}{Math.round(status.worstGap).toLocaleString()} {area.unit}
      </div>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', margin: '3px 0 6px' }}>
        {area.name}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--text-muted)', marginBottom: 6 }}>
        <span>Req: {Math.round(status.worstReq).toLocaleString()}</span>
        <span>Avail: {Math.round(status.worstAvail).toLocaleString()}</span>
      </div>
    </>
  )
}

// ── View B: numbers-first ─────────────────────────────────────────────────────

function TileViewB({ area, status, color }: {
  area: ReturnType<typeof getArea>
  status: AreaStatusResult
  color: string
}) {
  const sign = status.worstGap >= 0 ? '+' : ''
  return (
    <>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>{area.name}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginBottom: 6 }}>
        {[['Required', status.worstReq], ['Available', status.worstAvail]].map(([label, val]) => (
          <div key={label as string} style={{ background: 'var(--bg)', borderRadius: 4, padding: '5px 6px' }}>
            <div style={{ fontSize: 8, color: 'var(--text-muted)' }}>{label}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{Math.round(val as number).toLocaleString()}</div>
            <div style={{ fontSize: 8, color: 'var(--text-muted)' }}>{area.unit}</div>
          </div>
        ))}
      </div>
      <div style={{
        background: `${color}18`, border: `1px solid ${color}`, borderRadius: 3,
        padding: '3px 6px', textAlign: 'center', fontSize: 10, fontWeight: 700, color, marginBottom: 6,
      }}>
        {STATUS_LABELS[status.status].toUpperCase()} &nbsp; {sign}{Math.round(status.worstGap).toLocaleString()} {area.unit}
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
  const points = settlementPeriods.map((sp) => {
    let avail: number
    let req: number
    if (area === 'margin') {
      avail = sp.emx
      req = sp.demand * (1 + reservePct / 100)
    } else {
      avail = sp.areaAvailability?.[area] ?? 0
      req = areaRequirements.find(r => r.sp === sp.settlementPeriod)?.requirement ?? 0
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
  const availPts = points.map((p, i) => `${(i / (n - 1)) * W},${toY(p.avail)}`).join(' ')
  const reqPts   = points.map((p, i) => `${(i / (n - 1)) * W},${toY(p.req)}`).join(' ')

  const hasDeficit = points.some(p => p.avail < p.req)
  const fillColor = hasDeficit ? '#ef444420' : '#22c55e18'
  const lineColor = hasDeficit ? '#ef4444' : '#22c55e'

  const closedPts = `${availPts} ${W},${H} 0,${H}`

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H, display: 'block' }} preserveAspectRatio="none">
      <polygon points={closedPts} fill={fillColor} />
      <polyline points={reqPts}   fill="none" stroke="#64748b" strokeWidth=".8" strokeDasharray="2,2" />
      <polyline points={availPts} fill="none" stroke={lineColor} strokeWidth="1.2" />
    </svg>
  )
}
