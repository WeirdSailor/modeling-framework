'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  BarChart, Bar, Cell, XAxis, YAxis, Tooltip, CartesianGrid,
  ResponsiveContainer, ReferenceLine,
} from 'recharts'
import type { BMUnit, ServiceType, SettlementPeriodData } from '@/models/types'
import { GspFilterPopover } from '@/components/GspFilterPopover'
import { TIMEFRAME_OPTIONS, AsServicesPopover, type AsServicesFilter } from '@/components/BatteryFilters'
import { computeBatteryAvailability } from '@/utils/batteryAvailability'
import { computeBatteryReliability, type ReliabilityTotals } from '@/utils/batteryReliability'

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
}

// ── Theme (mirrors AreaChart/MarginChart) ───────────────────────────────────

function useDarkMode() {
  const [isDark, setIsDark] = useState(false)
  useEffect(() => {
    const check = () => setIsDark(document.documentElement.getAttribute('data-theme') === 'dark')
    check()
    const observer = new MutationObserver(check)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])
  return isDark
}

interface ChartTheme {
  grid: string; axisText: string
  tooltipBg: string; tooltipBorder: string; tooltipText: string; tooltipMuted: string
}

const LIGHT: ChartTheme = {
  grid: '#f0f0f0', axisText: '#6b7280',
  tooltipBg: '#ffffff', tooltipBorder: '#e5e7eb', tooltipText: '#111827', tooltipMuted: '#6b7280',
}
const DARK: ChartTheme = {
  grid: '#1f2530', axisText: '#64748b',
  tooltipBg: '#0f1218', tooltipBorder: '#2d3441', tooltipText: '#f1f5f9', tooltipMuted: '#94a3b8',
}

function ServiceChip({ service }: { service: ServiceType | undefined }) {
  if (!service) return <span style={{ color: 'var(--text-faint)', fontSize: 11 }}>—</span>
  return <span className={`chip chip-${service.toLowerCase()}`}>{service}</span>
}

function TypeChip() {
  return <span className="chip chip-battery">Battery</span>
}

function formatMw(value: number): string {
  return `${Math.round(value).toLocaleString()} MW`
}

type SortKey = 'nationalGridBmUnit' | 'mel' | 'avail'

function SortTh({ col, sort, onSort, children, numeric }: {
  col: SortKey; sort: { key: SortKey; dir: 'asc' | 'desc' }
  onSort: (k: SortKey) => void; children: React.ReactNode; numeric?: boolean
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

interface ChartBar extends ReliabilityTotals {
  sp: number
  startTime: string
  deratedOff: number
}

export default function BatteryReliabilityTab({
  units, settlementPeriods, unitServices,
  gspFilter, onGspFilterChange, asFilter, onAsFilterChange, tfIndex, onTfIndexChange,
}: Props) {
  const [requirementMW, setRequirementMW] = useState(0)
  const [deRatePct, setDeRatePct] = useState(0)
  const [gspOpen, setGspOpen] = useState(false)
  const [asOpen, setAsOpen] = useState(false)
  const gspWrapperRef = useRef<HTMLDivElement>(null)
  const asWrapperRef = useRef<HTMLDivElement>(null)
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'nationalGridBmUnit', dir: 'asc' })

  const isDark = useDarkMode()
  const t = isDark ? DARK : LIGHT

  const { spCount } = TIMEFRAME_OPTIONS[tfIndex]

  const windowSps = useMemo(() =>
    [...settlementPeriods].sort((a, b) => a.settlementPeriod - b.settlementPeriod).slice(0, spCount),
    [settlementPeriods, spCount]
  )

  const gspIncluded = useMemo(() => Object.entries(gspFilter).filter(([, v]) => v === 'include').map(([k]) => k), [gspFilter])
  const gspExcluded = useMemo(() => Object.entries(gspFilter).filter(([, v]) => v === 'exclude').map(([k]) => k), [gspFilter])

  const tableRows = useMemo(() => {
    const avail = computeBatteryAvailability(units, windowSps, spCount)
    return computeBatteryReliability(avail, gspFilter, asFilter, unitServices, deRatePct, requirementMW).rows
  }, [units, windowSps, spCount, gspFilter, asFilter, unitServices, deRatePct, requirementMW])

  const sortedRows = useMemo(() => {
    const list = [...tableRows]
    list.sort((a, b) => {
      const av = a[sort.key], bv = b[sort.key]
      const cmp = typeof av === 'number'
        ? (av as number) - (bv as number)
        : String(av).localeCompare(String(bv))
      return sort.dir === 'asc' ? cmp : -cmp
    })
    return list
  }, [tableRows, sort])

  const toggleSort = useCallback((key: SortKey) => {
    setSort(s => ({ key, dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc' }))
  }, [])

  const chartData = useMemo<ChartBar[]>(() => {
    return windowSps.map(sp => {
      const avail = computeBatteryAvailability(units, [sp], 1)
      const { totals } = computeBatteryReliability(avail, gspFilter, asFilter, unitServices, deRatePct, requirementMW)
      return {
        ...totals,
        sp: sp.settlementPeriod,
        startTime: sp.startTime,
        deratedOff: totals.usable - totals.reliable,
      }
    })
  }, [windowSps, units, gspFilter, asFilter, unitServices, deRatePct, requirementMW])

  const worstBar = useMemo(() => {
    if (chartData.length === 0) return null
    return chartData.reduce((worst, bar) => bar.reliable < worst.reliable ? bar : worst, chartData[0])
  }, [chartData])

  const avgReliable = useMemo(() => {
    if (chartData.length === 0) return 0
    return chartData.reduce((s, b) => s + b.reliable, 0) / chartData.length
  }, [chartData])

  if (units.length === 0) {
    return (
      <div className="workspace-empty">
        <h2>No battery units found</h2>
        <p>No units with fuel type BATTERY were returned by the data source.</p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'auto' }}>
      {/* Filters row */}
      <div style={{
        padding: '10px 20px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-panel)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap',
        flexShrink: 0,
      }}>
        {/* GSP filter */}
        {(() => {
          const incCount = gspIncluded.length
          const excCount = gspExcluded.length
          const active = incCount > 0 || excCount > 0
          const excOnly = excCount > 0 && incCount === 0
          return (
            <div ref={gspWrapperRef} style={{ position: 'relative' }}>
              <button style={{
                border: `1px solid ${active ? (excOnly ? '#dc2626' : '#4f46e5') : 'var(--border-strong)'}`,
                borderRadius: 6, padding: '5px 10px', fontSize: 12, cursor: 'pointer',
                background: active ? (excOnly ? 'rgba(220,38,38,.1)' : 'rgba(79,70,229,.1)') : 'var(--bg-panel)',
                color: active ? (excOnly ? '#fca5a5' : '#a5b4fc') : 'var(--text-soft)',
                display: 'flex', alignItems: 'center', gap: 6,
              }} onClick={() => setGspOpen(o => !o)}>
                GSP ▾
                {incCount > 0 && <span style={{ background: '#4f46e5', color: '#fff', fontSize: 10, borderRadius: 999, padding: '1px 5px', fontWeight: 600 }}>+{incCount}</span>}
                {excCount > 0 && <span style={{ background: '#dc2626', color: '#fff', fontSize: 10, borderRadius: 999, padding: '1px 5px', fontWeight: 600 }}>−{excCount}</span>}
              </button>
              {gspOpen && <GspFilterPopover gspFilter={gspFilter} onChange={onGspFilterChange} onClose={() => setGspOpen(false)} wrapperRef={gspWrapperRef} />}
            </div>
          )
        })()}

        {/* AS Services filter */}
        {(() => {
          const count = (asFilter.sr ? 1 : 0) + (asFilter.qr ? 1 : 0)
          const active = count > 0
          return (
            <div ref={asWrapperRef} style={{ position: 'relative' }}>
              <button style={{
                border: `1px solid ${active ? '#4f46e5' : 'var(--border-strong)'}`,
                borderRadius: 6, padding: '5px 10px', fontSize: 12, cursor: 'pointer',
                background: active ? 'rgba(79,70,229,.1)' : 'var(--bg-panel)',
                color: active ? '#a5b4fc' : 'var(--text-soft)',
                display: 'flex', alignItems: 'center', gap: 6,
              }} onClick={() => setAsOpen(o => !o)}>
                AS Services ▾
                {count > 0 && <span style={{ background: '#4f46e5', color: '#fff', fontSize: 10, borderRadius: 999, padding: '1px 5px', fontWeight: 600 }}>{count}</span>}
              </button>
              {asOpen && <AsServicesPopover filter={asFilter} onChange={onAsFilterChange} onClose={() => setAsOpen(false)} wrapperRef={asWrapperRef} />}
            </div>
          )
        })()}

        {/* Timeframe selector */}
        <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
          {TIMEFRAME_OPTIONS.map((opt, i) => (
            <button
              key={opt.label}
              onClick={() => onTfIndexChange(i)}
              style={{
                padding: '3px 10px', borderRadius: 4, fontSize: 11, cursor: 'pointer',
                background: tfIndex === i ? 'var(--accent,#6366f1)' : 'var(--surface)',
                color: tfIndex === i ? '#fff' : 'var(--text-muted)',
                border: '1px solid var(--border)',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Inputs row */}
      <div style={{
        padding: '10px 20px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-panel)',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        flexShrink: 0,
      }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-soft)' }}>
          Requirement (MW)
          <input
            type="number"
            value={requirementMW}
            onChange={e => setRequirementMW(Number(e.target.value))}
            style={{
              width: 90, padding: '4px 8px', fontSize: 12, borderRadius: 4,
              border: '1px solid var(--border-strong)', background: 'var(--bg-panel)', color: 'var(--text)',
            }}
          />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-soft)' }}>
          De-rate (%)
          <input
            type="number"
            min={0}
            max={100}
            value={deRatePct}
            onChange={e => setDeRatePct(Math.min(100, Math.max(0, Number(e.target.value))))}
            style={{
              width: 70, padding: '4px 8px', fontSize: 12, borderRadius: 4,
              border: '1px solid var(--border-strong)', background: 'var(--bg-panel)', color: 'var(--text)',
            }}
          />
        </label>
      </div>

      {/* Headline */}
      {worstBar && (
        <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          {(() => {
            const surplus = worstBar.margin
            const surplusColor = surplus >= 0 ? '#22c55e' : '#ef4444'
            const surplusLabel = surplus >= 0 ? 'Surplus' : 'Shortfall'
            const sign = surplus >= 0 ? '+' : ''
            return (
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text)' }}>
                Worst SP ({worstBar.startTime.slice(11, 16)}): Reliable {formatMw(worstBar.reliable)} vs Requirement {formatMw(requirementMW)} →{' '}
                <span style={{ color: surplusColor, fontWeight: 700 }}>{surplusLabel} {sign}{formatMw(surplus)}</span>
              </p>
            )
          })()}
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-soft)' }}>
            Window average reliable: {formatMw(avgReliable)}
          </p>
        </div>
      )}

      {/* Hero chart */}
      <div style={{ flexShrink: 0, height: 280, padding: '12px 20px' }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
            barCategoryGap={chartData.length === 1 ? '70%' : '20%'}
          >
            <CartesianGrid strokeDasharray="3 3" stroke={t.grid} />
            <XAxis
              dataKey="startTime"
              tickFormatter={(v: string) => v.slice(11, 16)}
              tick={{ fontSize: 11, fill: t.axisText }}
              axisLine={{ stroke: t.grid }}
              tickLine={{ stroke: t.grid }}
            />
            <YAxis
              tick={{ fontSize: 11, fill: t.axisText }}
              axisLine={{ stroke: t.grid }}
              tickLine={{ stroke: t.grid }}
              label={{ value: 'MW', angle: -90, position: 'insideLeft', offset: 10, fontSize: 11, fill: t.axisText }}
            />
            <Tooltip
              contentStyle={{ background: t.tooltipBg, border: `1px solid ${t.tooltipBorder}`, borderRadius: 8, fontSize: 11.5 }}
              labelFormatter={(v: any) => String(v).slice(11, 16)}
              labelStyle={{ color: t.tooltipText }}
              itemStyle={{ color: t.tooltipMuted }}
            />
            <ReferenceLine
              y={requirementMW} stroke="#f59e0b" strokeDasharray="5 4" strokeWidth={1.5}
              label={{ value: 'Requirement', position: 'insideTopRight', fontSize: 10, fill: '#f59e0b' }}
            />
            <Bar dataKey="reliable" name="Reliable" stackId="a" fill="#22c55e" maxBarSize={80}>
              {chartData.map((bar, i) => (
                <Cell
                  key={i}
                  fill="#22c55e"
                  stroke={bar.reliable < requirementMW ? '#ef4444' : undefined}
                  strokeWidth={bar.reliable < requirementMW ? 2 : 0}
                />
              ))}
            </Bar>
            <Bar dataKey="deratedOff" name="De-rated off" stackId="a" fill="#22c55e" fillOpacity={0.35} maxBarSize={80} />
            <Bar dataKey="contracted" name="Contracted" stackId="a" fill="#8b5cf6" maxBarSize={80} />
            <Bar dataKey="constrained" name="Constrained" stackId="a" fill="#ef4444" maxBarSize={80} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Supporting table */}
      <div className="table-scroll" style={{ flex: 1 }}>
        <table className="data-table" style={{ tableLayout: 'fixed', width: '100%' }}>
          <thead>
            <tr>
              <SortTh col="nationalGridBmUnit" sort={sort} onSort={toggleSort}>BMU</SortTh>
              <th>Type</th>
              <th>Service</th>
              <SortTh col="mel" sort={sort} onSort={toggleSort} numeric>MEL</SortTh>
              <SortTh col="avail" sort={sort} onSort={toggleSort} numeric>Avail.</SortTh>
              <th className="num">Constrained</th>
              <th className="num">Contracted</th>
              <th className="num">Included</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map(row => (
              <tr key={row.bmUnitId}>
                <td className="mono">
                  <div className="bmu-cell-inner">
                    <span>{row.nationalGridBmUnit}</span>
                  </div>
                </td>
                <td><TypeChip /></td>
                <td><ServiceChip service={row.service} /></td>
                <td className="mono num">{row.mel > 0 ? row.mel.toFixed(0) : '—'}</td>
                <td className="mono num">{row.avail.toFixed(0)}</td>
                <td className="num">{row.constrained ? '✓' : '—'}</td>
                <td className="num">{row.contracted ? '✓' : '—'}</td>
                <td className="num">{row.included ? '✓' : '✗'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
