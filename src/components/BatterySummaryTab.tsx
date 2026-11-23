'use client'

import { useMemo, useState } from 'react'
import type { BMUnit, ServiceType, SettlementPeriodData } from '@/models/types'
import { TIMEFRAME_OPTIONS, type AsServicesFilter } from '@/components/BatteryFilters'
import { UnitAvailabilityFilters, UnitAvailabilityCards, getFuelDisplay, type CardId, type AvailabilityCardData } from '@/components/UnitAvailabilityFilters'
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

function ServiceChip({ service }: { service: ServiceType | undefined }) {
  if (!service) return <span style={{ color: 'var(--text-faint)', fontSize: 11 }}>—</span>
  return <span className={`chip chip-${service.toLowerCase()}`}>{service}</span>
}

function TypeChip({ fuelType }: { fuelType: string }) {
  const { label, chipClass } = getFuelDisplay(fuelType)
  return <span className={`chip ${chipClass}`}>{label}</span>
}

export default function BatterySummaryTab({
  units, settlementPeriods, unitServices,
  gspFilter, onGspFilterChange, asFilter, onAsFilterChange, tfIndex, onTfIndexChange,
  deRatePct, onDeRatePctChange, priceThreshold, onPriceThresholdChange,
}: Props) {
  const [selectedCard, setSelectedCard] = useState<CardId | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [typeFilter, setTypeFilter] = useState<Set<string>>(new Set())

  const { spCount } = TIMEFRAME_OPTIONS[tfIndex]

  const availableTypes = useMemo(
    () => Array.from(new Set(units.map(u => u.fuelType))).sort(),
    [units]
  )

  const filteredUnits = useMemo(
    () => typeFilter.size === 0 ? units : units.filter(u => typeFilter.has(u.fuelType)),
    [units, typeFilter]
  )

  const rows = useMemo(
    () => computeBatteryAvailability(filteredUnits, settlementPeriods, spCount),
    [filteredUnits, settlementPeriods, spCount]
  )

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

  const summaryCards = Object.fromEntries(
    Object.entries(cardData).map(([id, data]) => [id, { count: data.rows.length, sum: data.sum }]),
  ) as AvailabilityCardData

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
      <UnitAvailabilityFilters
        availableTypes={availableTypes} typeFilter={typeFilter} onTypeFilterChange={setTypeFilter}
        gspFilter={gspFilter} onGspFilterChange={onGspFilterChange}
        asFilter={asFilter} onAsFilterChange={onAsFilterChange}
        deRatePct={deRatePct} onDeRatePctChange={onDeRatePctChange}
        priceThreshold={priceThreshold} onPriceThresholdChange={onPriceThresholdChange}
        tfIndex={tfIndex} onTfIndexChange={onTfIndexChange}
      />
      <UnitAvailabilityCards cardData={summaryCards} selectedCard={selectedCard} onSelectCard={setSelectedCard} />

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
