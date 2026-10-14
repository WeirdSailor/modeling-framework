'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  DEFAULT_HORIZON, HORIZONS, HORIZON_STORAGE_KEY, NOW_TICK_MS,
} from '../dashboard.config'
import { SP_MS, floorToSp, presetWindow, snapCustomRange } from '../time'
import type { HorizonId } from '../types'

export type WindowMode =
  | { type: 'preset'; horizon: HorizonId }
  | { type: 'custom'; startMs: number; endMs: number; returnTo: HorizonId }

function readStoredHorizon(): HorizonId {
  try {
    const v = window.localStorage.getItem(HORIZON_STORAGE_KEY)
    if (v && HORIZONS.some(h => h.id === v)) return v as HorizonId
  } catch { /* storage unavailable */ }
  return DEFAULT_HORIZON
}

function storeHorizon(h: HorizonId) {
  try { window.localStorage.setItem(HORIZON_STORAGE_KEY, h) } catch { /* storage unavailable */ }
}

/** Horizon / custom window state plus a Now ticker that also fires exactly at each SP boundary. */
export function useTimeWindow() {
  const [mode, setMode] = useState<WindowMode>(() => ({ type: 'preset', horizon: readStoredHorizon() }))
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    const untilBoundary = floorToSp(nowMs) + SP_MS - nowMs + 50
    const id = setTimeout(() => setNowMs(Date.now()), Math.min(NOW_TICK_MS, untilBoundary))
    return () => clearTimeout(id)
  }, [nowMs])

  // Only changes when the SP changes (preset) or the custom range changes — keeps refetches rare.
  const currentSp = floorToSp(nowMs)
  const win = useMemo(() => {
    if (mode.type === 'custom') return { startMs: mode.startMs, endMs: mode.endMs }
    const hours = HORIZONS.find(h => h.id === mode.horizon)!.hours
    const w = presetWindow(currentSp, hours)
    return { startMs: w.start, endMs: w.end }
  }, [mode, currentSp])

  const selectPreset = useCallback((horizon: HorizonId) => {
    storeHorizon(horizon)
    setMode({ type: 'preset', horizon })
  }, [])

  const applyCustom = useCallback((fromMs: number, toMs: number) => {
    const { start, end } = snapCustomRange(fromMs, toMs)
    setMode(prev => ({
      type: 'custom', startMs: start, endMs: end,
      returnTo: prev.type === 'preset' ? prev.horizon : prev.returnTo,
    }))
  }, [])

  const backToLive = useCallback(() => {
    setMode(prev => (prev.type === 'custom' ? { type: 'preset', horizon: prev.returnTo } : prev))
  }, [])

  return { mode, window: win, nowMs, selectPreset, applyCustom, backToLive }
}
