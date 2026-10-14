'use client'

import { useEffect, useState } from 'react'
import { POLL_INTERVAL_MS } from '../dashboard.config'
import { applyFetchResult, type DataState } from '../derive'
import type { DashboardDataProvider } from '../types'

export type DashboardDataState = DataState

/**
 * Polls the provider every POLL_INTERVAL_MS and immediately whenever the window or refreshKey
 * changes. Responses from superseded requests are ignored.
 */
export function useDashboardData(
  provider: DashboardDataProvider,
  startMs: number,
  endMs: number,
  refreshKey: unknown,
): DashboardDataState {
  const [state, setState] = useState<DashboardDataState>({ data: null, lastFetchFailed: false })

  useEffect(() => {
    let cancelled = false
    let seq = 0
    const win = { start: new Date(startMs).toISOString(), end: new Date(endMs).toISOString() }

    const run = async () => {
      const mine = ++seq
      try {
        const data = await provider.fetch(win)
        if (!cancelled && mine === seq) setState(prev => applyFetchResult(prev, { ok: true, data }))
      } catch (err) {
        console.warn('[dashboard2] fetch failed', err)
        if (!cancelled && mine === seq) setState(prev => applyFetchResult(prev, { ok: false }))
      }
    }

    void run()
    const id = setInterval(run, POLL_INTERVAL_MS)
    return () => { cancelled = true; clearInterval(id) }
  }, [provider, startMs, endMs, refreshKey])

  return state
}
