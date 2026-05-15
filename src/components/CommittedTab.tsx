'use client'

import { useState, useMemo } from 'react'
import type { DraftPlan, BMUnit, ModellingAction, OperationType, UnitSnapshot, ServiceType, SettlementPeriodData } from '@/models/types'

const CHANGE_THRESHOLD = 10 // percent

const REASON_LABEL: Record<ModellingAction['reasonCode'], string> = {
  MARGIN:     'Margin',
  INERTIA:    'Inertia',
  VOLTAGE:    'Voltage',
  CONSTRAINT: 'Constraint',
  RESERVE:    'Reserve',
}

const STATIC_PRICE = 120

const REASON_COLORS: Record<ModellingAction['reasonCode'], string> = {
  MARGIN:     '#f59e0b',
  INERTIA:    '#8b5cf6',
  VOLTAGE:    '#06b6d4',
  RESERVE:    '#f97316',
  CONSTRAINT: '#ec4899',
}

const REASON_ORDER: ModellingAction['reasonCode'][] = ['MARGIN', 'INERTIA', 'VOLTAGE', 'RESERVE', 'CONSTRAINT']

function formatCost(cost: number): string {
  if (cost === 0) return '—'
  if (cost >= 1_000_000) return `£${(cost / 1_000_000).toFixed(1)}m`
  if (cost >= 1_000)     return `£${Math.round(cost / 1_000)}k`
  return `£${Math.round(cost)}`
}

interface Props {
  drafts: DraftPlan[]
  unitById: Map<string, BMUnit>
  unitPnByBmUnit: Record<string, number>
  dataOverrides: Record<string, Partial<UnitSnapshot>>
  unitServices: Record<string, ServiceType>
  settlementPeriods: SettlementPeriodData[]
  onRemoveUnits: (removals: { draftId: string; bmUnitId: string }[]) => void
}

interface CommittedRow {
  key: string
  draftId: string
  draftName: string
  bmUnitId: string
  nationalGridBmUnit: string
  gspGroup: string
  fuelType: string
  pn: number
  mel: number
  sel: number
  ndz: number
  mzt: number
  mnzt: number
  priceToSel: number
  priceToMel: number
  fromPeriod: number
  toPeriod: number | undefined
  reasonCode: ModellingAction['reasonCode']
  operationType?: OperationType
  notes: string
  snapshot?: UnitSnapshot
}

function slotLabel(slot: number, periods: SettlementPeriodData[]): string {
  const sp = periods.find(s => s.settlementPeriod === slot)
  return sp ? `${sp.startTime.slice(8, 10)}|${sp.startTime.slice(11, 16)}` : `SP ${slot}`
}

function ServiceChip({ service }: { service: ServiceType | undefined }) {
  if (!service) return <span style={{ color: 'var(--text-faint)', fontSize: 11 }}>—</span>
  return <span className={`chip chip-${service.toLowerCase()}`}>{service}</span>
}

function ChangeArrow({ current, snapshotVal, unit = '', invertColors = false }: { current: number; snapshotVal: number; unit?: string; invertColors?: boolean }) {
  if (snapshotVal === 0) return null
  const pct = (current - snapshotVal) / snapshotVal * 100
  if (Math.abs(pct) < CHANGE_THRESHOLD) return null
  const up = pct > 0
  const sign = up ? '+' : ''
  const tooltip = `Was: ${snapshotVal.toFixed(0)}${unit} → Now: ${current.toFixed(0)}${unit} (${sign}${pct.toFixed(0)}%)`
  const color = up
    ? (invertColors ? '#ef4444' : '#22c55e')
    : (invertColors ? '#22c55e' : '#ef4444')
  return (
    <span className="change-arrow" style={{ color }} title={tooltip}>
      {up ? '↑' : '↓'}
    </span>
  )
}

function getFuelDisplay(fuelType: string): { label: string; chipClass: string } {
  const map: Record<string, { label: string; chipClass: string }> = {
    CCGT:    { label: 'CCGT',       chipClass: 'chip-ccgt' },
    COAL:    { label: 'Coal',       chipClass: 'chip-coal' },
    NUCLEAR: { label: 'Nuclear',    chipClass: 'chip-nuclear' },
    BIOMASS: { label: 'Biomass',    chipClass: 'chip-biomass' },
    PS:      { label: 'Pumped',     chipClass: 'chip-pumped' },
    NPSHYD:  { label: 'Hydro',      chipClass: 'chip-hydro' },
    OCGT:    { label: 'OCGT',       chipClass: 'chip-ocgt' },
    GAS:     { label: 'Gas',        chipClass: 'chip-ccgt' },
    OIL:     { label: 'Oil',        chipClass: 'chip-coal' },
    WIND:    { label: 'Wind',       chipClass: 'chip-wind' },
    SOLAR:   { label: 'Solar',      chipClass: 'chip-wind' },
    INTL:    { label: 'Interconn.', chipClass: 'chip-interconn' },
  }
  return map[fuelType] ?? { label: fuelType, chipClass: '' }
}

function TypeChip({ fuelType }: { fuelType: string }) {
  const { label, chipClass } = getFuelDisplay(fuelType)
  return <span className={`chip ${chipClass}`}>{label}</span>
}

export default function CommittedTab({
  drafts, unitById, unitPnByBmUnit, dataOverrides, unitServices, settlementPeriods, onRemoveUnits,
}: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [selectedReason, setSelectedReason] = useState<ModellingAction['reasonCode'] | null>(null)

  const committedDrafts = useMemo(
    () => drafts.filter(d => d.status === 'committed'),
    [drafts]
  )

  const rows = useMemo<CommittedRow[]>(() => {
    const out: CommittedRow[] = []
    for (const draft of committedDrafts) {
      const seen = new Set<string>()
      for (const action of draft.actions) {
        if (seen.has(action.bmUnitId)) continue
        seen.add(action.bmUnitId)
        const u = unitById.get(action.bmUnitId)
        out.push({
          key: `${draft.id}:${action.bmUnitId}`,
          draftId: draft.id,
          draftName: draft.name,
          bmUnitId: action.bmUnitId,
          nationalGridBmUnit: u?.nationalGridBmUnit ?? action.bmUnitId,
          gspGroup: u?.gspGroup ?? '',
          fuelType: u?.fuelType ?? '',
          pn: unitPnByBmUnit[action.bmUnitId] ?? 0,
          mel: u?.registeredCapacity ?? 0,
          sel: u?.sel ?? 0,
          ndz: u?.ndz ?? 0,
          mzt: u?.mzt ?? 0,
          mnzt: u?.mnzt ?? 0,
          priceToSel: u?.priceToSel ?? 0,
          priceToMel: u?.priceToMel ?? 0,
          fromPeriod: action.fromPeriod,
          toPeriod: action.toPeriod,
          reasonCode: action.reasonCode,
          operationType: action.operationType,
          notes: draft.unitNotes[action.bmUnitId] ?? '',
          snapshot: draft.dataSnapshot?.[action.bmUnitId],
        })
      }
    }
    return out
  }, [committedDrafts, unitById, unitPnByBmUnit])

  const reasonSummaries = useMemo(() =>
    REASON_ORDER.map(code => {
      const matching = rows.filter(r => r.reasonCode === code)
      return {
        code,
        count: matching.length,
        cost: matching.reduce((s, r) => s + Math.max(0, r.mel - r.pn) * STATIC_PRICE, 0),
        totalMel: matching.reduce((s, r) => s + r.mel, 0),
      }
    })
  , [rows])

  const totalSummary = useMemo(() => ({
    count: rows.length,
    cost: rows.reduce((s, r) => s + Math.max(0, r.mel - r.pn) * STATIC_PRICE, 0),
    totalMel: rows.reduce((s, r) => s + r.mel, 0),
  }), [rows])

  const visibleRows = selectedReason
    ? rows.filter(r => r.reasonCode === selectedReason)
    : rows

  const allChecked = visibleRows.length > 0 && visibleRows.every(r => selected.has(r.key))
  const someChecked = visibleRows.some(r => selected.has(r.key))

  function toggleRow(key: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  function toggleAll() {
    setSelected(prev => {
      if (allChecked) return new Set()
      return new Set(visibleRows.map(r => r.key))
    })
  }

  function handleRemove() {
    const removals = rows
      .filter(r => selected.has(r.key))
      .map(r => ({ draftId: r.draftId, bmUnitId: r.bmUnitId }))
    onRemoveUnits(removals)
    setSelected(new Set())
  }

  function handleReasonSelect(code: ModellingAction['reasonCode'] | null) {
    setSelectedReason(prev => prev === code ? null : code)
    setSelected(new Set())
  }

  if (committedDrafts.length === 0) {
    return (
      <div className="workspace-empty">
        <h2>No committed drafts</h2>
        <p>Commit a draft from the Workspace tab to see units here.</p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      {/* Summary pills */}
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
          {rows.length} unit{rows.length !== 1 ? 's' : ''} across {committedDrafts.length} committed draft{committedDrafts.length !== 1 ? 's' : ''}
        </span>
        {committedDrafts.map(d => (
          <span key={d.id} className="state-badge badge-state-committed">{d.name}</span>
        ))}
      </div>

      {/* Cost breakdown cards */}
      <div style={{
        padding: '10px 20px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-panel)',
        display: 'flex',
        gap: 8,
        flexWrap: 'wrap',
        flexShrink: 0,
      }}>
        {/* Total card */}
        {(() => {
          const isActive = selectedReason === null
          return (
            <div
              onClick={() => handleReasonSelect(null)}
              style={{
                background: isActive ? 'color-mix(in srgb, #58a6ff 12%, var(--bg-inset))' : 'var(--bg-inset)',
                border: `2px solid ${isActive ? '#58a6ff' : 'var(--border)'}`,
                borderRadius: 6,
                padding: '8px 14px',
                cursor: 'pointer',
                minWidth: 100,
                transition: 'border-color 0.1s, background 0.1s',
              }}
            >
              <div style={{ fontSize: 9, color: '#58a6ff', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px' }}>
                Total
              </div>
              <div style={{ color: 'var(--text)', fontSize: 16, fontWeight: 700, margin: '3px 0', fontFamily: 'monospace' }}>
                {formatCost(totalSummary.cost)}
              </div>
              <div style={{ color: 'var(--text-soft)', fontSize: 10 }}>
                {totalSummary.count} unit{totalSummary.count !== 1 ? 's' : ''} · {Math.round(totalSummary.totalMel).toLocaleString()} MW
              </div>
            </div>
          )
        })()}

        {/* Per-reason cards */}
        {reasonSummaries.map(({ code, count, cost, totalMel }) => {
          const isActive = selectedReason === code
          const color = REASON_COLORS[code]
          const isEmpty = count === 0
          return (
            <div
              key={code}
              onClick={() => handleReasonSelect(code)}
              style={{
                background: isActive ? `color-mix(in srgb, ${color} 12%, var(--bg-inset))` : 'var(--bg-inset)',
                border: `2px solid ${isActive ? color : 'var(--border)'}`,
                borderRadius: 6,
                padding: '8px 14px',
                cursor: 'pointer',
                minWidth: 100,
                opacity: isEmpty ? 0.4 : 1,
                transition: 'border-color 0.1s, background 0.1s, opacity 0.1s',
              }}
            >
              <div style={{ fontSize: 9, color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px' }}>
                {REASON_LABEL[code]}
              </div>
              <div style={{ color: 'var(--text)', fontSize: 16, fontWeight: 700, margin: '3px 0', fontFamily: 'monospace' }}>
                {formatCost(cost)}
              </div>
              <div style={{ color: 'var(--text-soft)', fontSize: 10 }}>
                {count} unit{count !== 1 ? 's' : ''}{count > 0 ? ` · ${Math.round(totalMel).toLocaleString()} MW` : ''}
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
              <th className="check-col">
                <input
                  type="checkbox"
                  checked={allChecked}
                  ref={el => { if (el) el.indeterminate = !allChecked && someChecked }}
                  onChange={toggleAll}
                  aria-label="Select all"
                />
              </th>
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
              <th className="time-col">From</th>
              <th className="time-col">To</th>
              <th className="reason-col">Event</th>
              <th className="reason-col">Reason</th>
              <th>Draft</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map(row => {
              const ov = dataOverrides[row.bmUnitId] ?? {}
              const effMel        = ov.mel        ?? row.mel
              const effSel        = ov.sel        ?? row.sel
              const effNdz        = ov.ndz        ?? row.ndz
              const effMzt        = ov.mzt        ?? row.mzt
              const effMnzt       = ov.mnzt       ?? row.mnzt
              const effPriceToSel = ov.priceToSel ?? row.priceToSel
              const effPriceToMel = ov.priceToMel ?? row.priceToMel
              const snap = row.snapshot
              return (
                <tr
                  key={row.key}
                  className={selected.has(row.key) ? 'row-pending-remove' : ''}
                  onClick={() => toggleRow(row.key)}
                  style={{ cursor: 'pointer' }}
                >
                  <td className="check-col" onClick={e => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selected.has(row.key)}
                      onChange={() => toggleRow(row.key)}
                    />
                  </td>
                  <td className="mono">
                    <div className="bmu-cell-inner">
                      <span>{row.nationalGridBmUnit}</span>
                      <span className="site-sub">{row.gspGroup}</span>
                    </div>
                  </td>
                  <td><TypeChip fuelType={row.fuelType} /></td>
                  <td><ServiceChip service={unitServices[row.bmUnitId]} /></td>
                  <td className="mono num">
                    {effNdz > 0 ? effNdz : '—'}
                    {snap && <ChangeArrow current={effNdz} snapshotVal={snap.ndz} />}
                  </td>
                  <td className="mono num">
                    {effMzt > 0 ? effMzt : '—'}
                    {snap && <ChangeArrow current={effMzt} snapshotVal={snap.mzt} />}
                  </td>
                  <td className="mono num">
                    {effMnzt > 0 ? effMnzt : '—'}
                    {snap && <ChangeArrow current={effMnzt} snapshotVal={snap.mnzt} />}
                  </td>
                  <td className="mono num">
                    {effSel > 0 ? effSel.toFixed(0) : '—'}
                    {snap && <ChangeArrow current={effSel} snapshotVal={snap.sel} unit=" MW" />}
                  </td>
                  <td className="mono num">
                    {effMel > 0 ? effMel.toFixed(0) : '—'}
                    {snap && <ChangeArrow current={effMel} snapshotVal={snap.mel} unit=" MW" />}
                  </td>
                  <td className="mono num">
                    {effPriceToSel > 0 ? `£${effPriceToSel}` : '—'}
                    {snap && <ChangeArrow current={effPriceToSel} snapshotVal={snap.priceToSel} unit="£" invertColors />}
                  </td>
                  <td className="mono num">
                    {effPriceToMel > 0 ? `£${effPriceToMel}` : '—'}
                    {snap && <ChangeArrow current={effPriceToMel} snapshotVal={snap.priceToMel} unit="£" invertColors />}
                  </td>
                  <td className="mono num">{row.pn > 0 ? row.pn.toFixed(0) : '—'}</td>
                  <td className="time-col">
                    <span className="notes-readonly mono">{slotLabel(row.fromPeriod, settlementPeriods)}</span>
                  </td>
                  <td className="time-col">
                    <span className="notes-readonly mono">{row.toPeriod !== undefined ? slotLabel(row.toPeriod, settlementPeriods) : '—'}</span>
                  </td>
                  <td className="reason-col">
                    <span className="notes-readonly">{row.operationType ?? '—'}</span>
                  </td>
                  <td className="reason-col">
                    <span className="notes-readonly">{REASON_LABEL[row.reasonCode]}</span>
                  </td>
                  <td>
                    <span style={{
                      fontSize: 12, fontWeight: 500,
                      color: 'var(--green)',
                      background: 'var(--green-soft)',
                      padding: '2px 8px', borderRadius: 4,
                      whiteSpace: 'nowrap',
                    }}>
                      {row.draftName}
                    </span>
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {row.notes || <em className="muted">—</em>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="panel-foot" style={{ borderTop: '1px solid var(--border)' }}>
        <span className="foot-meta">
          {selected.size > 0
            ? `${selected.size} unit${selected.size !== 1 ? 's' : ''} selected`
            : 'Tick units to remove them from their draft'}
        </span>
        <button
          className="btn btn-danger-ghost"
          disabled={selected.size === 0}
          onClick={handleRemove}
          style={{ borderColor: selected.size > 0 ? 'var(--red)' : 'transparent' }}
        >
          − Remove selected
        </button>
      </div>
    </div>
  )
}
