'use client'

import { useMemo, useRef, useState } from 'react'
import type { BMUnit, ServiceType, SettlementPeriodData } from '@/models/types'
import { GSP_AREAS } from '@/config/scenarios'
import { GspFilterPopover, usePopoverDismiss } from '@/components/GspFilterPopover'
import { TIMEFRAME_OPTIONS, AsServicesPopover, type AsServicesFilter } from '@/components/BatteryFilters'
import { computeBatteryAvailability } from '@/utils/batteryAvailability'
import { computeBatteryReliability } from '@/utils/batteryReliability'

interface Props {
  units: BMUnit[]
  settlementPeriods: SettlementPeriodData[]
  unitServices: Record<string, ServiceType>
  gspFilter: Record<string, 'include' | 'exclude'>
  onGspFilterChange: (f: Record<string, 'include' | 'exclude'>) => void
  asFilter: AsServicesFilter
  onAsFilterChange: (f: AsServicesFilter) => void
  tfIndex: number
  onTfIndexChange: (i: number) => void
  deRatePct: number
  onDeRatePctChange: (pct: number) => void
  priceThreshold: string
  onPriceThresholdChange: (v: string) => void
}

type CardId = 'total' | 'contracted' | 'constrained' | 'highPrice' | 'derated' | 'usable'

const CARD_COLORS: Record<CardId, string> = {
  total:       '#58a6ff',
  contracted:  '#8b5cf6',
  constrained: '#ef4444',
  highPrice:   '#f59e0b',
  derated:     '#f97316',
  usable:      '#22c55e',
}

const CARD_LABELS: Record<CardId, string> = {
  total:       'Total',
  contracted:  'Contracted',
  constrained: 'Constrained',
  highPrice:   'High Price',
  derated:     'Derated',
  usable:      'Usable',
}

function ServiceChip({ service }: { service: ServiceType | undefined }) {
  if (!service) return <span style={{ color: 'var(--text-faint)', fontSize: 11 }}>—</span>
  return <span className={`chip chip-${service.toLowerCase()}`}>{service}</span>
}

const FUEL_DISPLAY: Record<string, { label: string; chipClass: string }> = {
  BATTERY: { label: 'Battery', chipClass: 'chip-battery' },
  CCGT:    { label: 'CCGT',    chipClass: 'chip-ccgt' },
  COAL:    { label: 'Coal',    chipClass: 'chip-coal' },
  NUCLEAR: { label: 'Nuclear', chipClass: 'chip-nuclear' },
  BIOMASS: { label: 'Biomass', chipClass: 'chip-biomass' },
  PS:      { label: 'Pumped',  chipClass: 'chip-pumped' },
  NPSHYD:  { label: 'Hydro',   chipClass: 'chip-hydro' },
  OCGT:    { label: 'OCGT',    chipClass: 'chip-ocgt' },
  GAS:     { label: 'Gas',     chipClass: 'chip-ccgt' },
  OIL:     { label: 'Oil',     chipClass: 'chip-coal' },
  WIND:    { label: 'Wind',    chipClass: 'chip-wind' },
  SOLAR:   { label: 'Solar',   chipClass: 'chip-wind' },
}

function getFuelDisplay(fuelType: string): { label: string; chipClass: string } {
  return FUEL_DISPLAY[fuelType] ?? { label: fuelType, chipClass: '' }
}

function TypeChip({ fuelType }: { fuelType: string }) {
  const { label, chipClass } = getFuelDisplay(fuelType)
  return <span className={`chip ${chipClass}`}>{label}</span>
}

function TypeFilterPopover({ options, selected, onToggle, onClose, wrapperRef }: {
  options: string[]
  selected: Set<string>
  onToggle: (type: string) => void
  onClose: () => void
  wrapperRef: React.RefObject<HTMLDivElement | null>
}) {
  const ref = useRef<HTMLDivElement>(null)
  usePopoverDismiss(ref, wrapperRef, onClose)

  return (
    <div ref={ref} style={{
      position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 50,
      background: 'var(--bg-panel)', border: '1px solid var(--border-strong)',
      borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.35)', width: 200,
      maxHeight: 280, overflowY: 'auto',
    }}>
      <div style={{ padding: '7px 12px', borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-faint)' }}>
          Filter by type
        </span>
      </div>
      {options.map(ft => (
        <label key={ft} style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '7px 12px', fontSize: 12.5, color: 'var(--text)', cursor: 'pointer',
        }}>
          <input
            type="checkbox"
            checked={selected.has(ft)}
            onChange={() => onToggle(ft)}
          />
          {getFuelDisplay(ft).label}
        </label>
      ))}
    </div>
  )
}

function formatMw(value: number): string {
  return `${Math.round(value).toLocaleString()} MW`
}

export default function BatterySummaryTab({
  units, settlementPeriods, unitServices,
  gspFilter, onGspFilterChange, asFilter, onAsFilterChange, tfIndex, onTfIndexChange,
  deRatePct, onDeRatePctChange, priceThreshold, onPriceThresholdChange,
}: Props) {
  const [selectedCard, setSelectedCard] = useState<CardId | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [gspOpen, setGspOpen] = useState(false)
  const [asOpen, setAsOpen] = useState(false)
  const [typeOpen, setTypeOpen] = useState(false)
  const [typeFilter, setTypeFilter] = useState<Set<string>>(new Set())
  const gspWrapperRef = useRef<HTMLDivElement>(null)
  const asWrapperRef = useRef<HTMLDivElement>(null)
  const typeWrapperRef = useRef<HTMLDivElement>(null)

  const { spCount } = TIMEFRAME_OPTIONS[tfIndex]

  const availableTypes = useMemo(
    () => Array.from(new Set(units.map(u => u.fuelType))).sort(),
    [units]
  )

  const filteredUnits = useMemo(
    () => typeFilter.size === 0 ? units : units.filter(u => typeFilter.has(u.fuelType)),
    [units, typeFilter]
  )

  function toggleTypeFilter(fuelType: string) {
    setTypeFilter(prev => {
      const next = new Set(prev)
      if (next.has(fuelType)) next.delete(fuelType)
      else next.add(fuelType)
      return next
    })
  }

  const rows = useMemo(
    () => computeBatteryAvailability(filteredUnits, settlementPeriods, spCount),
    [filteredUnits, settlementPeriods, spCount]
  )

  const gspIncluded = useMemo(() => Object.entries(gspFilter).filter(([, v]) => v === 'include').map(([k]) => k), [gspFilter])
  const gspExcluded = useMemo(() => Object.entries(gspFilter).filter(([, v]) => v === 'exclude').map(([k]) => k), [gspFilter])

  const numericPriceThreshold = priceThreshold === '' ? undefined : Number(priceThreshold)

  const classified = useMemo(
    () => computeBatteryReliability(rows, gspFilter, asFilter, unitServices, 0, 0, numericPriceThreshold).rows,
    [rows, gspFilter, asFilter, unitServices, numericPriceThreshold]
  )

  const sumCapacity = (list: typeof classified) => list.reduce((s, r) => s + r.avail, 0)

  const totalRows = classified
  const constrainedRows = classified.filter(r => r.constrained)
  const contractedRows = classified.filter(r => r.contracted)
  const highPriceRows = classified.filter(r => r.highPrice)
  const usableRows = classified.filter(r => r.included)

  const usableBeforeDerate = sumCapacity(usableRows)
  const deratedAmount = usableBeforeDerate * (deRatePct / 100)
  const reliableUsable = usableBeforeDerate - deratedAmount

  const cardData: Record<CardId, { rows: typeof classified; sum: number }> = {
    total:       { rows: totalRows,       sum: sumCapacity(totalRows) },
    contracted:  { rows: contractedRows,  sum: sumCapacity(contractedRows) },
    constrained: { rows: constrainedRows, sum: sumCapacity(constrainedRows) },
    highPrice:   { rows: highPriceRows,   sum: sumCapacity(highPriceRows) },
    derated:     { rows: usableRows,      sum: deratedAmount },
    usable:      { rows: usableRows,      sum: reliableUsable },
  }

  const visibleCards: CardId[] = ['total', 'contracted', 'constrained', 'highPrice', 'derated', 'usable']

  const unsortedVisibleRows = selectedCard
    ? cardData[selectedCard].rows
    : classified.filter(r => !r.constrained)

  const visibleRows = useMemo(() => {
    return [...unsortedVisibleRows].sort((a, b) => {
      const aPriced = a.priceToMel > 0
      const bPriced = b.priceToMel > 0
      if (aPriced && bPriced) return a.priceToMel - b.priceToMel
      if (aPriced !== bPriced) return aPriced ? -1 : 1
      return 0
    })
  }, [unsortedVisibleRows])

  function handleCardClick(card: CardId) {
    setSelectedCard(prev => prev === card ? null : card)
  }

  function toggleRowSelected(bmUnitId: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(bmUnitId)) next.delete(bmUnitId)
      else next.add(bmUnitId)
      return next
    })
  }

  const allVisibleSelected = visibleRows.length > 0 && visibleRows.every(r => selectedIds.has(r.bmUnitId))
  const someVisibleSelected = visibleRows.some(r => selectedIds.has(r.bmUnitId))

  function toggleAllVisible() {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (allVisibleSelected) {
        for (const r of visibleRows) next.delete(r.bmUnitId)
      } else {
        for (const r of visibleRows) next.add(r.bmUnitId)
      }
      return next
    })
  }

  if (units.length === 0) {
    return (
      <div className="workspace-empty">
        <h2>No units found</h2>
        <p>No units were returned by the data source.</p>
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
              {gspOpen && <GspFilterPopover gspFilter={gspFilter} onChange={onGspFilterChange} onClose={() => setGspOpen(false)} wrapperRef={gspWrapperRef} />}
            </div>
          )
        })()}

        {/* Type filter */}
        {(() => {
          const count = typeFilter.size
          const active = count > 0
          return (
            <div ref={typeWrapperRef} style={{ position: 'relative' }}>
              <button style={{
                border: `1px solid ${active ? '#4f46e5' : 'var(--border-strong)'}`,
                borderRadius: 6, padding: '5px 10px', fontSize: 12, cursor: 'pointer',
                background: active ? 'rgba(79,70,229,.1)' : 'var(--bg-panel)',
                color: active ? '#a5b4fc' : 'var(--text-soft)',
                display: 'flex', alignItems: 'center', gap: 6,
              }} onClick={() => setTypeOpen(o => !o)}>
                Type ▾
                {count > 0 && <span style={{ background: '#4f46e5', color: '#fff', fontSize: 10, borderRadius: 999, padding: '1px 5px', fontWeight: 600 }}>{count}</span>}
              </button>
              {typeOpen && (
                <TypeFilterPopover
                  options={availableTypes}
                  selected={typeFilter}
                  onToggle={toggleTypeFilter}
                  onClose={() => setTypeOpen(false)}
                  wrapperRef={typeWrapperRef}
                />
              )}
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
              {asOpen && <AsServicesPopover filter={asFilter} onChange={onAsFilterChange} onClose={() => setAsOpen(false)} wrapperRef={asWrapperRef} />}
            </div>
          )
        })()}

        {/* Max price filter */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-soft)' }}>
          Max £ MEL
          <input
            type="number"
            min={0}
            value={priceThreshold}
            onChange={e => onPriceThresholdChange(e.target.value)}
            style={{
              width: 80, padding: '4px 8px', fontSize: 12, borderRadius: 4,
              border: '1px solid var(--border-strong)', background: 'var(--bg-panel)', color: 'var(--text)',
            }}
          />
        </label>

        {/* Derating */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-soft)' }}>
          De-rate (%)
          <input
            type="number"
            min={0}
            max={100}
            value={deRatePct}
            onChange={e => onDeRatePctChange(Math.min(100, Math.max(0, Number(e.target.value))))}
            style={{
              width: 70, padding: '4px 8px', fontSize: 12, borderRadius: 4,
              border: '1px solid var(--border-strong)', background: 'var(--bg-panel)', color: 'var(--text)',
            }}
          />
        </label>

        {/* Timeframe selector */}
        <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
          {TIMEFRAME_OPTIONS.map((opt, i) => (
            <button
              key={opt.label}
              onClick={() => onTfIndexChange(i)}
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
        {visibleCards.map(card => {
          const isActive = selectedCard === card
          const color = CARD_COLORS[card]
          const { rows: cardRows, sum } = cardData[card]
          const isEmpty = card === 'derated' ? sum <= 0 : cardRows.length === 0
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
        <table className="data-table" style={{ tableLayout: 'fixed', width: '100%' }}>
          <thead>
            <tr>
              <th className="check-col" style={{ width: 32 }}>
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  ref={el => { if (el) el.indeterminate = !allVisibleSelected && someVisibleSelected }}
                  onChange={toggleAllVisible}
                  aria-label="Select all visible"
                />
              </th>
              <th style={{ width: 220 }}>BMU</th>
              <th className="center">Type</th>
              <th className="center">Service</th>
              <th className="num">PN</th>
              <th className="num">MEL</th>
              <th className="num">MDO</th>
              <th className="num">Cumul. Offers</th>
              <th className="num">£ MEL</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 && (
              <tr><td colSpan={9} className="empty">No units match your filters.</td></tr>
            )}
            {(() => {
              let cumulativeOffers = 0
              return visibleRows.map(row => {
                cumulativeOffers += row.mdo
                return (
                  <tr key={row.bmUnitId}>
                    <td className="check-col">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(row.bmUnitId)}
                        onChange={() => toggleRowSelected(row.bmUnitId)}
                      />
                    </td>
                    <td className="mono">
                      <div className="bmu-cell-inner">
                        <span>{row.nationalGridBmUnit}</span>
                      </div>
                    </td>
                    <td className="center"><TypeChip fuelType={row.fuelType} /></td>
                    <td className="center"><ServiceChip service={row.service} /></td>
                    <td className="mono num">{row.pn !== undefined ? row.pn.toFixed(0) : '—'}</td>
                    <td className="mono num">{row.mel > 0 ? row.mel.toFixed(0) : '—'}</td>
                    <td className="mono num">{row.mdo.toFixed(0)}</td>
                    <td className="mono num">{cumulativeOffers.toFixed(0)}</td>
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
