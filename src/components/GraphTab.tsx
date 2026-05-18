'use client'

import { useMemo, useState, useCallback } from 'react'
import type { BMUnit, DraftPlan, SettlementPeriodData } from '@/models/types'

interface Props {
  settlementPeriods: SettlementPeriodData[]
  units: BMUnit[]
  drafts: DraftPlan[]
}

type SortKey = 'bmu' | 'fuelType' | 'pn' | 'mel' | 'sel' | 'source'

interface GraphRow {
  bmUnitId: string
  nationalGridBmUnit: string
  gspGroup: string
  fuelType: string | null   // null = unit outside the reference list
  pn: number                // max PN across all SPs (EOL)
  mel: number | null        // EMX
  sel: number | null        // EMI
  source: 'pn' | 'committed' | 'both'
}

const FUEL_CHIPS: Record<string, { label: string; chipClass: string }> = {
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
}

function TypeChip({ fuelType }: { fuelType: string | null }) {
  if (!fuelType) return <span style={{ color: 'var(--text-faint)', fontSize: 11 }}>—</span>
  const { label, chipClass } = FUEL_CHIPS[fuelType] ?? { label: fuelType, chipClass: '' }
  return <span className={`chip ${chipClass}`}>{label}</span>
}

function SourceBadge({ source }: { source: GraphRow['source'] }) {
  return (
    <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
      {(source === 'pn' || source === 'both') && (
        <span className="badge-state-committed" style={{ fontSize: 10, padding: '1px 5px', borderRadius: 4, fontWeight: 600, whiteSpace: 'nowrap' }}>PN</span>
      )}
      {(source === 'committed' || source === 'both') && (
        <span className="chip chip-sr" style={{ fontSize: 10, padding: '1px 5px', whiteSpace: 'nowrap' }}>User</span>
      )}
    </span>
  )
}

function SortTh({ col, sort, onSort, children, numeric }: {
  col: SortKey
  sort: { key: SortKey; dir: 'asc' | 'desc' }
  onSort: (k: SortKey) => void
  children: React.ReactNode
  numeric?: boolean
}) {
  const active = sort.key === col
  return (
    <th
      className={[numeric ? 'num' : '', 'sortable', active ? 'col-active' : ''].filter(Boolean).join(' ')}
      onClick={() => onSort(col)}
    >
      <span className="th-inner">
        {children}
        <span className="sort-caret">{active ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}</span>
      </span>
    </th>
  )
}

const SOURCE_WEIGHT: Record<GraphRow['source'], number> = { committed: 0, both: 1, pn: 2 }

export default function GraphTab({ settlementPeriods, units, drafts }: Props) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'source', dir: 'asc' })

  const toggleSort = useCallback((key: SortKey) => {
    setSort(s => ({ key, dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc' }))
  }, [])

  const unitById = useMemo(() => new Map(units.map(u => [u.bmUnitId, u])), [units])

  // Max PN across all SPs for every bmUnit in sp.pn — includes units outside the reference list
  const allPnByBmUnit = useMemo<Record<string, number>>(() => {
    const out: Record<string, number> = {}
    for (const sp of settlementPeriods) {
      for (const [bmUnit, pn] of Object.entries(sp.pn)) {
        if (pn > (out[bmUnit] ?? 0)) out[bmUnit] = pn
      }
    }
    return out
  }, [settlementPeriods])

  const rows = useMemo<GraphRow[]>(() => {
    const map = new Map<string, GraphRow>()

    // All units with PN > 1 in any SP
    for (const [bmUnit, maxPn] of Object.entries(allPnByBmUnit)) {
      if (maxPn <= 1) continue
      const unit = unitById.get(bmUnit)
      map.set(bmUnit, {
        bmUnitId: bmUnit,
        nationalGridBmUnit: unit?.nationalGridBmUnit ?? bmUnit,
        gspGroup: unit?.gspGroup ?? '—',
        fuelType: unit?.fuelType ?? null,
        pn: maxPn,
        mel: unit?.registeredCapacity ?? null,
        sel: unit?.sel ?? null,
        source: 'pn',
      })
    }

    // Overlay committed draft units — tag existing rows as 'both', add new rows as 'committed'
    for (const draft of drafts) {
      if (draft.status !== 'committed') continue
      for (const action of draft.actions) {
        const existing = map.get(action.bmUnitId)
        if (existing) {
          existing.source = 'both'
        } else {
          const unit = unitById.get(action.bmUnitId)
          map.set(action.bmUnitId, {
            bmUnitId: action.bmUnitId,
            nationalGridBmUnit: unit?.nationalGridBmUnit ?? action.bmUnitId,
            gspGroup: unit?.gspGroup ?? '—',
            fuelType: unit?.fuelType ?? null,
            pn: allPnByBmUnit[action.bmUnitId] ?? 0,
            mel: unit?.registeredCapacity ?? null,
            sel: unit?.sel ?? null,
            source: 'committed',
          })
        }
      }
    }

    return Array.from(map.values())
  }, [allPnByBmUnit, unitById, drafts])

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      let cmp = 0
      switch (sort.key) {
        case 'bmu':        cmp = a.nationalGridBmUnit.localeCompare(b.nationalGridBmUnit); break
        case 'fuelType':   cmp = (a.fuelType ?? '').localeCompare(b.fuelType ?? ''); break
        case 'pn':         cmp = a.pn - b.pn; break
        case 'mel':        cmp = (a.mel ?? -1) - (b.mel ?? -1); break
        case 'sel':        cmp = (a.sel ?? -1) - (b.sel ?? -1); break
        case 'source':     cmp = SOURCE_WEIGHT[a.source] - SOURCE_WEIGHT[b.source]; break
      }
      return sort.dir === 'asc' ? cmp : -cmp
    })
  }, [rows, sort])

  const pnCount = rows.filter(r => r.source !== 'committed').length
  const userCount = rows.filter(r => r.source !== 'pn').length

  return (
    <div className="panel">
      <header className="panel-head">
        <div className="panel-title">
          <h2>BMU Summary</h2>
          <span className="panel-subtitle">{pnCount} dispatched · {userCount} committed by user</span>
        </div>
      </header>

      <div className="table-scroll">
        <table className="data-table" style={{ width: '100%', tableLayout: 'fixed' }}>
          <thead>
            <tr>
              <SortTh col="bmu"      sort={sort} onSort={toggleSort}>BMU</SortTh>
              <SortTh col="fuelType" sort={sort} onSort={toggleSort}>Type</SortTh>
              <SortTh col="mel"      sort={sort} onSort={toggleSort} numeric>EMX</SortTh>
              <SortTh col="pn"       sort={sort} onSort={toggleSort} numeric>EOL</SortTh>
              <SortTh col="sel"      sort={sort} onSort={toggleSort} numeric>EMI</SortTh>
              <SortTh col="source"   sort={sort} onSort={toggleSort}>Source</SortTh>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr><td colSpan={6} className="empty">No units contributing to the graph.</td></tr>
            )}
            {sorted.map(row => (
              <tr key={row.bmUnitId}>
                <td className="mono">{row.nationalGridBmUnit}</td>
                <td><TypeChip fuelType={row.fuelType} /></td>
                <td className="mono num">{row.mel != null ? row.mel.toFixed(0) : '—'}</td>
                <td className="mono num">{row.pn > 0 ? row.pn.toFixed(0) : '—'}</td>
                <td className="mono num">{row.sel != null && row.sel > 0 ? row.sel.toFixed(0) : '—'}</td>
                <td><SourceBadge source={row.source} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
