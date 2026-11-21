'use client'

// Picker B (spec §8.2): pick from every unit, then choose the action; units the action
// doesn't apply to are skipped with a notice.

import { useRef, useState } from 'react'
import { ACTION_TYPES, ACTION_TYPE_LABELS, type ActionType } from '@/models/types'
import { usePopoverDismiss } from '@/components/GspFilterPopover'
import CandidateTable from './CandidateTable'
import type { CandidateRow } from './candidates'
import { setManyIn, toggleIn, type PickerProps } from './pickerTypes'

function ActionMenu({ tickedRows, onChoose, onClose, wrapperRef }: {
  tickedRows: CandidateRow[]
  onChoose: (type: ActionType) => void
  onClose: () => void
  wrapperRef: React.RefObject<HTMLDivElement | null>
}) {
  const ref = useRef<HTMLDivElement>(null)
  usePopoverDismiss(ref, wrapperRef, onClose)
  return (
    <div ref={ref} className="schedule-menu" role="menu" style={{ left: 'auto', right: 0 }}>
      {ACTION_TYPES.map(t => {
        const n = tickedRows.filter(r => r.qualifies.includes(t)).length
        return (
          <button key={t} role="menuitem" disabled={n === 0} onClick={() => onChoose(t)}>
            {ACTION_TYPE_LABELS[t]} ({n} of {tickedRows.length})
          </button>
        )
      })}
    </div>
  )
}

export default function PickerUnitsFirst({ rows, inPlan, onAdd, timeLabel }: PickerProps) {
  const [ticked, setTicked] = useState<Set<string>>(new Set())
  const [menuOpen, setMenuOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  const tickedRows = rows.filter(r => ticked.has(r.bmUnitId))
  const blockedReason = (r: CandidateRow) => {
    const planned = inPlan.get(r.bmUnitId)
    return planned ? `in plan as ${ACTION_TYPE_LABELS[planned]}` : null
  }

  function choose(type: ActionType) {
    const applies = tickedRows.filter(r => r.qualifies.includes(type))
    const skipped = tickedRows.filter(r => !r.qualifies.includes(type))
    onAdd(applies.map(r => ({ bmUnitId: r.bmUnitId, actionType: type })))
    setNotice(skipped.length > 0
      ? `${ACTION_TYPE_LABELS[type]}: skipped ${skipped.map(r => r.nationalGridBmUnit).join(', ')} (doesn't apply)`
      : null)
    setTicked(new Set())
    setMenuOpen(false)
  }

  return (
    <>
      <div className="schedule-section-head">
        <span className="schedule-hint">{rows.length} units at {timeLabel} · {ticked.size} selected</span>
        <span className="schedule-spacer" />
        <div ref={wrapperRef} style={{ position: 'relative' }}>
          <button className="btn btn-primary" disabled={ticked.size === 0} onClick={() => setMenuOpen(o => !o)}>
            Action ▾
          </button>
          {menuOpen && (
            <ActionMenu tickedRows={tickedRows} onChoose={choose} onClose={() => setMenuOpen(false)} wrapperRef={wrapperRef} />
          )}
        </div>
      </div>
      {notice && <div className="schedule-notice">⚠ {notice}</div>}
      <CandidateTable
        rows={rows}
        showState
        ticked={ticked}
        onToggle={id => setTicked(t => toggleIn(t, id))}
        onSetTicked={(ids, on) => setTicked(t => setManyIn(t, ids, on))}
        blockedReason={blockedReason}
        emptyText={`No units qualify for any action at ${timeLabel}`}
      />
    </>
  )
}
