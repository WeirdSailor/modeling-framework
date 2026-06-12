'use client'

import { useRef } from 'react'
import { usePopoverDismiss } from '@/components/GspFilterPopover'

export const TIMEFRAME_OPTIONS = [
  { label: 'Next 30 min',  spCount: 1 },
  { label: 'Next 1 hour',  spCount: 2 },
  { label: 'Next 1.5 hours', spCount: 3 },
  { label: 'Next 2 hours', spCount: 4 },
]

export interface AsServicesFilter { sr: boolean; qr: boolean }

export function AsServicesPopover({ filter, onChange, onClose, wrapperRef }: {
  filter: AsServicesFilter
  onChange: (f: AsServicesFilter) => void
  onClose: () => void
  wrapperRef: React.RefObject<HTMLDivElement | null>
}) {
  const ref = useRef<HTMLDivElement>(null)
  usePopoverDismiss(ref, wrapperRef, onClose)

  return (
    <div ref={ref} style={{
      position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 50,
      background: 'var(--bg-panel)', border: '1px solid var(--border-strong)',
      borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.35)', width: 220, overflow: 'hidden',
    }}>
      <div style={{ padding: '7px 12px', borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-faint)' }}>
          Treat as contracted
        </span>
      </div>
      {(['sr', 'qr'] as const).map(key => (
        <label key={key} style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '7px 12px', fontSize: 12.5, color: 'var(--text)', cursor: 'pointer',
        }}>
          <input
            type="checkbox"
            checked={filter[key]}
            onChange={e => onChange({ ...filter, [key]: e.target.checked })}
          />
          {key.toUpperCase()} units
        </label>
      ))}
    </div>
  )
}
