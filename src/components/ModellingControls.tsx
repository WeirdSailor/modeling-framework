'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { useModellingStore } from '@/store/useModellingStore'
import type { ModellingAction } from '@/models/types'
import { getAllSpLabels } from '@/utils/settlements'

export default function ModellingControls() {
  const selectedUnits = useModellingStore(state => state.selectedUnits)
  const units = useModellingStore(state => state.units)
  const addModellingAction = useModellingStore(state => state.addModellingAction)
  const clearAllModelling = useModellingStore(state => state.clearAllModelling)

  const [fromPeriod, setFromPeriod] = useState(1)
  const [toPeriod, setToPeriod] = useState(48)
  const [outputLevel, setOutputLevel] = useState(100)
  const [reasonCode, setReasonCode] = useState<ModellingAction['reasonCode']>('MARGIN')
  const [error, setError] = useState<string | null>(null)

  const spOptions = useMemo(() => getAllSpLabels(), [])

  const defaultOutputLevel = useMemo(() => {
    const sels = Array.from(selectedUnits)
      .map(id => units.find(u => u.bmUnitId === id)?.sel)
      .filter((v): v is number => v !== undefined)
    return sels.length > 0 ? Math.min(...sels) : 100
  }, [selectedUnits, units])

  const prevSelectionSizeRef = useRef(0)

  useEffect(() => {
    const currentSize = selectedUnits.size
    if (prevSelectionSizeRef.current === 0 && currentSize > 0) {
      setOutputLevel(defaultOutputLevel)
    }
    prevSelectionSizeRef.current = currentSize
  }, [selectedUnits.size, defaultOutputLevel])

  function handleApply() {
    if (fromPeriod > toPeriod) {
      setError('From SP must be ≤ To SP')
      return
    }
    setError(null)
    for (const bmUnitId of selectedUnits) {
      const action: ModellingAction = {
        bmUnitId,
        fromPeriod,
        toPeriod,
        outputLevel: Number(outputLevel),
        reasonCode,
        timestamp: new Date(),
      }
      addModellingAction(action)
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 px-6 py-3 bg-gray-50 border-y border-gray-200">
        {/* From SP */}
        <div className="flex flex-col">
          <span className="text-xs text-gray-500 mb-0.5">From SP</span>
          <select
            value={fromPeriod}
            onChange={e => { setFromPeriod(Number(e.target.value)); setError(null) }}
            className="bg-white border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {spOptions.map(({ sp, label }) => (
              <option key={sp} value={sp}>
                SP {sp} — {label}
              </option>
            ))}
          </select>
        </div>

        {/* To SP */}
        <div className="flex flex-col">
          <span className="text-xs text-gray-500 mb-0.5">To SP</span>
          <select
            value={toPeriod}
            onChange={e => { setToPeriod(Number(e.target.value)); setError(null) }}
            className="bg-white border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {spOptions.map(({ sp, label }) => (
              <option key={sp} value={sp}>
                SP {sp} — {label}
              </option>
            ))}
          </select>
        </div>

        {/* Output Level */}
        <div className="flex flex-col">
          <span className="text-xs text-gray-500 mb-0.5">Output Level (MW)</span>
          <input
            type="number"
            value={outputLevel}
            min={0}
            step={1}
            onChange={e => setOutputLevel(Number(e.target.value))}
            className="bg-white border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Reason Code */}
        <div className="flex flex-col">
          <span className="text-xs text-gray-500 mb-0.5">Reason Code</span>
          <select
            value={reasonCode}
            onChange={e => setReasonCode(e.target.value as ModellingAction['reasonCode'])}
            className="bg-white border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="MARGIN">MARGIN</option>
            <option value="INERTIA">INERTIA</option>
            <option value="VOLTAGE">VOLTAGE</option>
            <option value="CONSTRAINT">CONSTRAINT</option>
            <option value="RESERVE">RESERVE</option>
          </select>
        </div>

        {/* Model Selected Units button */}
        <div className="flex flex-col">
          <span className="text-xs text-gray-500 mb-0.5">&nbsp;</span>
          <div className="flex items-center gap-2">
            <button
              onClick={handleApply}
              disabled={selectedUnits.size === 0}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-1.5 rounded transition-colors"
            >
              Model Selected Units
            </button>
            <span className="text-xs text-gray-400">({selectedUnits.size} units)</span>
          </div>
        </div>

        {/* Clear All Modelling button */}
        <div className="flex flex-col">
          <span className="text-xs text-gray-500 mb-0.5">&nbsp;</span>
          <button
            onClick={clearAllModelling}
            className="bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-4 py-1.5 rounded transition-colors"
          >
            Clear All Modelling
          </button>
        </div>
      </div>

      {error && (
        <div className="px-6">
          <span className="text-xs text-red-500 mt-1">{error}</span>
        </div>
      )}
    </div>
  )
}
