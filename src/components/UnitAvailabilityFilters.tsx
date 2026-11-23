'use client'

import { useRef, useState, type ReactNode } from 'react'
import { GspFilterPopover, usePopoverDismiss } from '@/components/GspFilterPopover'
import { TIMEFRAME_OPTIONS, AsServicesPopover, type AsServicesFilter } from '@/components/BatteryFilters'

export type CardId = 'total' | 'contracted' | 'constrained' | 'highPrice' | 'derated' | 'usable'

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

export function getFuelDisplay(fuelType: string): { label: string; chipClass: string } {
  return FUEL_DISPLAY[fuelType] ?? { label: fuelType, chipClass: '' }
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


export interface UnitFilterState {
  typeFilter: Set<string>
  asFilter: AsServicesFilter
  deRatePct: number
  priceThreshold: string
}

interface FilterProps extends UnitFilterState {
  availableTypes: string[]
  onTypeFilterChange: (value: Set<string>) => void
  gspFilter: Record<string, 'include' | 'exclude'>
  onGspFilterChange: (value: Record<string, 'include' | 'exclude'>) => void
  onAsFilterChange: (value: AsServicesFilter) => void
  onDeRatePctChange: (value: number) => void
  onPriceThresholdChange: (value: string) => void
  trailingControls?: ReactNode
  tfIndex?: number
  onTfIndexChange?: (value: number) => void
}

export function UnitAvailabilityFilters({
  availableTypes, typeFilter, onTypeFilterChange, gspFilter, onGspFilterChange,
  asFilter, onAsFilterChange, deRatePct, onDeRatePctChange,
  priceThreshold, onPriceThresholdChange, tfIndex, onTfIndexChange, trailingControls,
}: FilterProps) {
  const [gspOpen, setGspOpen] = useState(false)
  const [asOpen, setAsOpen] = useState(false)
  const [typeOpen, setTypeOpen] = useState(false)
  const gspWrapperRef = useRef<HTMLDivElement>(null)
  const asWrapperRef = useRef<HTMLDivElement>(null)
  const typeWrapperRef = useRef<HTMLDivElement>(null)
  const gspIncluded = Object.keys(gspFilter).filter(key => gspFilter[key] === 'include')
  const gspExcluded = Object.keys(gspFilter).filter(key => gspFilter[key] === 'exclude')

  function toggleTypeFilter(fuelType: string) {
    const next = new Set(typeFilter)
    if (next.has(fuelType)) next.delete(fuelType)
    else next.add(fuelType)
    onTypeFilterChange(next)
  }

  return (
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
        {/* Type filter */}
        {(() => {
          const count = typeFilter.size
          const active = count > 0
          return (
            <div ref={typeWrapperRef} style={{ position: 'relative' }}>
              <button type="button" aria-expanded={typeOpen} style={{
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

        {/* GSP filter */}
        {(() => {
          const incCount = gspIncluded.length
          const excCount = gspExcluded.length
          const active = incCount > 0 || excCount > 0
          const excOnly = excCount > 0 && incCount === 0
          return (
            <div ref={gspWrapperRef} style={{ position: 'relative' }}>
              <button type="button" aria-expanded={gspOpen} style={{
                border: `1px solid ${active ? (excOnly ? '#dc2626' : '#4f46e5') : 'var(--border-strong)'}`,
                borderRadius: 6, padding: '5px 10px', fontSize: 12, cursor: 'pointer',
                background: active ? (excOnly ? 'rgba(220,38,38,.1)' : 'rgba(79,70,229,.1)') : 'var(--bg-panel)',
                color: active ? (excOnly ? '#fca5a5' : '#a5b4fc') : 'var(--text-soft)',
                display: 'flex', alignItems: 'center', gap: 6,
              }} onClick={() => setGspOpen(o => !o)}>
                Constr. ▾
                {incCount > 0 && <span style={{ background: '#4f46e5', color: '#fff', fontSize: 10, borderRadius: 999, padding: '1px 5px', fontWeight: 600 }}>+{incCount}</span>}
                {excCount > 0 && <span style={{ background: '#dc2626', color: '#fff', fontSize: 10, borderRadius: 999, padding: '1px 5px', fontWeight: 600 }}>−{excCount}</span>}
              </button>
              {gspOpen && <GspFilterPopover gspFilter={gspFilter} onChange={onGspFilterChange} onClose={() => setGspOpen(false)} wrapperRef={gspWrapperRef} />}
            </div>
          )
        })()}

        {/* AS Services filter */}
        {(() => {
          const count = (asFilter.sr ? 1 : 0) + (asFilter.qr ? 1 : 0)
          const active = count > 0
          return (
            <div ref={asWrapperRef} style={{ position: 'relative' }}>
              <button type="button" aria-expanded={asOpen} style={{
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

        {trailingControls && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
            {trailingControls}
          </div>
        )}

        {/* Timeframe selector */}
        {onTfIndexChange && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginLeft: 'auto' }}>
          {TIMEFRAME_OPTIONS.map((opt, i) => (
            <button
              key={opt.label}
              type="button"
              aria-pressed={tfIndex === i}
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
        </div>}
      </div>

  )
}

export type AvailabilityCardData = Record<CardId, { count: number; sum: number }>

function formatMw(value: number): string {
  return `${Math.round(value).toLocaleString()} MW`
}

export function UnitAvailabilityCards({ cardData, selectedCard, onSelectCard, trailingControls }: {
  cardData: AvailabilityCardData
  selectedCard: CardId | null
  onSelectCard: (card: CardId | null) => void
  trailingControls?: ReactNode
}) {
  return (
      <div style={{
        padding: '10px 20px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-panel)',
        display: 'flex',
        gap: 8,
        flexWrap: 'wrap',
        flexShrink: 0,
      }}>
        {(Object.keys(CARD_LABELS) as CardId[]).map(card => {
          const isActive = selectedCard === card
          const color = CARD_COLORS[card]
          const { count, sum } = cardData[card]
          const isEmpty = card === 'derated' ? sum <= 0 : count === 0
          return (
            <button
              key={card}
              type="button"
              aria-pressed={isActive}
              onClick={() => onSelectCard(selectedCard === card ? null : card)}
              style={{
                background: isActive ? `color-mix(in srgb, ${color} 12%, var(--bg-inset))` : 'var(--bg-inset)',
                border: `2px solid ${isActive ? color : 'var(--border)'}`,
                borderRadius: 6,
                padding: '8px 14px',
                cursor: 'pointer',
                textAlign: 'left',
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
                {count} unit{count !== 1 ? 's' : ''}
              </div>
            </button>
          )
        })}
        {trailingControls && (
          <div style={{ display: 'flex', alignItems: 'center', marginLeft: 'auto' }}>
            {trailingControls}
          </div>
        )}
      </div>

  )
}
