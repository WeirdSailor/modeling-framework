'use client'

// Schedule tab (spec §8.1): window + Battery-style availability filters, the configured candidate picker, and the
// working plan summary. Reads store data directly, like MarginChart.

import { useMemo, useState } from 'react'
import { useModellingStore } from '@/store/useModellingStore'
import type { ActionType, AreaRequirementRow, ModellingAction, WorkingPlanAction } from '@/models/types'
import type { TweakState } from '@/components/ConfigPanel'
import { UnitAvailabilityFilters, UnitAvailabilityCards } from '@/components/UnitAvailabilityFilters'
import { classifyCandidates, candidateCards, matchesCandidateCard, type ScheduleFilters } from '@/utils/candidateFilters'
import { actionTypeOf } from '@/utils/actionEffects'
import { buildCandidateRows } from './candidates'
import { candidateGroupAction, matchesCandidateGroup, type CandidateGroup } from './candidateGroups'
import type { PickerProps } from './pickerTypes'
import { fmtMw, slotLabel } from './scheduleUi'
import PickerTypeFirst from './PickerTypeFirst'
import PickerUnitsFirst from './PickerUnitsFirst'
import PickerTabs from './PickerTabs'
import WorkingPlanSummary from './WorkingPlanSummary'
import CommitPlanModal from './CommitPlanModal'
import ScheduleActionModal from './ScheduleActionModal'
import { SCHEDULE_ACTION_CHOICES } from './ScheduleActionSelect'

const EMPTY_PLAN: WorkingPlanAction[] = []
const EMPTY_REQS: AreaRequirementRow[] = []

interface Props {
  picker: TweakState['schedulePicker']
  scenario: string
  filters: ScheduleFilters
  onFiltersChange: (filters: ScheduleFilters) => void
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
  picker, scenario, filters, onFiltersChange, voltageArea, reservePct, reasonCode,
  solveMw, showOnCharts, onToggleShowOnCharts, onWindowEdited, onAdded, onCommitted,
}: Props) {
  const currentUser       = useModellingStore(s => s.currentUser)
  const units             = useModellingStore(s => s.units)
  const settlementPeriods = useModellingStore(s => s.settlementPeriods)
  const unitServices      = useModellingStore(s => s.unitServices)
  const drafts            = useModellingStore(s => s.drafts)
  const areaRequirements  = useModellingStore(s => s.areaRequirements)
  const plan              = useModellingStore(s => s.workingPlans[s.currentUser]) ?? EMPTY_PLAN
  const planWindow        = useModellingStore(s => s.workingPlanWindow)
  const setPlanWindow     = useModellingStore(s => s.setWorkingPlanWindow)
  const addToWorkingPlan  = useModellingStore(s => s.addToWorkingPlan)
  const updateAction      = useModellingStore(s => s.updateWorkingPlanAction)
  const removeAction      = useModellingStore(s => s.removeFromWorkingPlan)
  const clearPlan         = useModellingStore(s => s.clearWorkingPlan)
  const commitWorkingPlan = useModellingStore(s => s.commitWorkingPlan)

  const [actionByUser, setActionByUser] = useState<Record<string, ActionType>>({})
  const activeAction = actionByUser[currentUser] ?? 'start'
  const [candidateGroupByUser, setCandidateGroupByUser] = useState<Record<string, CandidateGroup>>({})
  const candidateGroup = candidateGroupByUser[currentUser] ?? 'syncs'
  const includeAllFuelTypes = picker === 'typeFirst' && ['all', 'inertia', 'pullback'].includes(candidateGroup)
  const [committing, setCommitting] = useState(false)

  const promotedActions = useMemo(
    () => drafts.filter(d => d.status === 'promoted').flatMap(d => d.actions),
    [drafts],
  )
  const promotedUnitIds = useMemo(() => new Set(promotedActions.map(a => a.bmUnitId)), [promotedActions])
  const firstSp = settlementPeriods.find(sp => sp.settlementPeriod === planWindow.fromPeriod)
  const candidates = useMemo(
    () => buildCandidateRows({ units, sp: firstSp, settlementPeriods, planWindow, promotedUnitIds, scenario, voltageArea, includeAllFuelTypes }),
    [units, firstSp, settlementPeriods, planWindow, promotedUnitIds, scenario, voltageArea, includeAllFuelTypes],
  )
  const availableTypes = useMemo(() => [...new Set(candidates.map(row => row.fuelType))].sort(), [candidates])
  const classified = useMemo(
    () => classifyCandidates(candidates, filters, unitServices),
    [candidates, filters, unitServices],
  )
  const scopedRows = picker === 'typeFirst' ? classified.filter(row => matchesCandidateGroup(row, candidateGroup))
    : picker === 'tabs' ? classified.filter(row => row.qualifies.includes(activeAction)) : classified
  const cards = candidateCards(scopedRows)
  const rows = (picker === 'typeFirst' ? scopedRows : classified).filter(row => matchesCandidateCard(row, filters.selectedCard))
  function updateFilter<K extends keyof ScheduleFilters>(key: K, value: ScheduleFilters[K]) {
    onFiltersChange({ ...filters, [key]: value })
  }
  const inPlan = useMemo(() => new Map(plan.map(a => [a.bmUnitId, actionTypeOf(a)])), [plan])

  if (settlementPeriods.length === 0) {
    return <div style={{ padding: 24, color: 'var(--text-muted)' }}>Loading system data…</div>
  }

  const timeLabel = slotLabel(planWindow.fromPeriod, settlementPeriods)

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
    activeAction,
    onActionChange: type => setActionByUser(prev => ({ ...prev, [currentUser]: type })),
    inPlan,
    timeLabel,
    onAdd: items => {
      const visibleById = new Map(rows.map(row => [row.bmUnitId, row]))
      const valid = items.filter(item => {
        const row = visibleById.get(item.bmUnitId)
        return row?.category === 'usable' && row.qualifies.includes(item.actionType) && !inPlan.has(item.bmUnitId)
          && (picker !== 'typeFirst' || (matchesCandidateGroup(row, candidateGroup) && candidateGroupAction(row, candidateGroup) === item.actionType))
      })
      const n = addToWorkingPlan(valid, reasonCode)
      if (n > 0) onAdded(n)
    },
  }

  return (
    <div className="schedule-tab">
      {solveMw !== null && (
        <div className="schedule-bar">
          <span className="schedule-shortfall">{fmtMw(solveMw)} MW shortfall</span>
        </div>
      )}

      <section className="schedule-section schedule-candidates">
        <UnitAvailabilityFilters
          availableTypes={availableTypes}
          typeFilter={filters.typeFilter} onTypeFilterChange={value => updateFilter('typeFilter', value)}
          gspFilter={filters.gspFilter} onGspFilterChange={value => updateFilter('gspFilter', value)}
          asFilter={filters.asFilter} onAsFilterChange={value => updateFilter('asFilter', value)}
          deRatePct={filters.deRatePct} onDeRatePctChange={value => updateFilter('deRatePct', value)}
          priceThreshold={filters.priceThreshold} onPriceThresholdChange={value => updateFilter('priceThreshold', value)}
          trailingControls={
            <>
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
            </>
          }
        />
        <UnitAvailabilityCards
          cardData={cards} selectedCard={filters.selectedCard}
          onSelectCard={card => updateFilter('selectedCard', card ?? 'usable')}
          trailingControls={
            <label className="schedule-hint" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              <input type="checkbox" checked={showOnCharts} onChange={onToggleShowOnCharts} /> Show on charts
            </label>
          }
        />
        {picker === 'typeFirst' && <PickerTypeFirst key={currentUser} {...pickerProps}
          candidateGroup={candidateGroup}
          onCandidateGroupChange={group => setCandidateGroupByUser(prev => ({ ...prev, [currentUser]: group }))}
        />}
        {picker === 'unitsFirst' && <PickerUnitsFirst key={currentUser} {...pickerProps} />}
        {picker === 'tabs' && <PickerTabs key={currentUser} {...pickerProps} />}
      </section>

      <section className="schedule-section schedule-working-plan">
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
          onCommit={() => setCommitting(true)}
        />
      </section>

      {committing && picker === 'typeFirst' && (
        <ScheduleActionModal
          unitCount={plan.length}
          onClose={() => setCommitting(false)}
          onAction={(choice, service) => {
            const selected = SCHEDULE_ACTION_CHOICES.find(item => item.id === choice)!
            const name = service && selected.actionType === 'allocate' ? `${selected.label} · ${service}` : selected.label
            let id: string | null
            try {
              id = commitWorkingPlan(name, '', filters, selected.actionType, service)
            } catch (error) {
              return error instanceof Error ? error.message : 'Could not promote the selected units.'
            }
            if (!id) return 'Select units before running an action.'
            setCommitting(false)
            onCommitted(name)
            return null
          }}
        />
      )}
      {committing && picker !== 'typeFirst' && (
        <CommitPlanModal
          actionCount={plan.length}
          onCancel={() => setCommitting(false)}
          onCommit={(name, description) => {
            commitWorkingPlan(name, description, filters)
            setCommitting(false)
            onCommitted(name)
          }}
        />
      )}
    </div>
  )
}
