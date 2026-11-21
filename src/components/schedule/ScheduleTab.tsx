'use client'

// Schedule tab (spec §8.1): window + filters, the configured candidate picker, and the
// working plan summary. Reads store data directly, like MarginChart.

import { useMemo, useRef, useState } from 'react'
import { useModellingStore } from '@/store/useModellingStore'
import type { AreaRequirementRow, ModellingAction, WorkingPlanAction } from '@/models/types'
import type { TweakState } from '@/components/ConfigPanel'
import { ScenarioPopover } from '@/components/DraftDetails'
import { GspFilterPopover } from '@/components/GspFilterPopover'
import { SCENARIOS } from '@/config/scenarios'
import { actionTypeOf } from '@/utils/actionEffects'
import { buildCandidateRows } from './candidates'
import type { PickerProps } from './pickerTypes'
import { fmtMw, slotLabel } from './scheduleUi'
import PickerTypeFirst from './PickerTypeFirst'
import PickerUnitsFirst from './PickerUnitsFirst'
import PickerTabs from './PickerTabs'
import WorkingPlanSummary from './WorkingPlanSummary'
import CommitPlanModal from './CommitPlanModal'

const EMPTY_PLAN: WorkingPlanAction[] = []
const EMPTY_REQS: AreaRequirementRow[] = []

interface Props {
  picker: TweakState['schedulePicker']
  scenario: string
  onScenarioChange: (s: string) => void
  gspFilter: Record<string, 'include' | 'exclude'>
  onGspFilterChange: (f: Record<string, 'include' | 'exclude'>) => void
  voltageArea: string
  reservePct: number
  reasonCode: ModellingAction['reasonCode']
  solveMw: number | null
  showOnCharts: boolean
  onToggleShowOnCharts: () => void
  onWindowEdited: () => void
  onAdded: (count: number) => void
  onCommitted: (name: string) => void
}

export default function ScheduleTab({
  picker, scenario, onScenarioChange, gspFilter, onGspFilterChange, voltageArea, reservePct, reasonCode,
  solveMw, showOnCharts, onToggleShowOnCharts, onWindowEdited, onAdded, onCommitted,
}: Props) {
  const units             = useModellingStore(s => s.units)
  const settlementPeriods = useModellingStore(s => s.settlementPeriods)
  const drafts            = useModellingStore(s => s.drafts)
  const areaRequirements  = useModellingStore(s => s.areaRequirements)
  const plan              = useModellingStore(s => s.workingPlans[s.currentUser]) ?? EMPTY_PLAN
  const planWindow        = useModellingStore(s => s.workingPlanWindow)
  const setPlanWindow     = useModellingStore(s => s.setWorkingPlanWindow)
  const addToWorkingPlan  = useModellingStore(s => s.addToWorkingPlan)
  const updateAction      = useModellingStore(s => s.updateWorkingPlanAction)
  const removeAction      = useModellingStore(s => s.removeFromWorkingPlan)
  const clearPlan         = useModellingStore(s => s.clearWorkingPlan)
  const applyWindowToAll  = useModellingStore(s => s.applyWindowToAll)
  const commitWorkingPlan = useModellingStore(s => s.commitWorkingPlan)

  const [scenarioOpen, setScenarioOpen] = useState(false)
  const [gspOpen, setGspOpen] = useState(false)
  const [committing, setCommitting] = useState(false)
  const scenarioWrapRef = useRef<HTMLDivElement>(null)
  const gspWrapRef = useRef<HTMLDivElement>(null)

  const promotedActions = useMemo(
    () => drafts.filter(d => d.status === 'promoted').flatMap(d => d.actions),
    [drafts],
  )
  const promotedUnitIds = useMemo(() => new Set(promotedActions.map(a => a.bmUnitId)), [promotedActions])
  const firstSp = settlementPeriods.find(sp => sp.settlementPeriod === planWindow.fromPeriod)
  const rows = useMemo(
    () => buildCandidateRows({ units, sp: firstSp, promotedUnitIds, gspFilter, scenario, voltageArea }),
    [units, firstSp, promotedUnitIds, gspFilter, scenario, voltageArea],
  )
  const inPlan = useMemo(() => new Map(plan.map(a => [a.bmUnitId, actionTypeOf(a)])), [plan])

  if (settlementPeriods.length === 0) {
    return <div style={{ padding: 24, color: 'var(--text-muted)' }}>Loading system data…</div>
  }

  const timeLabel = slotLabel(planWindow.fromPeriod, settlementPeriods)
  const scenarioName = SCENARIOS.find(s => s.id === scenario)?.name ?? 'None'
  const gspIncludes = Object.values(gspFilter).filter(v => v === 'include').length
  const gspExcludes = Object.values(gspFilter).filter(v => v === 'exclude').length

  function changeFrom(v: number) {
    setPlanWindow(v, Math.max(v, planWindow.toPeriod))
    onWindowEdited()
  }
  function changeTo(v: number) {
    setPlanWindow(Math.min(v, planWindow.fromPeriod), v)
    onWindowEdited()
  }

  const pickerProps: PickerProps = {
    rows,
    inPlan,
    timeLabel,
    onAdd: items => {
      const n = addToWorkingPlan(items, reasonCode)
      if (n > 0) onAdded(n)
    },
  }

  return (
    <div className="schedule-tab">
      <div className="schedule-bar">
        <label className="settle-select">
          <span className="settle-label">From</span>
          <select value={planWindow.fromPeriod} onChange={e => changeFrom(Number(e.target.value))}>
            {settlementPeriods.map(sp => (
              <option key={sp.settlementPeriod} value={sp.settlementPeriod}>{slotLabel(sp.settlementPeriod, settlementPeriods)}</option>
            ))}
          </select>
        </label>
        <span className="time-arrow">→</span>
        <label className="settle-select">
          <span className="settle-label">To</span>
          <select value={planWindow.toPeriod} onChange={e => changeTo(Number(e.target.value))}>
            {settlementPeriods.map(sp => (
              <option key={sp.settlementPeriod} value={sp.settlementPeriod}>{slotLabel(sp.settlementPeriod, settlementPeriods)}</option>
            ))}
          </select>
        </label>
        {solveMw !== null && <span className="schedule-shortfall">{fmtMw(solveMw)} MW shortfall</span>}

        <div ref={scenarioWrapRef} style={{ position: 'relative' }}>
          <button className="btn btn-ghost" onClick={() => setScenarioOpen(o => !o)}>Scenario ▾ {scenarioName}</button>
          {scenarioOpen && (
            <ScenarioPopover scenario={scenario} onChange={onScenarioChange} onClose={() => setScenarioOpen(false)} wrapperRef={scenarioWrapRef} />
          )}
        </div>
        <div ref={gspWrapRef} style={{ position: 'relative' }}>
          <button className="btn btn-ghost" onClick={() => setGspOpen(o => !o)}>
            GSP ▾{gspIncludes > 0 ? ` +${gspIncludes}` : ''}{gspExcludes > 0 ? ` −${gspExcludes}` : ''}
          </button>
          {gspOpen && (
            <GspFilterPopover gspFilter={gspFilter} onChange={onGspFilterChange} onClose={() => setGspOpen(false)} wrapperRef={gspWrapRef} />
          )}
        </div>

        <span className="schedule-spacer" />
        <label className="schedule-hint" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
          <input type="checkbox" checked={showOnCharts} onChange={onToggleShowOnCharts} /> Show on charts
        </label>
      </div>

      <section className="schedule-section">
        {picker === 'typeFirst' && <PickerTypeFirst {...pickerProps} />}
        {picker === 'unitsFirst' && <PickerUnitsFirst {...pickerProps} />}
        {picker === 'tabs' && <PickerTabs {...pickerProps} />}
      </section>

      <section className="schedule-section">
        <WorkingPlanSummary
          plan={plan}
          settlementPeriods={settlementPeriods}
          units={units}
          promotedActions={promotedActions}
          planWindow={planWindow}
          reservePct={reservePct}
          generalReserveRequirements={areaRequirements['general_reserve'] ?? EMPTY_REQS}
          onUpdate={updateAction}
          onRemove={removeAction}
          onClear={clearPlan}
          onApplyWindowToAll={applyWindowToAll}
          onCommit={() => setCommitting(true)}
        />
      </section>

      {committing && (
        <CommitPlanModal
          actionCount={plan.length}
          onCancel={() => setCommitting(false)}
          onCommit={(name, description) => {
            commitWorkingPlan(name, description)
            setCommitting(false)
            onCommitted(name)
          }}
        />
      )}
    </div>
  )
}
