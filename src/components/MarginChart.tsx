'use client'

import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ReferenceLine,
  CartesianGrid,
  ResponsiveContainer,
} from 'recharts'
import type { TooltipContentProps, TooltipPayload, TooltipValueType, TooltipPayloadEntry } from 'recharts'
import { useModellingStore } from '@/store/useModellingStore'
import { spToTime } from '@/utils/settlements'

interface ChartDataPoint {
  sp: number
  label: string
  demand: number
  emx: number
  eol: number
  emi: number
  margin: number
  marginPositive: number
  marginNegative: number
}

// X-axis ticks: every 4th SP (SP 1, 5, 9, ..., 45) = every 2 hours
const TICK_SPS = [1, 5, 9, 13, 17, 21, 25, 29, 33, 37, 41, 45]
const TICK_LABELS = TICK_SPS.map(sp => spToTime(sp))

function formatYTick(value: number): string {
  if (Math.abs(value) >= 1000) {
    return `${Math.round(value / 1000)}k`
  }
  return String(value)
}

function formatMW(value: number): string {
  return value.toLocaleString('en-GB')
}

function renderTooltip(props: TooltipContentProps) {
  const { active, payload, label } = props
  if (!active || !payload || payload.length === 0) return null

  const firstEntry = (payload as ReadonlyArray<TooltipPayloadEntry>)[0]
  const raw = firstEntry?.payload as ChartDataPoint | undefined
  if (!raw) return null

  const marginColor = raw.margin >= 0 ? '#16a34a' : '#ef4444'
  const marginSign = raw.margin >= 0 ? '+' : ''

  return (
    <div className="bg-white border border-gray-200 rounded shadow-md p-3 text-xs font-mono">
      <p className="font-semibold text-gray-800 mb-1">
        SP {raw.sp} ({label})
      </p>
      <p className="text-gray-700">Demand: {formatMW(raw.demand)} MW</p>
      <p className="text-gray-700">EMX:&nbsp;&nbsp;&nbsp;&nbsp;{formatMW(raw.emx)} MW</p>
      <p className="text-gray-700">EOL:&nbsp;&nbsp;&nbsp;&nbsp;{formatMW(raw.eol)} MW</p>
      <p className="text-gray-700">EMI:&nbsp;&nbsp;&nbsp;&nbsp;{formatMW(raw.emi)} MW</p>
      <p style={{ color: marginColor }} className="font-semibold">
        Margin: {marginSign}{formatMW(raw.margin)} MW
      </p>
    </div>
  )
}

export function MarginChart() {
  const settlementPeriods = useModellingStore(state => state.settlementPeriods)
  const isLoading = useModellingStore(state => state.isLoading)

  if (isLoading || settlementPeriods.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-4">
        <h2 className="text-sm font-medium text-gray-600 mb-2">
          Margin Analysis — 48 Settlement Periods
        </h2>
        <div className="h-80 flex items-center justify-center text-gray-400">
          {isLoading ? 'Loading data...' : 'No data available'}
        </div>
      </div>
    )
  }

  const chartData: ChartDataPoint[] = settlementPeriods.map(sp => {
    const margin = sp.emx - sp.demand
    return {
      sp: sp.settlementPeriod,
      label: spToTime(sp.settlementPeriod),
      demand: sp.demand,
      emx: sp.emx,
      eol: sp.eol,
      emi: sp.emi,
      margin,
      marginPositive: Math.max(0, margin),
      marginNegative: Math.min(0, margin),
    }
  })

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <h2 className="text-sm font-medium text-gray-600 mb-2">
        Margin Analysis — 48 Settlement Periods
      </h2>
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />

          <XAxis
            dataKey="label"
            ticks={TICK_LABELS}
            tick={{ fontSize: 11 }}
          />

          <YAxis
            tickFormatter={formatYTick}
            tick={{ fontSize: 11 }}
            label={{ value: 'MW', angle: -90, position: 'insideLeft', offset: 10, fontSize: 11 }}
          />

          <Tooltip content={renderTooltip} />
          <Legend verticalAlign="bottom" height={36} />

          <ReferenceLine y={0} stroke="#9ca3af" strokeDasharray="4 4" />

          {/* Margin fill areas — positive green, negative red */}
          <Area
            dataKey="marginPositive"
            name="Surplus margin"
            stackId="pos"
            fill="#22c55e"
            fillOpacity={0.3}
            stroke="none"
            legendType="none"
            dot={false}
            activeDot={false}
          />
          <Area
            dataKey="marginNegative"
            name="Deficit margin"
            stackId="neg"
            fill="#ef4444"
            fillOpacity={0.3}
            stroke="none"
            legendType="none"
            dot={false}
            activeDot={false}
          />

          {/* EMI line — dashed gray */}
          <Line
            dataKey="emi"
            name="EMI"
            stroke="#9ca3af"
            strokeWidth={1.5}
            strokeDasharray="5 5"
            dot={false}
            activeDot={{ r: 3 }}
          />

          {/* EOL line — solid blue */}
          <Line
            dataKey="eol"
            name="EOL"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 3 }}
          />

          {/* Demand line — solid dark */}
          <Line
            dataKey="demand"
            name="Demand"
            stroke="#1f2937"
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 4 }}
          />

          {/* EMX line — solid green */}
          <Line
            dataKey="emx"
            name="EMX"
            stroke="#16a34a"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 3 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
