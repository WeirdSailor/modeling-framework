'use client'

// Picker C (spec §8.2): one tab per action type; ticks from every tab collect in one basket.

import { useState } from 'react'
import { ACTION_TYPES, ACTION_TYPE_LABELS, type ActionType } from '@/models/types'
import CandidateTable from './CandidateTable'
import type { CandidateRow } from './candidates'
import type { PickerProps } from './pickerTypes'

export default function PickerTabs({ rows, inPlan, onAdd, timeLabel }: PickerProps) {
  const [tab, setTab] = useState<ActionType>('start')
  const [basket, setBasket] = useState<Map<string, ActionType>>(new Map())

  const list = rows.filter(r => r.qualifies.includes(tab))
  const ticked = new Set([...basket].filter(([, t]) => t === tab).map(([id]) => id))

  const blockedReason = (r: CandidateRow) => {
    const planned = inPlan.get(r.bmUnitId)
    if (planned) return `in plan as ${ACTION_TYPE_LABELS[planned]}`
    const inBasket = basket.get(r.bmUnitId)
    if (inBasket && inBasket !== tab) return `in basket as ${ACTION_TYPE_LABELS[inBasket]}`
    return null
  }

  function toggle(id: string) {
    setBasket(prev => {
      const next = new Map(prev)
      if (next.get(id) === tab) next.delete(id)
      else next.set(id, tab)
      return next
    })
  }

  function setMany(ids: string[], on: boolean) {
    setBasket(prev => {
      const next = new Map(prev)
      for (const id of ids) {
        if (on) next.set(id, tab)
        else if (next.get(id) === tab) next.delete(id)
      }
      return next
    })
  }

  function addBasket() {
    const byId = new Map(rows.map(r => [r.bmUnitId, r]))
    onAdd([...basket].filter(([id, t]) => byId.get(id)?.qualifies.includes(t)).map(([bmUnitId, actionType]) => ({ bmUnitId, actionType })))
    setBasket(new Map())
  }

  const basketCounts = ACTION_TYPES
    .map(t => ({ t, n: [...basket.values()].filter(v => v === t).length }))
    .filter(x => x.n > 0)

  return (
    <>
      <div className="schedule-section-head">
        <div className="tab-bar" style={{ border: 'none', padding: 0 }}>
          {ACTION_TYPES.map(t => (
            <button key={t} className={`tab-btn${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
              {ACTION_TYPE_LABELS[t]} ({rows.filter(r => r.qualifies.includes(t)).length})
            </button>
          ))}
        </div>
        <span className="schedule-spacer" />
        <span className="schedule-hint">
          Basket: {basketCounts.length === 0 ? 'empty' : basketCounts.map(x => `${x.n} ${ACTION_TYPE_LABELS[x.t]}`).join(' · ')}
        </span>
        <button className="btn btn-primary" disabled={basket.size === 0} onClick={addBasket}>
          Add basket to plan ({basket.size}) ↓
        </button>
      </div>
      <CandidateTable
        rows={list}
        changeType={tab}
        ticked={ticked}
        onToggle={toggle}
        onSetTicked={setMany}
        blockedReason={blockedReason}
        emptyText={`No units qualify for ${ACTION_TYPE_LABELS[tab]} at ${timeLabel}`}
      />
    </>
  )
}
