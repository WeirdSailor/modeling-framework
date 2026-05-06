'use client'

import { useModellingStore } from '@/store/useModellingStore'

interface HeaderProps {
  onRefresh: () => void
}

function formatWindowTime(isoString: string): string {
  // "2026-05-05T14:30:00.000Z" → "05 May 14:30"
  const d = new Date(isoString)
  const day = String(d.getUTCDate()).padStart(2, '0')
  const month = d.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' })
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  return `${day} ${month} ${hh}:${mm}`
}

export function Header({ onRefresh }: HeaderProps) {
  const settlementPeriods = useModellingStore(state => state.settlementPeriods)
  const isLoading = useModellingStore(state => state.isLoading)

  const windowStart = settlementPeriods[0]?.startTime
  const windowEnd = settlementPeriods[settlementPeriods.length - 1]?.startTime

  return (
    <header className="flex items-center justify-between px-6 py-3 bg-gray-900 text-white shadow-md">
      <h1 className="text-xl font-semibold tracking-tight">
        Modelling Framework — Margin Analysis
      </h1>

      <div className="flex items-center gap-4">
        {windowStart && windowEnd && !isLoading && (
          <span className="text-sm text-gray-300">
            {formatWindowTime(windowStart)}
            <span className="mx-2 text-gray-500">→</span>
            {formatWindowTime(windowEnd)}
            <span className="ml-1 text-gray-500 text-xs">(UTC)</span>
          </span>
        )}

        <button
          onClick={onRefresh}
          aria-label="Refresh data"
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-3 py-1 rounded transition-colors"
        >
          Refresh
        </button>
      </div>
    </header>
  )
}
