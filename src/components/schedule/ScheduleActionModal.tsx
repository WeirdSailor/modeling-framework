'use client'

import { useEffect, useState } from 'react'
import type { ServiceType } from '@/models/types'
import ScheduleActionSelect, { type ScheduleActionChoice } from './ScheduleActionSelect'

interface Props {
  unitCount: number
  onAction: (action: ScheduleActionChoice, service?: ServiceType) => string | null
  onClose: () => void
}

export default function ScheduleActionModal({ unitCount, onAction, onClose }: Props) {
  const [action, setAction] = useState<ScheduleActionChoice | ''>('')
  const [error, setError] = useState<string | null>(null)
  const [service, setService] = useState<ServiceType | ''>('')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}
    >
      <form
        role="dialog" aria-modal="true" aria-labelledby="schedule-action-title"
        onClick={e => e.stopPropagation()}
        onSubmit={e => {
          e.preventDefault()
          if (action && (action !== 'allocateToService' || service)) setError(onAction(action, service || undefined))
        }}
        style={{
          background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-pop)', padding: '20px 22px 16px', width: 380,
          display: 'flex', flexDirection: 'column', gap: 12,
        }}
      >
        <p id="schedule-action-title" style={{ margin: 0, fontSize: 13.5, color: 'var(--text)', fontWeight: 600 }}>
          Action for {unitCount} unit{unitCount === 1 ? '' : 's'}
        </p>
        <ScheduleActionSelect value={action} onChange={value => { setAction(value); setError(null) }} />
        {action === 'allocateToService' && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text-muted)' }}>
            Service
            <select className="reason-select" value={service} onChange={e => { setService(e.target.value as ServiceType); setError(null) }}>
              <option value="" disabled>Select a service</option>
              <option value="SR">SR</option>
              <option value="QR">QR</option>
            </select>
          </label>
        )}
        {error && <p role="alert" style={{ margin: 0, fontSize: 12, color: '#ef4444' }}>{error}</p>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={!action || unitCount === 0 || (action === 'allocateToService' && !service)}>Action</button>
        </div>
      </form>
    </div>
  )
}
