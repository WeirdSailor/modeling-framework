'use client'

// Candidate list shared by the three pickers, initially sorted by cheapest £ SEL.

import { useMemo, useState } from 'react'
import { TypeChip } from '@/components/AvailableTable'
import { cumulativeAvailability, type FilteredCandidateRow } from '@/utils/candidateFilters'
import { fmtMw } from './scheduleUi'

type SortKey = 'nationalGridBmUnit' | 'fuelType' | 'ndz' | 'mzt' | 'mnzt' | 'inertiaGvas' | 'sel' | 'pn' | 'mel' | 'priceToSel' | 'priceToMel' | 'availableMw' | 'usableMw'

interface Props {
  rows: FilteredCandidateRow[]
  showState?: boolean                              // shows Running / Off
  ticked: Set<string>
  onToggle: (bmUnitId: string) => void
  onSetTicked: (bmUnitIds: string[], on: boolean) => void
  blockedReason: (row: FilteredCandidateRow) => string | null  // non-null = greyed out, can't tick
  emptyText: string
}

export default function CandidateTable({
  rows, showState = false, ticked, onToggle, onSetTicked, blockedReason, emptyText,
}: Props) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' } | null>({ key: 'priceToSel', dir: 'asc' })

  const sorted = useMemo(() => {
    if (!sort) return rows
    const { key, dir } = sort
    return [...rows].sort((a, b) => {
      const av = a[key], bv = b[key]
      // A zero SEL price is the candidate-row placeholder for missing price data.
      if (key === 'priceToSel') {
        const aMissing = av === undefined || av === 0
        const bMissing = bv === undefined || bv === 0
        if (aMissing || bMissing) return aMissing === bMissing ? 0 : aMissing ? 1 : -1
      }
      if (av === undefined) return bv === undefined ? 0 : 1
      if (bv === undefined) return -1
      const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv))
      return dir === 'asc' ? cmp : -cmp
    })
  }, [rows, sort])
  const displayedRows = useMemo(() => cumulativeAvailability(sorted), [sorted])

  if (rows.length === 0) {
    return <div className="workspace-empty" style={{ padding: 24 }}><p>{emptyText}</p></div>
  }

  const selectable = sorted.filter(r => blockedReason(r) === null).map(r => r.bmUnitId)
  const allTicked = selectable.length > 0 && selectable.every(id => ticked.has(id))

  function cycleSort(key: SortKey) {
    const firstDir = key === 'priceToSel' ? 'asc' : 'desc'
    setSort(s => (!s || s.key !== key ? { key, dir: firstDir }
      : s.dir === firstDir ? { key, dir: firstDir === 'asc' ? 'desc' : 'asc' } : null))
  }

  function th(k: SortKey, label: string, numeric = true, title?: string) {
    const active = sort !== null && sort.key === k
    const caret = sort !== null && sort.key === k ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'
    return (
      <th
        key={k}
        title={title}
        className={['sortable', numeric ? 'num' : '', active ? 'col-active' : ''].filter(Boolean).join(' ')}
        onClick={() => cycleSort(k)}
      >
        <span className="th-inner">{label}<span className="sort-caret">{caret}</span></span>
      </th>
    )
  }

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
            <th>AS</th>
            {showState && <th>State</th>}
            {th('ndz', 'NDZ')}
            {th('mzt', 'MZT', true, 'Minimum Zero Time (minutes)')}
            {th('mnzt', 'MNZT', true, 'Minimum Non-Zero Time (minutes)')}
            {th('sel', 'SEL')}
            {th('pn', 'PN')}
            {th('mel', 'MEL')}
            {th('priceToSel', '£ SEL')}
            {th('priceToMel', '£ MEL')}
            {th('inertiaGvas', 'Inertia', true, 'Estimated inertia contribution when synchronised (GVAs)')}
            <th />
            {th('availableMw', 'AVAIL')}
            {th('usableMw', 'Usable')}
            <th className="num" title="Running total of Usable MW for displayed units">CUMUL</th>
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
                  </div>
                </td>
                <td><TypeChip fuelType={r.fuelType} /></td>
                <td>{r.service ? <span className={`chip chip-${r.service.toLowerCase()}`}>{r.service}</span> : '—'}</td>
                {showState && <td>{r.running ? 'Running' : 'Off'}</td>}
                <td className="num">{r.ndz || '—'}</td>
                <td className="num">{r.mzt ?? '—'}</td>
                <td className="num">{r.mnzt ?? '—'}</td>
                <td className="num">{r.sel ? fmtMw(r.sel) : '—'}</td>
                <td className="num">{fmtMw(r.pn)}</td>
                <td className="num">{fmtMw(r.mel)}</td>
                <td className="num">{r.priceToSel || '—'}</td>
                <td className="num">{r.priceToMel || '—'}</td>
                <td className="num">{r.inertiaGvas.toLocaleString('en-GB', { maximumFractionDigits: 2 })}</td>
                <td className="schedule-hint">{blocked ?? ''}</td>
                <td className="num">{fmtMw(r.availableMw)}</td>
                <td className="num">{fmtMw(r.usableMw)}</td>
                <td className="num">{fmtMw(r.cumulativeMw)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
