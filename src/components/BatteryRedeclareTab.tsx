'use client'

import { useMemo } from 'react'
import type { BMUnit, ServiceType, SettlementPeriodData } from '@/models/types'
import { maxBatteryPn } from '@/utils/batteryPn'

interface Props {
  units: BMUnit[]
  settlementPeriods: SettlementPeriodData[]
  unitServices: Record<string, ServiceType>
  onSetService: (bmUnitId: string, service: ServiceType | undefined) => void
}

interface BatteryRedeclareRow {
  bmUnitId: string
  nationalGridBmUnit: string
  ndz: number
  mzt: number
  mnzt: number
  sel: number
  mel: number
  priceToSel: number
  priceToMel: number
  pn: number | undefined
}

export default function BatteryRedeclareTab({ units, settlementPeriods, unitServices, onSetService }: Props) {
  const rows = useMemo<BatteryRedeclareRow[]>(() => units.map(u => ({
    bmUnitId: u.bmUnitId,
    nationalGridBmUnit: u.nationalGridBmUnit,
    ndz: u.ndz ?? 0,
    mzt: u.mzt ?? 0,
    mnzt: u.mnzt ?? 0,
    sel: u.sel ?? 0,
    mel: u.registeredCapacity ?? 0,
    priceToSel: u.priceToSel ?? 0,
    priceToMel: u.priceToMel ?? 0,
    pn: maxBatteryPn(u.bmUnitId, settlementPeriods),
  })), [units, settlementPeriods])

  if (rows.length === 0) {
    return (
      <div className="workspace-empty">
        <h2>No battery units found</h2>
        <p>No units with fuel type BATTERY were returned by the data source.</p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        padding: '10px 20px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-panel)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 12.5, color: 'var(--text-soft)' }}>
          Assign SR or QR to each battery unit — reflected in the Summary tab&apos;s AS Services filter and Contracted card.
        </span>
      </div>

      {/* Table */}
      <div className="table-scroll" style={{ flex: 1 }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>BMU</th>
              <th>Type</th>
              <th>Service</th>
              <th className="num">NDZ</th>
              <th className="num">MZT</th>
              <th className="num">MNZT</th>
              <th className="num">SEL</th>
              <th className="num">MEL</th>
              <th className="num">£ SEL</th>
              <th className="num">£ MEL</th>
              <th className="num">PN</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.bmUnitId}>
                <td className="mono">
                  <div className="bmu-cell-inner">
                    <span>{row.nationalGridBmUnit}</span>
                  </div>
                </td>
                <td><span className="chip chip-battery">Battery</span></td>
                <td>
                  <select
                    className="reason-select"
                    value={unitServices[row.bmUnitId] ?? ''}
                    onChange={e => onSetService(row.bmUnitId, (e.target.value as ServiceType) || undefined)}
                  >
                    <option value="">—</option>
                    <option value="SR">SR</option>
                    <option value="QR">QR</option>
                  </select>
                </td>
                <td className="mono num">{row.ndz > 0 ? row.ndz : '—'}</td>
                <td className="mono num">{row.mzt > 0 ? row.mzt : '—'}</td>
                <td className="mono num">{row.mnzt > 0 ? row.mnzt : '—'}</td>
                <td className="mono num">{row.sel > 0 ? row.sel.toFixed(0) : '—'}</td>
                <td className="mono num">{row.mel > 0 ? row.mel.toFixed(0) : '—'}</td>
                <td className="mono num">{row.priceToSel > 0 ? `£${row.priceToSel}` : '—'}</td>
                <td className="mono num">{row.priceToMel > 0 ? `£${row.priceToMel}` : '—'}</td>
                <td className="mono num">{row.pn !== undefined ? row.pn.toFixed(0) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
