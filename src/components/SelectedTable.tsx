'use client'

import type { DraftPlan, BMUnit, ModellingAction, OperationType, ServiceType } from '@/models/types'
import { OPERATION_TYPE_LABELS } from '@/models/types'

const REASON_CODES: ModellingAction['reasonCode'][] = ['MARGIN', 'INERTIA', 'VOLTAGE', 'CONSTRAINT', 'RESERVE']
const REASON_LABEL: Record<ModellingAction['reasonCode'], string> = {
  MARGIN:     'Margin',
  INERTIA:    'Inertia',
  VOLTAGE:    'Voltage',
  CONSTRAINT: 'Constraint',
  RESERVE:    'Reserve',
}

const OPERATION_TYPES = Object.keys(OPERATION_TYPE_LABELS) as OperationType[]

const STATIC_PRICE = 120

interface Props {
  draft: DraftPlan
  unitById: Map<string, BMUnit>
  unitPnByBmUnit: Record<string, number>
  unitServices: Record<string, ServiceType>
  readOnly: boolean
  scenario: string
  onRemoveUnit: (bmUnitId: string) => void
  onUpdateNotes: (bmUnitId: string, notes: string) => void
  onUpdateReason: (bmUnitId: string, reasonCode: ModellingAction['reasonCode']) => void
  onUpdateOperationType: (bmUnitId: string, operationType: OperationType | undefined) => void
}

function getFuelDisplay(fuelType: string): { label: string; chipClass: string } {
  const map: Record<string, { label: string; chipClass: string }> = {
    CCGT:    { label: 'CCGT',      chipClass: 'chip-ccgt' },
    COAL:    { label: 'Coal',      chipClass: 'chip-coal' },
    NUCLEAR: { label: 'Nuclear',   chipClass: 'chip-nuclear' },
    BIOMASS: { label: 'Biomass',   chipClass: 'chip-biomass' },
    PS:      { label: 'Pumped',    chipClass: 'chip-pumped' },
    NPSHYD:  { label: 'Hydro',     chipClass: 'chip-hydro' },
    OCGT:    { label: 'OCGT',      chipClass: 'chip-ocgt' },
    GAS:     { label: 'Gas',       chipClass: 'chip-ccgt' },
    OIL:     { label: 'Oil',       chipClass: 'chip-coal' },
    WIND:    { label: 'Wind',      chipClass: 'chip-wind' },
    SOLAR:   { label: 'Solar',     chipClass: 'chip-wind' },
    INTL:    { label: 'Interconn.', chipClass: 'chip-interconn' },
  }
  return map[fuelType] ?? { label: fuelType, chipClass: '' }
}

function TypeChip({ fuelType }: { fuelType: string }) {
  const { label, chipClass } = getFuelDisplay(fuelType)
  return <span className={`chip ${chipClass}`}>{label}</span>
}

function ServiceChip({ service }: { service: ServiceType | undefined }) {
  if (!service) return <span style={{ color: 'var(--text-faint)', fontSize: 11 }}>—</span>
  return <span className={`chip chip-${service.toLowerCase()}`}>{service}</span>
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value mono">{value}</span>
    </div>
  )
}

export default function SelectedTable({
  draft, unitById, unitPnByBmUnit, unitServices, readOnly, scenario,
  onRemoveUnit, onUpdateNotes, onUpdateReason, onUpdateOperationType,
}: Props) {
  const showPn = scenario === 'pullback'
  const uniqueUnitIds = Array.from(new Set(draft.actions.map(a => a.bmUnitId)))

  const totals = uniqueUnitIds.reduce(
    (acc, id) => {
      const u = unitById.get(id)
      if (!u) return acc
      acc.pn  += unitPnByBmUnit[id] ?? 0
      acc.mel += u.registeredCapacity
      acc.value += STATIC_PRICE * u.registeredCapacity
      return acc
    },
    { pn: 0, mel: 0, value: 0 }
  )

  return (
    <div className={`panel selected-panel${readOnly ? ' panel-readonly' : ''}`}>
      <header className="panel-head">
        <div className="panel-title">
          <h2>Selected</h2>
        </div>
        <div className="totals">
          <Stat label="Σ PN"  value={totals.pn.toFixed(0) + ' MW'} />
          <Stat label="Σ MEL" value={totals.mel.toFixed(0) + ' MW'} />
          <Stat label="Est. value" value={'£' + Math.round(totals.value).toLocaleString()} />
        </div>
      </header>

      <div className="table-scroll">
        {uniqueUnitIds.length === 0 ? (
          <div className="empty-drop">
            <div className="empty-drop-inner">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M4 7h16M4 12h16M4 17h10" />
              </svg>
              <p className="empty-title">No units in this draft yet</p>
              <p className="empty-sub">
                {readOnly
                  ? 'This draft has no units.'
                  : 'Tick rows in Available units, then press Select →'}
              </p>
            </div>
          </div>
        ) : (
          <table className="data-table selected-table">
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
                {showPn && <th className="num">PN</th>}
                <th className="reason-col">Event</th>
                <th className="reason-col">Reason</th>
                <th className="notes-col">Notes</th>
                {!readOnly && <th className="action-col" />}
              </tr>
            </thead>
            <tbody>
              {uniqueUnitIds.map(bmUnitId => {
                const u = unitById.get(bmUnitId)
                if (!u) return null
                const pn   = unitPnByBmUnit[bmUnitId] ?? 0
                const notes = draft.unitNotes[bmUnitId] ?? ''
                const action = draft.actions.find(a => a.bmUnitId === bmUnitId)
                const reasonCode = action?.reasonCode ?? 'MARGIN'
                const operationType = action?.operationType
                return (
                  <tr key={bmUnitId}>
                    <td className="mono">
                      <div className="bmu-cell-inner">
                        <span>{u.nationalGridBmUnit}</span>
                        <span className="site-sub">{u.gspGroup}</span>
                      </div>
                    </td>
                    <td><TypeChip fuelType={u.fuelType} /></td>
                    <td><ServiceChip service={unitServices[bmUnitId]} /></td>
                    <td className="mono num">{u.ndz  ? u.ndz  : '—'}</td>
                    <td className="mono num">{u.mzt  ? u.mzt  : '—'}</td>
                    <td className="mono num">{u.mnzt ? u.mnzt : '—'}</td>
                    <td className="mono num">{u.sel != null && u.sel > 0 ? u.sel.toFixed(0) : '—'}</td>
                    <td className="mono num">{u.registeredCapacity.toFixed(0)}</td>
                    <td className="mono num">{u.priceToSel ? `£${u.priceToSel}` : '—'}</td>
                    <td className="mono num">{u.priceToMel ? `£${u.priceToMel}` : '—'}</td>
                    {showPn && <td className="mono num">{pn > 0 ? pn.toFixed(0) : '—'}</td>}
                    <td className="reason-col">
                      {readOnly ? (
                        <span className="notes-readonly">{operationType ?? '—'}</span>
                      ) : (
                        <select
                          className="reason-select"
                          value={operationType ?? ''}
                          onChange={e => onUpdateOperationType(bmUnitId, (e.target.value as OperationType) || undefined)}
                        >
                          <option value="">—</option>
                          {OPERATION_TYPES.map(t => (
                            <option key={t} value={t} title={OPERATION_TYPE_LABELS[t]}>{t}</option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="reason-col">
                      {readOnly ? (
                        <span className="notes-readonly">{REASON_LABEL[reasonCode]}</span>
                      ) : (
                        <select
                          className="reason-select"
                          value={reasonCode}
                          onChange={e => onUpdateReason(bmUnitId, e.target.value as ModellingAction['reasonCode'])}
                        >
                          {REASON_CODES.map(r => (
                            <option key={r} value={r}>{REASON_LABEL[r]}</option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="notes-col">
                      {readOnly ? (
                        <span className="notes-readonly">{notes || <em className="muted">—</em>}</span>
                      ) : (
                        <input
                          type="text"
                          className="notes-input"
                          value={notes}
                          placeholder="Add a note…"
                          onChange={e => onUpdateNotes(bmUnitId, e.target.value)}
                        />
                      )}
                    </td>
                    {!readOnly && (
                      <td className="action-col">
                        <button
                          className="row-remove-btn"
                          onClick={() => onRemoveUnit(bmUnitId)}
                          title="Remove from draft"
                        >×</button>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
