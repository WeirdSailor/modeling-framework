'use client'

// Right side of the top bar (spec §7): status dot + label, forecast run, updated time + relative age.

import { useEffect, useState } from 'react'
import { POLL_INTERVAL_MS, STALE_MULTIPLIER } from '../dashboard.config'
import { formatHHMM, formatHHMMSS } from '../time'
import styles from '../dashboard2.module.css'

interface Props {
  isCustom: boolean
  forecastRunAt: string | null
  updatedAt: string | null
  lastFetchFailed: boolean
}

function ago(seconds: number): string {
  return seconds < 60 ? `${seconds}s ago` : `${Math.floor(seconds / 60)}m ago`
}

export default function DataStatus({ isCustom, forecastRunAt, updatedAt, lastFetchFailed }: Props) {
  // Re-render every second for the relative "(Ns ago)" part only.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const updatedMs = updatedAt ? Date.parse(updatedAt) : null
  const stale = lastFetchFailed || (updatedMs !== null && now - updatedMs > STALE_MULTIPLIER * POLL_INTERVAL_MS)

  const dotClass = isCustom ? styles.dotCustom : stale ? styles.dotStale : ''
  const label = isCustom ? 'Custom range' : stale ? 'Stale' : 'Live'

  return (
    <div className={styles.status} role="status" aria-live="polite">
      <div className={`${styles.dot} ${dotClass}`} aria-hidden="true" />
      <span><b>{label}</b></span>
      <div className={styles.sep} />
      <span>Forecast run <b>{forecastRunAt ? formatHHMM(Date.parse(forecastRunAt)) : '—'}</b></span>
      <div className={styles.sep} />
      <span>
        Updated <b>{updatedMs !== null ? formatHHMMSS(updatedMs) : '—'}</b>
        {updatedMs !== null && ` (${ago(Math.max(0, Math.floor((now - updatedMs) / 1000)))})`}
      </span>
    </div>
  )
}
