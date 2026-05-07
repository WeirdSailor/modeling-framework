'use client'

import { useMemo } from 'react'
import type { DraftPlan, BMUnit, ModellingAction, OperationType, UnitSnapshot, ServiceType } from '@/models/types'

interface Props {
  drafts: DraftPlan[]
  unitById: Map<string, BMUnit>
  unitPnByBmUnit: Record<string, number>
  dataOverrides: Record<string, Partial<UnitSnapshot>>
  unitServices: Record<string, ServiceType>
  onSetOverride: (bmUnitId: string, field: keyof UnitSnapshot, value: number) => void
  onClearOverride: (bmUnitId: string) => void
  onClearAll: () => void
  onSetService: (bmUnitId: string, service: ServiceType | undefined) => void
}

const REASON_LABEL: Record<ModellingAction['reasonCode'], string> = {
  MARGIN: 'Margin', INERTIA: 'Inertia', VOLTAGE: 'Voltage',
  CONSTRAINT: 'Constraint', RESERVE: 'Reserve',
}

function getFuelDisplay(fuelType: string): { label: string; chipClass: string } {
  const map: Record<string, { label: string; chipClass: string }> = {
    CCGT: { label: 'CCGT', chipClass: 'chip-ccgt' },
    COAL: { label: 'Coal', chipClass: 'chip-coal' },
    NUCLEAR: { label: 'Nuclear', chipClass: 'chip-nuclear' },
    BIOMASS: { label: 'Biomass', chipClass: 'chip-biomass' },
    PS: { label: 'Pumped', chipClass: 'chip-pumped' },
    NPSHYD: { label: 'Hydro', chipClass: 'chip-hydro' },
    OCGT: { label: 'OCGT', chipClass: 'chip-ocgt' },
    GAS: { label: 'Gas', chipClass: 'chip-ccgt' },
    OIL: { label: 'Oil', chipClass: 'chip-coal' },
    WIND: { label: 'Wind', chipClass: 'chip-wind' },
    SOLAR: { label: 'Solar', chipClass: 'chip-wind' },
    INTL: { label: 'Interconn.', chipClass: 'chip-interconn' },
  }
  return map[fuelType] ?? { label: fuelType, chipClass: '' }
}

function TypeChip({ fuelType }: { fuelType: string }) {
  const { label, chipClass } = getFuelDisplay(fuelType)
  return <span className={`chip ${chipClass}`}>{label}</span>
}

function NumInput({
  value, onCommit,
}: { value: number; onCommit: (v: number) => void }) {
  return (
    <input
      type="number"
      className="redeclare-input"
      defaultValue={value === 0 ? '' : value}
      key={value}
      onBlur={e => {
        const v = parseFloat(e.target.value)
        if (!isNaN(v) && v !== value) onCommit(v)
      }}
      onKeyDown={e => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        if (e.key === 'Escape') { (e.target as HTMLInputElement).value = value === 0 ? '' : String(value); (e.target as HTMLInputElement).blur() }
      }}
    />
  )
}

interface RedeclareRow {
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
  reasonCode: ModellingAction['reasonCode']
  operationType?: OperationType
}

export default function RedeclareTab({
  drafts, unitById, unitPnByBmUnit, dataOverrides, unitServices,
  onSetOverride, onClearOverride, onClearAll, onSetService,
}: Props) {
  const committedDrafts = useMemo(
    () => drafts.filter(d => d.status === 'committed'),
    [drafts]
  )

  const rows = useMemo<RedeclareRow[]>(() => {
    const out: RedeclareRow[] = []
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
          reasonCode: action.reasonCode,
          operationType: action.operationType,
        })
      }
    }
    return out
  }, [committedDrafts, unitById, unitPnByBmUnit])

  const overrideCount = Object.keys(dataOverrides).length

  if (committedDrafts.length === 0) {
    return (
      <div className="workspace-empty">
        <h2>No committed drafts</h2>
        <p>Commit a draft to simulate redeclarations here.</p>
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
          Edit any value below to simulate a redeclaration — changes are reflected live in the Committed tab.
        </span>
        {overrideCount > 0 && (
          <span style={{
            fontSize: 11, fontWeight: 600,
            background: 'var(--amber-soft)', color: 'var(--amber)',
            padding: '2px 8px', borderRadius: 4,
          }}>
            {overrideCount} unit{overrideCount !== 1 ? 's' : ''} overridden
          </span>
        )}
        <div style={{ marginLeft: 'auto' }}>
          <button
            className="btn btn-ghost"
            style={{ fontSize: 11 }}
            disabled={overrideCount === 0}
            onClick={onClearAll}
          >
            Reset all
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="table-scroll" style={{ flex: 1 }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>BMU</th>
              <th>Service</th>
              <th>Type</th>
              <th className="num">NDZ (m)</th>
              <th className="num">MZT (m)</th>
              <th className="num">MNZT (m)</th>
              <th className="num">SEL (MW)</th>
              <th className="num">MEL (MW)</th>
              <th className="num">£ SEL</th>
              <th className="num">£ MEL</th>
              <th className="num">PN</th>
              <th className="reason-col">Event</th>
              <th className="reason-col">Reason</th>
              <th>Draft</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const ov = dataOverrides[row.bmUnitId] ?? {}
              const hasOverride = Object.keys(ov).length > 0
              return (
                <tr
                  key={row.key}
                  style={{ background: hasOverride ? 'var(--amber-soft)' : undefined }}
                >
                  <td className="mono bmu-cell">
                    <span>{row.nationalGridBmUnit}</span>
                    <span className="site-sub">{row.gspGroup}</span>
                  </td>
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
                  <td><TypeChip fuelType={row.fuelType} /></td>
                  <td className="num">
                    <NumInput
                      value={ov.ndz ?? row.ndz}
                      onCommit={v => onSetOverride(row.bmUnitId, 'ndz', v)}
                    />
                  </td>
                  <td className="num">
                    <NumInput
                      value={ov.mzt ?? row.mzt}
                      onCommit={v => onSetOverride(row.bmUnitId, 'mzt', v)}
                    />
                  </td>
                  <td className="num">
                    <NumInput
                      value={ov.mnzt ?? row.mnzt}
                      onCommit={v => onSetOverride(row.bmUnitId, 'mnzt', v)}
                    />
                  </td>
                  <td className="num">
                    <NumInput
                      value={ov.sel ?? row.sel}
                      onCommit={v => onSetOverride(row.bmUnitId, 'sel', v)}
                    />
                  </td>
                  <td className="num">
                    <NumInput
                      value={ov.mel ?? row.mel}
                      onCommit={v => onSetOverride(row.bmUnitId, 'mel', v)}
                    />
                  </td>
                  <td className="num">
                    <NumInput
                      value={ov.priceToSel ?? row.priceToSel}
                      onCommit={v => onSetOverride(row.bmUnitId, 'priceToSel', v)}
                    />
                  </td>
                  <td className="num">
                    <NumInput
                      value={ov.priceToMel ?? row.priceToMel}
                      onCommit={v => onSetOverride(row.bmUnitId, 'priceToMel', v)}
                    />
                  </td>
                  <td className="mono num" style={{ color: 'var(--text-soft)' }}>
                    {row.pn > 0 ? row.pn.toFixed(0) : '—'}
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
                      color: 'var(--green)', background: 'var(--green-soft)',
                      padding: '2px 8px', borderRadius: 4, whiteSpace: 'nowrap',
                    }}>
                      {row.draftName}
                    </span>
                  </td>
                  <td>
                    {hasOverride && (
                      <button
                        className="btn btn-ghost"
                        style={{ fontSize: 10, padding: '2px 6px' }}
                        onClick={() => onClearOverride(row.bmUnitId)}
                      >
                        Reset
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
