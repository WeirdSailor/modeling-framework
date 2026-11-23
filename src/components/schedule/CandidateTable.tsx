'use client'

// Candidate list shared by the three pickers: checkbox, unit columns, optional State or
// type-specific change column, click-to-sort headers (no sort = ranked order).

import { useMemo, useState } from 'react'
import type { ActionType } from '@/models/types'
import { TypeChip } from '@/components/AvailableTable'
import { cumulativeAvailability, type FilteredCandidateRow } from '@/utils/candidateFilters'
import { fmtMw } from './scheduleUi'

type SortKey = 'nationalGridBmUnit' | 'fuelType' | 'ndz' | 'sel' | 'pn' | 'mel' | 'reg' | 'priceToSel' | 'priceToMel' | 'change' | 'availableMw' | 'usableMw'

interface Props {
  rows: FilteredCandidateRow[]
  changeType?: ActionType                          // shows that type's +MW / −MW column
  showState?: boolean                              // shows Running / Off
  ticked: Set<string>
  onToggle: (bmUnitId: string) => void
  onSetTicked: (bmUnitIds: string[], on: boolean) => void
  blockedReason: (row: FilteredCandidateRow) => string | null  // non-null = greyed out, can't tick
  emptyText: string
}

export default function CandidateTable({
  rows, changeType, showState = false, ticked, onToggle, onSetTicked, blockedReason, emptyText,
}: Props) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' } | null>(null)

  const sorted = useMemo(() => {
    if (!sort) return rows
    const { key, dir } = sort
    const value = (r: FilteredCandidateRow): number | string =>
      key === 'change' ? (changeType ? Math.abs(r.change[changeType]) : 0) : r[key]
    return [...rows].sort((a, b) => {
      const av = value(a), bv = value(b)
      const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv))
      return dir === 'asc' ? cmp : -cmp
    })
  }, [rows, sort, changeType])
  const displayedRows = useMemo(() => cumulativeAvailability(sorted), [sorted])

  if (rows.length === 0) {
    return <div className="workspace-empty" style={{ padding: 24 }}><p>{emptyText}</p></div>
  }

  const selectable = sorted.filter(r => blockedReason(r) === null).map(r => r.bmUnitId)
  const allTicked = selectable.length > 0 && selectable.every(id => ticked.has(id))

  function cycleSort(key: SortKey) {
    setSort(s => (!s || s.key !== key ? { key, dir: 'desc' } : s.dir === 'desc' ? { key, dir: 'asc' } : null))
  }

  function th(k: SortKey, label: string, numeric = true) {
    const active = sort !== null && sort.key === k
    const caret = sort !== null && sort.key === k ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'
    return (
      <th
        key={k}
        className={['sortable', numeric ? 'num' : '', active ? 'col-active' : ''].filter(Boolean).join(' ')}
        onClick={() => cycleSort(k)}
      >
        <span className="th-inner">{label}<span className="sort-caret">{caret}</span></span>
      </th>
    )
  }

  const changeLabel = changeType === 'start' || changeType === 'capacity' ? '+MW' : '−MW'

  return (
    <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            <th style={{ width: 32 }}>
              <input
                type="checkbox"
                aria-label="Select all"
                checked={allTicked}
                disabled={selectable.length === 0}
                onChange={e => onSetTicked(selectable, e.target.checked)}
              />
            </th>
            {th('nationalGridBmUnit', 'BMU', false)}
            {th('fuelType', 'Type', false)}
            <th>Service</th>
            {showState && <th>State</th>}
            {changeType && th('change', changeLabel)}
            {th('ndz', 'NDZ')}
            {th('sel', 'SEL')}
            {th('pn', 'PN')}
            {th('mel', 'MEL')}
            {th('availableMw', 'AVAIL.')}
            <th className="num" title="Running total of AVAIL. for displayed units">CUMUL</th>
            {th('usableMw', 'Usable MW')}
            {th('reg', 'Reg. cap')}
            {th('priceToSel', '£ SEL')}
            {th('priceToMel', '£ MEL')}
            <th />
          </tr>
        </thead>
        <tbody>
          {displayedRows.map(r => {
            const blocked = blockedReason(r)
            return (
              <tr
                key={r.bmUnitId}
                style={{ cursor: blocked ? 'default' : 'pointer', opacity: blocked ? 0.45 : 1 }}
                onClick={() => { if (!blocked) onToggle(r.bmUnitId) }}
              >
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Select ${r.nationalGridBmUnit}`}
                    checked={ticked.has(r.bmUnitId)}
                    disabled={blocked !== null}
                    onClick={e => e.stopPropagation()}
                    onChange={() => onToggle(r.bmUnitId)}
                  />
                </td>
                <td>
                  <div className="bmu-cell-inner">
                    <span>{r.nationalGridBmUnit}</span>
                    <span className="site-sub">{r.gspGroup}</span>
                  </div>
                </td>
                <td><TypeChip fuelType={r.fuelType} /></td>
                <td>{r.service ? <span className={`chip chip-${r.service.toLowerCase()}`}>{r.service}</span> : '—'}</td>
                {showState && <td>{r.running ? 'Running' : 'Off'}</td>}
                {changeType && <td className="num">{fmtMw(Math.abs(r.change[changeType]))}</td>}
                <td className="num">{r.ndz || '—'}</td>
                <td className="num">{r.sel ? fmtMw(r.sel) : '—'}</td>
                <td className="num">{fmtMw(r.pn)}</td>
                <td className="num">{fmtMw(r.mel)}</td>
                <td className="num">{fmtMw(r.availableMw)}</td>
                <td className="num">{fmtMw(r.cumulativeMw)}</td>
                <td className="num">{fmtMw(r.usableMw)}</td>
                <td className="num">{fmtMw(r.reg)}</td>
                <td className="num">{r.priceToSel || '—'}</td>
                <td className="num">{r.priceToMel || '—'}</td>
                <td className="schedule-hint">{blocked ?? ''}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
