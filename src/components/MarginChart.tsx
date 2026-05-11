'use client'

import { useEffect, useState, Fragment } from 'react'
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ReferenceLine,
  ReferenceArea,
  CartesianGrid,
  ResponsiveContainer,
} from 'recharts'
import type { TooltipContentProps, TooltipPayloadEntry } from 'recharts'
import { useModellingStore } from '@/store/useModellingStore'
import { applyDraftToBaseline } from '@/utils/margin'
import type { DraftPlan } from '@/models/types'

function useDarkMode() {
  const [isDark, setIsDark] = useState(false)
  useEffect(() => {
    const check = () =>
      setIsDark(document.documentElement.getAttribute('data-theme') === 'dark')
    check()
    const observer = new MutationObserver(check)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })
    return () => observer.disconnect()
  }, [])
  return isDark
}

interface ChartTheme {
  bg: string
  grid: string
  axisText: string
  zeroLine: string
  unconfirmedFill: string
  demand: string
  emx: string
  eol: string
  emi: string
  gateClosure: string
  midnight: string
  tooltipBg: string
  tooltipBorder: string
  tooltipText: string
  tooltipMuted: string
  legendText: string
}

const LIGHT: ChartTheme = {
  bg:               '#ffffff',
  grid:             '#f0f0f0',
  axisText:         '#6b7280',
  zeroLine:         '#9ca3af',
  unconfirmedFill:  '#f9fafb',
  demand:           '#1f2937',
  emx:              '#16a34a',
  eol:              '#3b82f6',
  emi:              '#9ca3af',
  gateClosure:      '#d97706',
  midnight:         '#6b7280',
  tooltipBg:        '#ffffff',
  tooltipBorder:    '#e5e7eb',
  tooltipText:      '#111827',
  tooltipMuted:     '#6b7280',
  legendText:       '#374151',
}

const DARK: ChartTheme = {
  bg:               '#0f1218',
  grid:             '#1f2530',
  axisText:         '#64748b',
  zeroLine:         '#2d3441',
  unconfirmedFill:  '#161a22',
  demand:           '#e2e8f0',
  emx:              '#34d399',
  eol:              '#60a5fa',
  emi:              '#475569',
  gateClosure:      '#fbbf24',
  midnight:         '#64748b',
  tooltipBg:        '#0f1218',
  tooltipBorder:    '#2d3441',
  tooltipText:      '#f1f5f9',
  tooltipMuted:     '#94a3b8',
  legendText:       '#94a3b8',
}

function formatYTick(value: number): string {
  if (Math.abs(value) >= 1000) return `${Math.round(value / 1000)}k`
  return String(value)
}

function formatMW(value: number): string {
  return value.toLocaleString('en-GB')
}

function renderTooltip(activeDrafts: DraftPlan[], t: ChartTheme) {
  return function TooltipContent(props: TooltipContentProps) {
    const { active, payload, label } = props
    if (!active || !payload || payload.length === 0) return null
    const firstEntry = (payload as ReadonlyArray<TooltipPayloadEntry>)[0]
    const raw = firstEntry?.payload as Record<string, number> | undefined
    if (!raw) return null

    const marginColor = raw.margin >= 0 ? '#22c55e' : '#ef4444'
    const marginSign  = raw.margin >= 0 ? '+' : ''
    const isConfirmed = raw.confirmed === 1

    return (
      <div style={{
        background: t.tooltipBg,
        border: `1px solid ${t.tooltipBorder}`,
        borderRadius: 8,
        padding: '10px 12px',
        fontSize: 11.5,
        fontFamily: 'var(--font-mono, monospace)',
        boxShadow: '0 4px 16px rgba(0,0,0,.25)',
        minWidth: 180,
      }}>
        <p style={{ fontWeight: 600, color: t.tooltipText, margin: '0 0 6px' }}>
          SP {raw.sp} ({label})
          {!isConfirmed && (
            <span style={{ marginLeft: 6, color: t.gateClosure, fontWeight: 400 }}>[unconfirmed]</span>
          )}
        </p>
        <p style={{ color: t.tooltipMuted, margin: '2px 0' }}>Demand: {formatMW(raw.demand)} MW</p>
        <p style={{ color: t.tooltipMuted, margin: '2px 0' }}>EMX:&nbsp;&nbsp;&nbsp;&nbsp;{formatMW(raw.emx)} MW</p>
        <p style={{ color: t.tooltipMuted, margin: '2px 0' }}>EOL:&nbsp;&nbsp;&nbsp;&nbsp;{formatMW(raw.eol)} MW</p>
        <p style={{ color: t.tooltipMuted, margin: '2px 0' }}>EMI:&nbsp;&nbsp;&nbsp;&nbsp;{formatMW(raw.emi)} MW</p>
        <p style={{ color: marginColor, fontWeight: 600, margin: '4px 0 0' }}>
          Margin: {marginSign}{formatMW(raw.margin)} MW
        </p>
        {activeDrafts.map(draft => {
          const draftEmx = raw[`draft_${draft.id}_emx`]
          if (draftEmx == null) return null
          const draftMargin     = draftEmx - raw.demand
          const draftMarginSign = draftMargin >= 0 ? '+' : ''
          return (
            <div key={draft.id} style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${t.tooltipBorder}` }}>
              <p style={{ color: draft.color, fontWeight: 600, margin: '0 0 2px' }}>{draft.name}</p>
              <p style={{ color: draft.color, margin: 0 }}>
                EMX: {formatMW(draftEmx)} MW &nbsp;|&nbsp;
                Margin: {draftMarginSign}{formatMW(draftMargin)} MW
              </p>
            </div>
          )
        })}
      </div>
    )
  }
}

export function MarginChart({ hiddenDraftIds = new Set<string>() }: { hiddenDraftIds?: Set<string> }) {
  const settlementPeriods = useModellingStore(state => state.settlementPeriods)
  const drafts            = useModellingStore(state => state.drafts)
  const units             = useModellingStore(state => state.units)
  const isLoading         = useModellingStore(state => state.isLoading)
  const isDark            = useDarkMode()
  const t                 = isDark ? DARK : LIGHT

  if (isLoading || settlementPeriods.length === 0) {
    return (
      <div style={{
        background: t.bg, borderRadius: 12, padding: 16,
        border: `1px solid ${t.tooltipBorder}`,
        flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column',
      }}>
        <h2 style={{ fontSize: 13, fontWeight: 500, color: t.axisText, margin: '0 0 8px' }}>
          Margin Analysis — {settlementPeriods.length} Settlement Periods
        </h2>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.axisText }}>
          {isLoading ? 'Loading data...' : 'No data available'}
        </div>
      </div>
    )
  }

  const activeDrafts = drafts.filter(d => d.status === 'draft' && !hiddenDraftIds.has(d.id))
  const committedActions = drafts
    .filter(d => d.status === 'committed')
    .flatMap(d => d.actions)

  const firstTomorrowDate = settlementPeriods.find((sp, i) =>
    i > 0 && sp.settlementDate !== settlementPeriods[i - 1].settlementDate
  )?.settlementDate

  function slotLabel(sp: typeof settlementPeriods[0], index: number): string {
    const hhmm = sp.startTime.slice(11, 16)
    if (index > 0 && sp.settlementDate === firstTomorrowDate &&
        settlementPeriods[index - 1].settlementDate !== firstTomorrowDate) {
      return `↑ ${hhmm}`
    }
    return hhmm
  }

  const tickLabels = settlementPeriods
    .filter((_, i) => i % 4 === 0)
    .map((sp, i) => slotLabel(sp, i * 4))

  const midnightLabel = settlementPeriods.findIndex((sp, i) =>
    i > 0 && sp.settlementDate === firstTomorrowDate &&
    settlementPeriods[i - 1].settlementDate !== firstTomorrowDate
  )

  const frontierIndex = settlementPeriods.findIndex(sp => !sp.hasConfirmedPn)

  const chartData = settlementPeriods.map((sp, index) => {
    const spNum = sp.settlementPeriod
    const alreadyModelled = new Set<string>()
    for (const [bmUnit, pn] of Object.entries(sp.pn)) {
      if (pn > 1) alreadyModelled.add(bmUnit)
    }
    for (const action of committedActions) {
      if (action.fromPeriod <= spNum && action.toPeriod >= spNum) {
        alreadyModelled.add(action.bmUnitId)
      }
    }

    const point: Record<string, number | string | null> = {
      sp: spNum,
      label: slotLabel(sp, index),
      confirmed: sp.hasConfirmedPn ? 1 : 0,
      demand: sp.demand,
      emx: sp.emx,
      eol: sp.eol,
      emi: sp.emi,
      margin: sp.margin,
      marginPositive: Math.max(0, sp.margin),
      marginNegative: Math.min(0, sp.margin),
    }

    for (const draft of activeDrafts) {
      const overlay = applyDraftToBaseline(
        sp, sp.emx, sp.eol, sp.emi,
        draft.actions, alreadyModelled, units
      )

      const spCovered = (slotIdx: number) =>
        draft.actions.some(a => a.fromPeriod <= slotIdx && a.toPeriod >= slotIdx)

      const affects = spCovered(spNum)
      const isBridge = !affects && (
        (index > 0 && spCovered(settlementPeriods[index - 1].settlementPeriod)) ||
        (index < settlementPeriods.length - 1 && spCovered(settlementPeriods[index + 1].settlementPeriod))
      )

      if (affects) {
        point[`draft_${draft.id}_emx`] = overlay.emx
        point[`draft_${draft.id}_eol`] = overlay.eol
        point[`draft_${draft.id}_emi`] = overlay.emi
      } else if (isBridge) {
        // Anchor point at baseline so the dotted line branches off the solid cleanly
        point[`draft_${draft.id}_emx`] = sp.emx
        point[`draft_${draft.id}_eol`] = sp.eol
        point[`draft_${draft.id}_emi`] = sp.emi
      } else {
        point[`draft_${draft.id}_emx`] = null
        point[`draft_${draft.id}_eol`] = null
        point[`draft_${draft.id}_emi`] = null
      }
    }

    return point
  })

  const tooltipRenderer = renderTooltip(activeDrafts, t)
  const frontierLabel   = frontierIndex >= 0 ? (chartData[frontierIndex]?.label as string ?? null) : null
  const lastLabel       = chartData[chartData.length - 1]?.label as string

  return (
    <div style={{
      background: t.bg,
      borderRadius: 12,
      padding: '14px 16px',
      border: `1px solid ${t.tooltipBorder}`,
      flex: 1,
      minHeight: 0,
      display: 'flex',
      flexDirection: 'column',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <h2 style={{ margin: 0, fontSize: 13, fontWeight: 500, color: t.axisText }}>
          Margin Analysis — {chartData.length} Settlement Periods
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 11.5, color: t.tooltipMuted }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 3, background: '#22c55e', opacity: .7 }} />
            Surplus
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 3, background: '#ef4444', opacity: .7 }} />
            Deficit
          </span>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0 }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={t.grid} />

          <XAxis
            dataKey="label"
            ticks={tickLabels}
            tick={{ fontSize: 11, fill: t.axisText }}
            axisLine={{ stroke: t.grid }}
            tickLine={{ stroke: t.grid }}
          />
          <YAxis
            tickFormatter={formatYTick}
            tick={{ fontSize: 11, fill: t.axisText }}
            axisLine={{ stroke: t.grid }}
            tickLine={{ stroke: t.grid }}
            label={{ value: 'MW', angle: -90, position: 'insideLeft', offset: 10, fontSize: 11, fill: t.axisText }}
          />

          <Tooltip content={tooltipRenderer} />
          <Legend
            verticalAlign="bottom"
            height={36}
            wrapperStyle={{ fontSize: 11, color: t.legendText }}
          />

          <ReferenceLine y={0} stroke={t.zeroLine} strokeDasharray="4 4" />

          {frontierLabel && (
            <ReferenceArea
              x1={frontierLabel}
              x2={lastLabel}
              fill={t.unconfirmedFill}
              fillOpacity={isDark ? 0.6 : 0.8}
            />
          )}
          {frontierLabel && (
            <ReferenceLine
              x={frontierLabel}
              stroke={t.gateClosure}
              strokeDasharray="4 3"
              label={{ value: 'gate closure →', position: 'insideTopRight', fontSize: 9, fill: t.gateClosure }}
            />
          )}
          {midnightLabel >= 0 && (
            <ReferenceLine
              x={chartData[midnightLabel]?.label as string}
              stroke={t.midnight}
              strokeDasharray="3 3"
              label={{ value: '← midnight', position: 'insideTopLeft', fontSize: 9, fill: t.midnight }}
            />
          )}

          <Area dataKey="marginPositive" name="Surplus margin" baseValue={0}
            fill="#22c55e" fillOpacity={0.25} stroke="none" legendType="none" dot={false} activeDot={false} />
          <Area dataKey="marginNegative" name="Deficit margin" baseValue={0}
            fill="#ef4444" fillOpacity={0.25} stroke="none" legendType="none" dot={false} activeDot={false} />

          <Line dataKey="emi"    name="EMI"    stroke={t.emi}    strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} />
          <Line dataKey="eol"    name="EOL"    stroke={t.eol}    strokeWidth={2}   dot={false} activeDot={{ r: 3 }} />
          <Line dataKey="demand" name="Demand" stroke={t.demand} strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
          <Line dataKey="emx"    name="EMX"    stroke={t.emx}    strokeWidth={2}   dot={false} activeDot={{ r: 3 }} />

          {activeDrafts.map(draft => (
            <Fragment key={draft.id}>
              <Line dataKey={`draft_${draft.id}_emi`} name={`${draft.name} EMI`}
                stroke={draft.color} strokeWidth={1} strokeDasharray="4 4" strokeOpacity={0.55} dot={false} activeDot={{ r: 2 }} />
              <Line dataKey={`draft_${draft.id}_eol`} name={`${draft.name} EOL`}
                stroke={draft.color} strokeWidth={1.5} strokeDasharray="6 3" strokeOpacity={0.75} dot={false} activeDot={{ r: 3 }} />
              <Line dataKey={`draft_${draft.id}_emx`} name={`${draft.name} EMX`}
                stroke={draft.color} strokeWidth={2} strokeDasharray="6 3" dot={false} activeDot={{ r: 3 }} />
            </Fragment>
          ))}
        </ComposedChart>
      </ResponsiveContainer>
      </div>
    </div>
  )
}
