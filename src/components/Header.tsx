'use client'

import { useModellingStore } from '@/store/useModellingStore'

interface HeaderProps {
  onRefresh: () => void
}

export function Header({ onRefresh }: HeaderProps) {
  const selectedDate = useModellingStore(state => state.selectedDate)
  const setSelectedDate = useModellingStore(state => state.setSelectedDate)

  return (
    <header className="flex items-center justify-between px-6 py-3 bg-gray-900 text-white shadow-md">
      <h1 className="text-xl font-semibold tracking-tight">
        Modelling Framework — Margin Analysis
      </h1>

      <div className="flex items-center gap-3">
        <label htmlFor="settlement-date" className="text-sm text-gray-300">
          Settlement date
        </label>
        <input
          id="settlement-date"
          type="date"
          value={selectedDate}
          onChange={(e) => {
            setSelectedDate(e.target.value)
            onRefresh()
          }}
          className="bg-gray-700 text-white rounded px-2 py-1 text-sm border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

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
