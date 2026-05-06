'use client'

import { useState, useMemo, useCallback } from 'react'
import type { BMUnit } from '@/models/types'
import { SCENARIOS } from '@/config/scenarios'


interface Props {
  units: BMUnit[]
  unitPnByBmUnit: Record<string, number>
  activeDraftUnitIds: Set<string>
  otherDraftUnitMap: Map<string, string>
  selectionPattern: 'buttons' | 'click'
  readOnly: boolean
  voltageArea: string
  scenario: string
  onScenarioChange: (s: string) => void
  onAddUnits: (ids: string[]) => void
}

type SortKey = 'bmUnitId' | 'nationalGridBmUnit' | 'fuelType' | 'pn' | 'mel' | 'sel' | 'ndz' | 'mnzt' | 'mzt' | 'priceToMel'

interface UnitRow {
  bmUnitId: string
  nationalGridBmUnit: string
  gspGroup: string
  fuelType: string
  pn: number
  mel: number
  sel: number
  ndz: number
  mnzt: number
  mzt: number
  priceToSel: number  // 0 = no SEL data
  priceToMel: number
}

const SYNCHRONOUS_TYPES = new Set(['CCGT', 'COAL', 'NUCLEAR', 'OCGT', 'NPSHYD', 'PS', 'BIOMASS', 'OIL', 'GAS'])
const RESPONSE_PREF: Record<string, number> = { PS: 3000, NPSHYD: 2000, OCGT: 1000 }

function scenarioScore(row: UnitRow, scenarioId: string, voltageArea: string): number {
  const available = Math.max(0, row.mel - row.pn)
  switch (scenarioId) {
    case 'margin':
      return available
    case 'inertia':
      return (SYNCHRONOUS_TYPES.has(row.fuelType) ? 100000 : 0) + row.mel
    case 'voltage':
      return (voltageArea && row.gspGroup === voltageArea ? 100000 : 0) + row.mel
    case 'reserve':
      return (row.ndz > 0 ? -row.ndz * 10 : -99999) + available / 1000
    case 'response':
      return (RESPONSE_PREF[row.fuelType] ?? 0) + (row.ndz > 0 ? -row.ndz : -9999)
    case 'pullback':
      return row.pn  // units generating most have the most to give back
    default:
      return 0
  }
}

function getFuelDisplay(fuelType: string): { label: string; chipClass: string } {
  const map: Record<string, { label: string; chipClass: string }> = {
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
    INTL:    { label: 'Interconn.',chipClass: 'chip-interconn' },
  }
  return map[fuelType] ?? { label: fuelType, chipClass: '' }
}

function TypeChip({ fuelType }: { fuelType: string }) {
  const { label, chipClass } = getFuelDisplay(fuelType)
  return <span className={`chip ${chipClass}`}>{label}</span>
}

function SortTh({ col, sort, onSort, children, numeric }: {
  col: SortKey; sort: { key: SortKey; dir: 'asc' | 'desc' }
  onSort: (k: SortKey) => void; children: React.ReactNode; numeric?: boolean
}) {
  const active = sort.key === col
  return (
    <th
      className={[numeric ? 'num' : '', 'sortable', active ? 'col-active' : ''].join(' ')}
      onClick={() => onSort(col)}
    >
      <span className="th-inner">
        {children}
        <span className="sort-caret">{active ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}</span>
      </span>
    </th>
  )
}

export default function AvailableTable({
  units, unitPnByBmUnit, activeDraftUnitIds, otherDraftUnitMap,
  selectionPattern, readOnly, voltageArea, scenario, onScenarioChange, onAddUnits,
}: Props) {
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('All')
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'nationalGridBmUnit', dir: 'asc' })
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set())

  const rows = useMemo<UnitRow[]>(() => {
    return units.map(u => ({
      bmUnitId: u.bmUnitId,
      nationalGridBmUnit: u.nationalGridBmUnit,
      gspGroup: u.gspGroup,
      fuelType: u.fuelType,
      pn: unitPnByBmUnit[u.bmUnitId] ?? 0,
      mel: u.registeredCapacity,
      sel: u.sel ?? 0,
      ndz: u.ndz ?? 0,
      mnzt: u.mnzt ?? 0,
      mzt: u.mzt ?? 0,
      priceToSel: u.priceToSel ?? 0,
      priceToMel: u.priceToMel ?? 0,
    }))
  }, [units, unitPnByBmUnit])

  const types = useMemo(() => {
    const t = new Set(rows.map(r => r.fuelType))
    return ['All', ...Array.from(t).sort()]
  }, [rows])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    let filtered = rows.filter(r => {
      if (typeFilter !== 'All' && r.fuelType !== typeFilter) return false
      if (!q) return true
      return (
        r.bmUnitId.toLowerCase().includes(q) ||
        r.nationalGridBmUnit.toLowerCase().includes(q) ||
        r.fuelType.toLowerCase().includes(q)
      )
    })
    if (scenario !== 'none') {
      filtered.sort((a, b) => scenarioScore(b, scenario, voltageArea) - scenarioScore(a, scenario, voltageArea))
    } else {
      filtered.sort((a, b) => {
        const av = a[sort.key], bv = b[sort.key]
        const cmp = typeof av === 'number'
          ? (av as number) - (bv as number)
          : String(av).localeCompare(String(bv))
        return sort.dir === 'asc' ? cmp : -cmp
      })
    }
    return filtered
  }, [rows, search, typeFilter, sort, scenario, voltageArea])

  const selectableVisible = useMemo(
    () => visible.filter(r => !activeDraftUnitIds.has(r.bmUnitId)).map(r => r.bmUnitId),
    [visible, activeDraftUnitIds]
  )
  const allChecked = selectableVisible.length > 0 && selectableVisible.every(id => pendingIds.has(id))
  const someChecked = selectableVisible.some(id => pendingIds.has(id))

  const toggleSort = useCallback((key: SortKey) => {
    setSort(s => ({ key, dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc' }))
  }, [])

  const togglePending = useCallback((id: string) => {
    setPendingIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }, [])

  const toggleAll = useCallback(() => {
    setPendingIds(prev => {
      const next = new Set(prev)
      if (allChecked) selectableVisible.forEach(id => next.delete(id))
      else selectableVisible.forEach(id => next.add(id))
      return next
    })
  }, [allChecked, selectableVisible])

  function handleAddOne(id: string) {
    if (readOnly) return
    onAddUnits([id])
  }

  function handleAddMany() {
    if (readOnly) return
    onAddUnits(Array.from(pendingIds))
    setPendingIds(new Set())
  }

  function handleRowClick(row: UnitRow) {
    if (readOnly || activeDraftUnitIds.has(row.bmUnitId)) return
    if (selectionPattern === 'click') {
      onAddUnits([row.bmUnitId])
    } else {
      togglePending(row.bmUnitId)
    }
  }

  const showCheckbox = selectionPattern === 'buttons' && !readOnly
  const showAddBtn   = selectionPattern === 'buttons' && !readOnly
  const showPn       = scenario === 'pullback'
  // BMU, Type, NDZ, MZT, MNZT, SEL, MEL, £ SEL/MEL = 8 fixed; PN optional
  const colSpan = [showCheckbox, true, true, true, true, true, true, true, true, showPn, showAddBtn].filter(Boolean).length

  return (
    <div className="panel available-panel">
      <header className="panel-head">
        <div className="panel-title">
          <h2>Available units</h2>
          <span className="count-pill">{visible.length} of {units.length}</span>
        </div>
        <div className="toolbar">
          <div className="search-wrap">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
            </svg>
            <input
              type="text" placeholder="Search BMU, type…"
              value={search} onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button className="clear-btn" onClick={() => setSearch('')} aria-label="Clear">×</button>
            )}
          </div>
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
          >
            {types.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select
            value={scenario}
            onChange={e => onScenarioChange(e.target.value)}
            title="Scenario — ranks units by operational priority"
          >
            <option value="none">Scenario…</option>
            {SCENARIOS.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      </header>

      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              {showCheckbox && (
                <th className="check-col">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    ref={el => { if (el) el.indeterminate = !allChecked && someChecked }}
                    onChange={toggleAll}
                    aria-label="Select all visible"
                  />
                </th>
              )}
              <SortTh col="nationalGridBmUnit" sort={sort} onSort={toggleSort}>BMU</SortTh>
              <SortTh col="fuelType" sort={sort} onSort={toggleSort}>Type</SortTh>
              <SortTh col="ndz"   sort={sort} onSort={toggleSort} numeric>NDZ</SortTh>
              <SortTh col="mzt"   sort={sort} onSort={toggleSort} numeric>MZT</SortTh>
              <SortTh col="mnzt"  sort={sort} onSort={toggleSort} numeric>MNZT</SortTh>
              <SortTh col="sel"   sort={sort} onSort={toggleSort} numeric>SEL</SortTh>
              <SortTh col="mel"        sort={sort} onSort={toggleSort} numeric>MEL</SortTh>
              <SortTh col="priceToMel" sort={sort} onSort={toggleSort} numeric>£ SEL/MEL</SortTh>
              {showPn && <SortTh col="pn" sort={sort} onSort={toggleSort} numeric>PN</SortTh>}
              {showAddBtn && <th className="action-col" />}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr><td colSpan={colSpan} className="empty">No units match your filters.</td></tr>
            )}
            {visible.map(row => {
              const inDraft  = activeDraftUnitIds.has(row.bmUnitId)
              const inOther  = !inDraft && otherDraftUnitMap.has(row.bmUnitId)
              const otherName = otherDraftUnitMap.get(row.bmUnitId)
              const pending  = pendingIds.has(row.bmUnitId)
              return (
                <tr
                  key={row.bmUnitId}
                  className={[
                    inDraft ? 'row-in-draft' : '',
                    pending ? 'row-pending' : '',
                    selectionPattern === 'click' && !inDraft && !readOnly ? 'row-clickable' : '',
                  ].join(' ')}
                  onClick={() => handleRowClick(row)}
                  title={inDraft ? 'Already in this draft' : ''}
                >
                  {showCheckbox && (
                    <td className="check-col" onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={pending}
                        disabled={inDraft}
                        onChange={() => togglePending(row.bmUnitId)}
                      />
                    </td>
                  )}
                  <td className="mono bmu-cell">
                    <span>{row.nationalGridBmUnit}</span>
                    <span className="site-sub">{row.gspGroup}</span>
                    {inDraft && <span className="badge badge-in">In draft</span>}
                    {inOther && <span className="badge badge-other" title={`Also in ${otherName}`}>Also in {otherName}</span>}
                  </td>
                  <td><TypeChip fuelType={row.fuelType} /></td>
                  <td className="mono num">{row.ndz  > 0 ? `${row.ndz}m`  : '—'}</td>
                  <td className="mono num">{row.mzt  > 0 ? `${row.mzt}m`  : '—'}</td>
                  <td className="mono num">{row.mnzt > 0 ? `${row.mnzt}m` : '—'}</td>
                  <td className="mono num">{row.sel  > 0 ? row.sel.toFixed(0)  : '—'}</td>
                  <td className="mono num">{row.mel.toFixed(0)}</td>
                  <td className="mono num price-tier-cell">
                    {row.priceToSel > 0 ? `£${row.priceToSel}` : '—'}
                    {' / '}
                    {row.priceToMel > 0 ? `£${row.priceToMel}` : '—'}
                  </td>
                  {showPn && <td className="mono num">{row.pn > 0 ? row.pn.toFixed(0) : '—'}</td>}
                  {showAddBtn && (
                    <td className="action-col" onClick={e => e.stopPropagation()}>
                      <button
                        className="row-add-btn"
                        disabled={inDraft}
                        onClick={() => handleAddOne(row.bmUnitId)}
                        title="Add to draft"
                      >+</button>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {selectionPattern === 'buttons' && !readOnly && (
        <footer className="panel-foot">
          <span className="foot-meta">
            {pendingIds.size > 0 ? `${pendingIds.size} checked` : 'Tick rows or use + to add'}
          </span>
          <button
            className="btn btn-primary"
            disabled={pendingIds.size === 0}
            onClick={handleAddMany}
          >
            Select →
          </button>
        </footer>
      )}
      {selectionPattern === 'click' && !readOnly && (
        <footer className="panel-foot">
          <span className="foot-meta">Click any row to add it to the draft</span>
        </footer>
      )}
      {readOnly && (
        <footer className="panel-foot">
          <span className="foot-meta" style={{ fontStyle: 'italic' }}>Read only — draft is not editable</span>
        </footer>
      )}
    </div>
  )
}
