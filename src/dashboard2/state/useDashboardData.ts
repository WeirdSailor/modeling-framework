'use client'

import { useEffect, useState } from 'react'
import { POLL_INTERVAL_MS } from '../dashboard.config'
import type { DashboardData, DashboardDataProvider } from '../types'

export interface DashboardDataState {
  data: DashboardData | null // last good payload — kept while a fetch is in flight or after an error
  lastFetchFailed: boolean
}

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
        if (!cancelled && mine === seq) setState({ data, lastFetchFailed: false })
      } catch (err) {
        console.warn('[dashboard2] fetch failed', err)
        if (!cancelled && mine === seq) setState(prev => ({ ...prev, lastFetchFailed: true }))
      }
    }

    void run()
    const id = setInterval(run, POLL_INTERVAL_MS)
    return () => { cancelled = true; clearInterval(id) }
  }, [provider, startMs, endMs, refreshKey])

  return state
}
