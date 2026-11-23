'use client'

// Picker A: choose a candidate group independently of the automatically assigned action.

import { Fragment, useState } from 'react'
import CandidateTable from './CandidateTable'
import type { FilteredCandidateRow } from '@/utils/candidateFilters'
import { filteredReason, setManyIn, toggleIn, type PickerProps } from './pickerTypes'
import { CANDIDATE_GROUPS, candidateGroupAction, type CandidateGroup } from './candidateGroups'

interface Props extends Pick<PickerProps, 'rows' | 'inPlan' | 'onAdd' | 'timeLabel'> {
  candidateGroup: CandidateGroup
  onCandidateGroupChange: (group: CandidateGroup) => void
}

export default function PickerTypeFirst({ rows, inPlan, onAdd, timeLabel, candidateGroup, onCandidateGroupChange }: Props) {
  const [ticked, setTicked] = useState<Set<string>>(new Set())

  const list = rows
  const groupLabel = CANDIDATE_GROUPS.find(group => group.id === candidateGroup)!.label
  const blockedReason = (r: FilteredCandidateRow) => {
    const excluded = filteredReason(r)
    if (excluded) return excluded
    if (inPlan.has(r.bmUnitId)) return 'Already in working plan'
    return candidateGroupAction(r, candidateGroup) === null ? 'No applicable automatic action' : null
  }

  const validIds = new Set(list.filter(r => blockedReason(r) === null).map(r => r.bmUnitId))
  const addable = [...ticked].filter(id => validIds.has(id))

  function add() {
    const byId = new Map(list.map(row => [row.bmUnitId, row]))
    onAdd(addable.flatMap(bmUnitId => {
      const row = byId.get(bmUnitId)
      const actionType = row && candidateGroupAction(row, candidateGroup)
      return actionType ? [{ bmUnitId, actionType }] : []
    }))
    setTicked(new Set())
  }

  return (
    <>
      <div className="schedule-section-head">
        <label className="settle-select">
          <span className="settle-label">Candidate Units</span>
          <select value={candidateGroup} onChange={e => { onCandidateGroupChange(e.target.value as CandidateGroup); setTicked(new Set()) }}>
            {CANDIDATE_GROUPS.map(group => (
              <Fragment key={group.id}>
                {group.id === 'inertia' && <option value="candidate-group-separator" disabled aria-hidden="true">────────────────────</option>}
                <option value={group.id}>{group.label}</option>
              </Fragment>
            ))}
          </select>
        </label>
        <span className="schedule-hint">{list.length} units qualify at {timeLabel}</span>
        <span className="schedule-spacer" />
        <button className="btn btn-primary" disabled={addable.length === 0} onClick={add}>
          Select
        </button>
      </div>
      <CandidateTable
        rows={list}
        showState
        ticked={ticked}
        inPlan={inPlan}
        onToggle={id => setTicked(t => toggleIn(t, id))}
        onSetTicked={(ids, on) => setTicked(t => setManyIn(t, ids, on))}
        blockedReason={blockedReason}
        emptyText={`No candidate units for ${groupLabel} at ${timeLabel}`}
      />
    </>
  )
}
