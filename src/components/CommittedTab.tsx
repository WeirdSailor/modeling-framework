'use client'

import { useState, useMemo } from 'react'
import type { DraftPlan, BMUnit } from '@/models/types'

const STATIC_PRICE = 120

interface Props {
  drafts: DraftPlan[]
  unitById: Map<string, BMUnit>
  unitPnByBmUnit: Record<string, number>
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
  notes: string
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
  drafts, unitById, unitPnByBmUnit, onRemoveUnits,
}: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set())

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
          notes: draft.unitNotes[action.bmUnitId] ?? '',
        })
      }
    }
    return out
  }, [committedDrafts, unitById, unitPnByBmUnit])

  const allChecked = rows.length > 0 && rows.every(r => selected.has(r.key))
  const someChecked = rows.some(r => selected.has(r.key))

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
      return new Set(rows.map(r => r.key))
    })
  }

  function handleRemove() {
    const removals = rows
      .filter(r => selected.has(r.key))
      .map(r => ({ draftId: r.draftId, bmUnitId: r.bmUnitId }))
    onRemoveUnits(removals)
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
              <th className="num">PN</th>
              <th className="num">MEL</th>
              <th className="num">SEL</th>
              <th className="num">Price</th>
              <th>Draft</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
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
                <td className="mono bmu-cell">
                  <span>{row.nationalGridBmUnit}</span>
                  <span className="site-sub">{row.gspGroup}</span>
                </td>
                <td><TypeChip fuelType={row.fuelType} /></td>
                <td className="mono num">{row.pn > 0 ? row.pn.toFixed(0) : '—'}</td>
                <td className="mono num">{row.mel > 0 ? row.mel.toFixed(0) : '—'}</td>
                <td className="mono num">{row.sel > 0 ? row.sel.toFixed(0) : '—'}</td>
                <td className="mono num">£{STATIC_PRICE}</td>
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
            ))}
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
