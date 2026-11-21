'use client'

// Picker A (spec §8.2): choose the action type first; the list shows only its candidates.

import { useState } from 'react'
import { ACTION_TYPES, ACTION_TYPE_LABELS, type ActionType } from '@/models/types'
import CandidateTable from './CandidateTable'
import type { CandidateRow } from './candidates'
import { setManyIn, toggleIn, type PickerProps } from './pickerTypes'

export default function PickerTypeFirst({ rows, inPlan, onAdd, timeLabel }: PickerProps) {
  const [type, setType] = useState<ActionType>('start')
  const [ticked, setTicked] = useState<Set<string>>(new Set())

  const list = rows.filter(r => r.qualifies.includes(type))
  const blockedReason = (r: CandidateRow) => {
    const planned = inPlan.get(r.bmUnitId)
    return planned ? `in plan as ${ACTION_TYPE_LABELS[planned]}` : null
  }

  function add() {
    onAdd([...ticked].map(bmUnitId => ({ bmUnitId, actionType: type })))
    setTicked(new Set())
  }

  return (
    <>
      <div className="schedule-section-head">
        <label className="settle-select">
          <span className="settle-label">Action</span>
          <select value={type} onChange={e => { setType(e.target.value as ActionType); setTicked(new Set()) }}>
            {ACTION_TYPES.map(t => <option key={t} value={t}>{ACTION_TYPE_LABELS[t]}</option>)}
          </select>
        </label>
        <span className="schedule-hint">{list.length} units qualify at {timeLabel}</span>
        <span className="schedule-spacer" />
        <button className="btn btn-primary" disabled={ticked.size === 0} onClick={add}>
          Add {ticked.size} as {ACTION_TYPE_LABELS[type]} ↓
        </button>
      </div>
      <CandidateTable
        rows={list}
        changeType={type}
        ticked={ticked}
        onToggle={id => setTicked(t => toggleIn(t, id))}
        onSetTicked={(ids, on) => setTicked(t => setManyIn(t, ids, on))}
        blockedReason={blockedReason}
        emptyText={`No units qualify for ${ACTION_TYPE_LABELS[type]} at ${timeLabel}`}
      />
    </>
  )
}
