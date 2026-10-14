'use client'

import { HORIZONS } from '../dashboard.config'
import type { HorizonId } from '../types'
import styles from '../dashboard2.module.css'

interface Props {
  active: HorizonId | 'custom'
  onSelect: (h: HorizonId) => void
  onCustom: () => void
}

function CalendarIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <rect x="1.5" y="2.5" width="11" height="10" rx="1.5" />
      <line x1="1.5" y1="5.5" x2="12.5" y2="5.5" />
      <line x1="4.5" y1="1" x2="4.5" y2="4" />
      <line x1="9.5" y1="1" x2="9.5" y2="4" />
    </svg>
  )
}

export default function HorizonSelector({ active, onSelect, onCustom }: Props) {
  return (
    <div className={styles.seg} role="group" aria-label="Horizon">
      {HORIZONS.map(h => (
        <button
          key={h.id}
          type="button"
          className={`${styles.segBtn} ${active === h.id ? styles.segOn : ''}`}
          aria-pressed={active === h.id}
          onClick={() => onSelect(h.id)}
        >
          {h.id}
        </button>
      ))}
      <button
        type="button"
        className={`${styles.segBtn} ${active === 'custom' ? styles.segOn : ''}`}
        aria-pressed={active === 'custom'}
        aria-haspopup="dialog"
        onClick={onCustom}
      >
        <CalendarIcon />Custom
      </button>
    </div>
  )
}
