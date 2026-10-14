'use client'

// Custom range picker (spec §9.3): From/To in Europe/London local time, snapped to SPs on Apply.

import { useEffect, useRef, useState } from 'react'
import { CUSTOM_MAX_MS, CUSTOM_MIN_MS } from '../dashboard.config'
import { fromLondonInputValue, toLondonInputValue, validateCustomRange } from '../time'
import styles from '../dashboard2.module.css'

interface Props {
  initialStartMs: number
  initialEndMs: number
  onApply: (fromMs: number, toMs: number) => void
  onCancel: () => void
}

export default function CustomRangePopover({ initialStartMs, initialEndMs, onApply, onCancel }: Props) {
  const [from, setFrom] = useState(() => toLondonInputValue(initialStartMs))
  const [to, setTo] = useState(() => toLondonInputValue(initialEndMs))
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onCancel()
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.stopPropagation(); onCancel() }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [onCancel])

  function apply() {
    const f = fromLondonInputValue(from)
    const t = fromLondonInputValue(to)
    const err = validateCustomRange(f, t, CUSTOM_MIN_MS, CUSTOM_MAX_MS)
    if (err) { setError(err); return }
    onApply(f, t)
  }

  return (
    <div ref={ref} className={styles.popover} role="dialog" aria-label="Custom range" style={{ left: 24 }}>
      <label className={styles.field}>
        From
        <input type="datetime-local" step={1800} className={styles.input} value={from}
          onChange={e => { setFrom(e.target.value); setError(null) }} autoFocus />
      </label>
      <label className={styles.field}>
        To
        <input type="datetime-local" step={1800} className={styles.input} value={to}
          onChange={e => { setTo(e.target.value); setError(null) }}
          onKeyDown={e => { if (e.key === 'Enter') apply() }} />
      </label>
      {error && <div className={styles.error} role="alert">{error}</div>}
      <div className={styles.actions}>
        <button type="button" className={styles.btn} onClick={onCancel}>Cancel</button>
        <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={apply}>Apply</button>
      </div>
    </div>
  )
}
