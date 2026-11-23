'use client'

export const SCHEDULE_ACTION_CHOICES = [
  { id: 'sync', label: 'Sync', actionType: 'start' },
  { id: 'deloadToSel', label: 'Deload to SEL', actionType: 'deload' },
  { id: 'deloadToZero', label: 'Deload to 0', actionType: 'deloadZero' },
  { id: 'desync', label: 'Desync', actionType: 'desync' },
  { id: 'modelCapacity', label: 'Model Capacity', actionType: 'capacity' },
  { id: 'flagUnusable', label: 'Flag Unusable', actionType: 'unusable' },
  { id: 'allocateToService', label: 'Allocate to Service', actionType: 'allocate' },
] as const

export type ScheduleActionChoice = typeof SCHEDULE_ACTION_CHOICES[number]['id']

interface Props {
  value: ScheduleActionChoice | ''
  onChange: (value: ScheduleActionChoice) => void
}

export default function ScheduleActionSelect({ value, onChange }: Props) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text-muted)' }}>
      Action
      <select
        className="reason-select"
        style={{ border: '1px solid var(--border)', background: 'var(--bg)', padding: '6px 8px' }}
        value={value}
        onChange={e => onChange(e.target.value as ScheduleActionChoice)}
        autoFocus
      >
        <option value="" disabled>Select an action</option>
        {SCHEDULE_ACTION_CHOICES.map(choice => <option key={choice.id} value={choice.id}>{choice.label}</option>)}
      </select>
    </label>
  )
}
