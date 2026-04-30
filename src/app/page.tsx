'use client'

import { useCallback, useEffect } from 'react'
import { useModellingStore } from '@/store/useModellingStore'
import { fetchAllData } from '@/services/elexon'
import { Header } from '@/components/Header'
import { MarginChart } from '@/components/MarginChart'
import ModellingControls from '@/components/ModellingControls'
import UnitGrid from '@/components/UnitGrid'

export default function Home() {
  const selectedDate = useModellingStore(state => state.selectedDate)
  const isLoading = useModellingStore(state => state.isLoading)
  const error = useModellingStore(state => state.error)
  const setLoading = useModellingStore(state => state.setLoading)
  const setError = useModellingStore(state => state.setError)
  const setUnits = useModellingStore(state => state.setUnits)
  const setSettlementPeriods = useModellingStore(state => state.setSettlementPeriods)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { units, settlementPeriods } = await fetchAllData(selectedDate)
      setUnits(units)
      setSettlementPeriods(settlementPeriods)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [selectedDate, setLoading, setError, setUnits, setSettlementPeriods])

  useEffect(() => {
    loadData()
  }, [loadData])

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      <Header onRefresh={loadData} />

      {error && (
        <div className="mx-6 mt-3 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">
          Error: {error}
        </div>
      )}

      {isLoading && (
        <div className="mx-6 mt-3 p-3 bg-blue-50 border border-blue-200 text-blue-700 rounded text-sm">
          Loading data…
        </div>
      )}

      {/* Chart section — top ~40% */}
      <div className="px-6 pt-4 pb-2">
        <MarginChart />
      </div>

      {/* Modelling controls — between chart and grid */}
      <ModellingControls />

      {/* Unit grid — remaining space; flex-col so UnitGrid's flex-1 fills it */}
      <div className="flex-1 min-h-0 px-6 pb-4 flex flex-col">
        <UnitGrid />
      </div>
    </div>
  )
}
