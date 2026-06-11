'use client'

import { useMemo, useRef, useState } from 'react'
import type { BMUnit, ServiceType, SettlementPeriodData } from '@/models/types'
import { GSP_AREAS } from '@/config/scenarios'
import { GspFilterPopover, usePopoverDismiss } from '@/components/GspFilterPopover'
import { maxBatteryPn } from '@/utils/batteryPn'

interface Props {
  units: BMUnit[]
  settlementPeriods: SettlementPeriodData[]
  unitServices: Record<string, ServiceType>
}

const TIMEFRAME_OPTIONS = [
  { label: 'Next 30 min',  spCount: 1 },
  { label: 'Next 1 hour',  spCount: 2 },
  { label: 'Next 1.5 hours', spCount: 3 },
  { label: 'Next 2 hours', spCount: 4 },
]

type CardId = 'total' | 'contracted' | 'constrained' | 'usable'

const CARD_COLORS: Record<CardId, string> = {
  total:       '#58a6ff',
  contracted:  '#8b5cf6',
  constrained: '#ef4444',
  usable:      '#22c55e',
}

const CARD_LABELS: Record<CardId, string> = {
  total:       'Total',
  contracted:  'Contracted',
  constrained: 'Constrained',
  usable:      'Usable',
}

function ServiceChip({ service }: { service: ServiceType | undefined }) {
  if (!service) return <span style={{ color: 'var(--text-faint)', fontSize: 11 }}>—</span>
  return <span className={`chip chip-${service.toLowerCase()}`}>{service}</span>
}

function TypeChip() {
  return <span className="chip chip-battery">Battery</span>
}

function formatMw(value: number): string {
  return `${Math.round(value).toLocaleString()} MW`
}

function AsServicesPopover({ filter, onChange, onClose, wrapperRef }: {
  filter: { sr: boolean; qr: boolean }
  onChange: (f: { sr: boolean; qr: boolean }) => void
  onClose: () => void
  wrapperRef: React.RefObject<HTMLDivElement | null>
}) {
  const ref = useRef<HTMLDivElement>(null)
  usePopoverDismiss(ref, wrapperRef, onClose)

  return (
    <div ref={ref} style={{
      position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 50,
      background: 'var(--bg-panel)', border: '1px solid var(--border-strong)',
      borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.35)', width: 220, overflow: 'hidden',
    }}>
      <div style={{ padding: '7px 12px', borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-faint)' }}>
          Treat as contracted
        </span>
      </div>
      {(['sr', 'qr'] as const).map(key => (
        <label key={key} style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '7px 12px', fontSize: 12.5, color: 'var(--text)', cursor: 'pointer',
        }}>
          <input
            type="checkbox"
            checked={filter[key]}
            onChange={e => onChange({ ...filter, [key]: e.target.checked })}
          />
          {key.toUpperCase()} units
        </label>
      ))}
    </div>
  )
}

interface BatteryRow {
  bmUnitId: string
  nationalGridBmUnit: string
  gspGroup: string
  mel: number
  priceToMel: number
  pn: number | undefined
  capacity: number
}

export default function BatterySummaryTab({ units, settlementPeriods, unitServices }: Props) {
  const [gspFilter, setGspFilter] = useState<Record<string, 'include' | 'exclude'>>({})
  const [asFilter, setAsFilter] = useState<{ sr: boolean; qr: boolean }>({ sr: false, qr: false })
  const [tfIndex, setTfIndex] = useState(0)
  const [selectedCard, setSelectedCard] = useState<CardId | null>(null)
  const [gspOpen, setGspOpen] = useState(false)
  const [asOpen, setAsOpen] = useState(false)
  const gspWrapperRef = useRef<HTMLDivElement>(null)
  const asWrapperRef = useRef<HTMLDivElement>(null)

  const { spCount } = TIMEFRAME_OPTIONS[tfIndex]

  const rows = useMemo<BatteryRow[]>(() => {
    const windowSps = [...settlementPeriods]
      .sort((a, b) => a.settlementPeriod - b.settlementPeriod)
      .slice(0, spCount)

    return units.map(u => {
      const worstPn = maxBatteryPn(u.bmUnitId, windowSps)
      const mel = u.registeredCapacity ?? 0
      return {
        bmUnitId: u.bmUnitId,
        nationalGridBmUnit: u.nationalGridBmUnit,
        gspGroup: u.gspGroup,
        mel,
        priceToMel: u.priceToMel ?? 0,
        pn: worstPn,
        capacity: Math.max(0, mel - (worstPn ?? 0)),
      }
    })
  }, [units, settlementPeriods, spCount])

  const gspIncluded = useMemo(() => Object.entries(gspFilter).filter(([, v]) => v === 'include').map(([k]) => k), [gspFilter])
  const gspExcluded = useMemo(() => Object.entries(gspFilter).filter(([, v]) => v === 'exclude').map(([k]) => k), [gspFilter])

  function isConstrained(gspGroup: string): boolean {
    if (gspIncluded.length > 0 && !gspIncluded.includes(gspGroup)) return true
    if (gspExcluded.includes(gspGroup)) return true
    return false
  }

  const classified = useMemo(() => rows.map(r => {
    const constrained = isConstrained(r.gspGroup)
    const service = unitServices[r.bmUnitId]
    const contracted = !constrained && (
      (service === 'SR' && asFilter.sr) || (service === 'QR' && asFilter.qr)
    )
    const usable = !constrained && !contracted
    return { ...r, constrained, contracted, usable, service }
  }), [rows, gspIncluded, gspExcluded, unitServices, asFilter])

  const sumCapacity = (list: typeof classified) => list.reduce((s, r) => s + r.capacity, 0)

  const totalRows = classified
  const constrainedRows = classified.filter(r => r.constrained)
  const contractedRows = classified.filter(r => r.contracted)
  const usableRows = classified.filter(r => r.usable)

  const cardData: Record<CardId, { rows: typeof classified; sum: number }> = {
    total:       { rows: totalRows,       sum: sumCapacity(totalRows) },
    contracted:  { rows: contractedRows,  sum: sumCapacity(contractedRows) },
    constrained: { rows: constrainedRows, sum: sumCapacity(constrainedRows) },
    usable:      { rows: usableRows,      sum: sumCapacity(usableRows) },
  }

  const visibleRows = selectedCard
    ? cardData[selectedCard].rows
    : classified.filter(r => !r.constrained)

  function handleCardClick(card: CardId) {
    setSelectedCard(prev => prev === card ? null : card)
  }

  if (units.length === 0) {
    return (
      <div className="workspace-empty">
        <h2>No battery units found</h2>
        <p>No units with fuel type BATTERY were returned by the data source.</p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      {/* Filters row */}
      <div style={{
        padding: '10px 20px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-panel)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap',
        flexShrink: 0,
      }}>
        {/* GSP filter */}
        {(() => {
          const incCount = gspIncluded.length
          const excCount = gspExcluded.length
          const active = incCount > 0 || excCount > 0
          const excOnly = excCount > 0 && incCount === 0
          return (
            <div ref={gspWrapperRef} style={{ position: 'relative' }}>
              <button style={{
                border: `1px solid ${active ? (excOnly ? '#dc2626' : '#4f46e5') : 'var(--border-strong)'}`,
                borderRadius: 6, padding: '5px 10px', fontSize: 12, cursor: 'pointer',
                background: active ? (excOnly ? 'rgba(220,38,38,.1)' : 'rgba(79,70,229,.1)') : 'var(--bg-panel)',
                color: active ? (excOnly ? '#fca5a5' : '#a5b4fc') : 'var(--text-soft)',
                display: 'flex', alignItems: 'center', gap: 6,
              }} onClick={() => setGspOpen(o => !o)}>
                GSP ▾
                {incCount > 0 && <span style={{ background: '#4f46e5', color: '#fff', fontSize: 10, borderRadius: 999, padding: '1px 5px', fontWeight: 600 }}>+{incCount}</span>}
                {excCount > 0 && <span style={{ background: '#dc2626', color: '#fff', fontSize: 10, borderRadius: 999, padding: '1px 5px', fontWeight: 600 }}>−{excCount}</span>}
              </button>
              {gspOpen && <GspFilterPopover gspFilter={gspFilter} onChange={setGspFilter} onClose={() => setGspOpen(false)} wrapperRef={gspWrapperRef} />}
            </div>
          )
        })()}

        {/* AS Services filter */}
        {(() => {
          const count = (asFilter.sr ? 1 : 0) + (asFilter.qr ? 1 : 0)
          const active = count > 0
          return (
            <div ref={asWrapperRef} style={{ position: 'relative' }}>
              <button style={{
                border: `1px solid ${active ? '#4f46e5' : 'var(--border-strong)'}`,
                borderRadius: 6, padding: '5px 10px', fontSize: 12, cursor: 'pointer',
                background: active ? 'rgba(79,70,229,.1)' : 'var(--bg-panel)',
                color: active ? '#a5b4fc' : 'var(--text-soft)',
                display: 'flex', alignItems: 'center', gap: 6,
              }} onClick={() => setAsOpen(o => !o)}>
                AS Services ▾
                {count > 0 && <span style={{ background: '#4f46e5', color: '#fff', fontSize: 10, borderRadius: 999, padding: '1px 5px', fontWeight: 600 }}>{count}</span>}
              </button>
              {asOpen && <AsServicesPopover filter={asFilter} onChange={setAsFilter} onClose={() => setAsOpen(false)} wrapperRef={asWrapperRef} />}
            </div>
          )
        })()}

        {/* Timeframe selector */}
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

      {/* Summary cards */}
      <div style={{
        padding: '10px 20px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-panel)',
        display: 'flex',
        gap: 8,
        flexWrap: 'wrap',
        flexShrink: 0,
      }}>
        {(['total', 'contracted', 'constrained', 'usable'] as CardId[]).map(card => {
          const isActive = selectedCard === card
          const color = CARD_COLORS[card]
          const { rows: cardRows, sum } = cardData[card]
          const isEmpty = cardRows.length === 0
          return (
            <div
              key={card}
              onClick={() => handleCardClick(card)}
              style={{
                background: isActive ? `color-mix(in srgb, ${color} 12%, var(--bg-inset))` : 'var(--bg-inset)',
                border: `2px solid ${isActive ? color : 'var(--border)'}`,
                borderRadius: 6,
                padding: '8px 14px',
                cursor: 'pointer',
                minWidth: 110,
                opacity: isEmpty ? 0.4 : 1,
                transition: 'border-color 0.1s, background 0.1s, opacity 0.1s',
              }}
            >
              <div style={{ fontSize: 9, color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px' }}>
                {CARD_LABELS[card]}
              </div>
              <div style={{ color: 'var(--text)', fontSize: 16, fontWeight: 700, margin: '3px 0', fontFamily: 'monospace' }}>
                {formatMw(sum)}
              </div>
              <div style={{ color: 'var(--text-soft)', fontSize: 10 }}>
                {cardRows.length} unit{cardRows.length !== 1 ? 's' : ''}
              </div>
            </div>
          )
        })}
      </div>

      {/* Table */}
      <div className="table-scroll" style={{ flex: 1 }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>BMU</th>
              <th>Type</th>
              <th>Service</th>
              <th className="num">PN</th>
              <th className="num">MEL</th>
              <th className="num">Avail.</th>
              <th className="num">Cumulative</th>
              <th className="num">£ MEL</th>
            </tr>
          </thead>
          <tbody>
            {(() => {
              let cumulative = 0
              return visibleRows.map(row => {
                cumulative += row.capacity
                return (
                  <tr key={row.bmUnitId}>
                    <td className="mono">
                      <div className="bmu-cell-inner">
                        <span>{row.nationalGridBmUnit}</span>
                      </div>
                    </td>
                    <td><TypeChip /></td>
                    <td><ServiceChip service={row.service} /></td>
                    <td className="mono num">{row.pn !== undefined ? row.pn.toFixed(0) : '—'}</td>
                    <td className="mono num">{row.mel > 0 ? row.mel.toFixed(0) : '—'}</td>
                    <td className="mono num">{row.capacity.toFixed(0)}</td>
                    <td className="mono num">{cumulative.toFixed(0)}</td>
                    <td className="mono num">{row.priceToMel > 0 ? `£${row.priceToMel}` : '—'}</td>
                  </tr>
                )
              })
            })()}
          </tbody>
        </table>
      </div>
    </div>
  )
}
