'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useModellingStore } from '@/store/useModellingStore'
import type { ModellingAction, OperationType, UserId } from '@/models/types'
import { fetchAllData } from '@/services/elexon'
import { isUnitPnCommitted } from '@/utils/margin'
import { EXCLUDED_FUEL_TYPES, PULLBACK_FUEL_TYPES } from '@/utils/fuelTypes'
import { MarginChart } from '@/components/MarginChart'
import DraftSidebar from '@/components/DraftSidebar'
import DraftDetails from '@/components/DraftDetails'
import AvailableTable from '@/components/AvailableTable'
import SelectedTable from '@/components/SelectedTable'
import ConfigPanel, { type TweakState } from '@/components/ConfigPanel'
import ConfirmModal from '@/components/ConfirmModal'
import CommittedTab from '@/components/CommittedTab'

type Tab = 'workspace' | 'chart' | 'committed'

interface ConfirmState {
  message: string
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void
}

let toastTimer: ReturnType<typeof setTimeout> | undefined

export default function Home() {
  // ── tweaks ──
  const [tweaks, setTweaksState] = useState<TweakState>({
    theme: 'dark',
    layout: 'three-col',
    showSidebar: true,
    selectionPattern: 'buttons',
  })
  const setTweak = useCallback(<K extends keyof TweakState>(key: K, value: TweakState[K]) => {
    setTweaksState(prev => ({ ...prev, [key]: value }))
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', tweaks.theme)
  }, [tweaks.theme])

  const [activeTab, setActiveTab] = useState<Tab>('workspace')
  const [showConfig, setShowConfig] = useState(false)
  const [showArchive, setShowArchive] = useState(true)
  const [toast, setToast] = useState<string | null>(null)
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null)
  const [voltageArea, setVoltageArea] = useState('')
  const [scenario, setScenario] = useState('none')

  // ── store ──
  const units             = useModellingStore(s => s.units)
  const settlementPeriods = useModellingStore(s => s.settlementPeriods)
  const drafts            = useModellingStore(s => s.drafts)
  const activeDraftId     = useModellingStore(s => s.activeDraftId)
  const isLoading         = useModellingStore(s => s.isLoading)
  const error             = useModellingStore(s => s.error)
  const setLoading        = useModellingStore(s => s.setLoading)
  const setError          = useModellingStore(s => s.setError)
  const setUnits          = useModellingStore(s => s.setUnits)
  const setSPs            = useModellingStore(s => s.setSettlementPeriods)
  const clearAllDrafts    = useModellingStore(s => s.clearAllDrafts)
  const createDraft       = useModellingStore(s => s.createDraft)
  const setActiveDraft    = useModellingStore(s => s.setActiveDraft)
  const addUnitsToDraft   = useModellingStore(s => s.addUnitsToDraft)
  const removeUnitFromDraft = useModellingStore(s => s.removeUnitFromDraft)
  const renameDraft       = useModellingStore(s => s.renameDraft)
  const updateDraftWindow = useModellingStore(s => s.updateDraftWindow)
  const updateUnitNotes   = useModellingStore(s => s.updateUnitNotes)
  const updateUnitReason        = useModellingStore(s => s.updateUnitReason)
  const updateUnitOperationType = useModellingStore(s => s.updateUnitOperationType)
  const currentUser       = useModellingStore(s => s.currentUser)
  const setCurrentUser    = useModellingStore(s => s.setCurrentUser)
  const duplicateDraft    = useModellingStore(s => s.duplicateDraft)
  const shareDraft        = useModellingStore(s => s.shareDraft)
  const unshareDraft      = useModellingStore(s => s.unshareDraft)
  const commitDraft       = useModellingStore(s => s.commitDraft)
  const discardDraft      = useModellingStore(s => s.discardDraft)
  const reopenDraft       = useModellingStore(s => s.reopenDraft)
  const deleteDraft       = useModellingStore(s => s.deleteDraft)

  // ── data fetch ──
  const loadData = useCallback(async () => {
    clearAllDrafts()
    setLoading(true)
    setError(null)
    try {
      const { units, settlementPeriods } = await fetchAllData()
      setUnits(units)
      setSPs(settlementPeriods)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [setLoading, setError, setUnits, setSPs, clearAllDrafts])

  useEffect(() => { loadData() }, [loadData])

  // ── auto-select first draft ──
  useEffect(() => {
    if (!activeDraftId && drafts.length > 0) {
      const myDrafts = drafts.filter(d => d.ownerId === currentUser)
      const first = myDrafts.find(d => d.status === 'draft') ?? myDrafts[0] ?? drafts[0]
      setActiveDraft(first.id)
    }
  }, [drafts, activeDraftId, setActiveDraft, currentUser])

  // ── toast ──
  const flashToast = useCallback((msg: string) => {
    setToast(msg)
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => setToast(null), 1800)
  }, [])

  // ── derived data ──
  const activeDraft = drafts.find(d => d.id === activeDraftId) ?? null

  const committedUnitIds = useMemo(() => new Set(
    drafts.filter(d => d.status === 'committed').flatMap(d => d.actions.map(a => a.bmUnitId))
  ), [drafts])

  const pnCommittedUnitIds = useMemo(() => new Set(
    units
      .filter(u => settlementPeriods.some(sp => isUnitPnCommitted(u.bmUnitId, sp)))
      .map(u => u.bmUnitId)
  ), [units, settlementPeriods])

  const availableUnits = useMemo(() =>
    units.filter(u =>
      !EXCLUDED_FUEL_TYPES.has(u.fuelType) &&
      u.registeredCapacity > 0 &&
      !committedUnitIds.has(u.bmUnitId) &&
      !pnCommittedUnitIds.has(u.bmUnitId)
    )
  , [units, committedUnitIds, pnCommittedUnitIds])

  // Wind units for Pullback — not filtered by pnCommittedUnitIds since generating
  // wind is exactly what we want to curtail
  const pullbackUnits = useMemo(() =>
    units.filter(u =>
      PULLBACK_FUEL_TYPES.has(u.fuelType) &&
      u.registeredCapacity > 0 &&
      !committedUnitIds.has(u.bmUnitId)
    )
  , [units, committedUnitIds])

  const unitsForAvailableTable = scenario === 'pullback' ? pullbackUnits : availableUnits

  const unitPnByBmUnit = useMemo<Record<string, number>>(() => {
    const out: Record<string, number> = {}
    for (const u of units) {
      let max = 0
      for (const sp of settlementPeriods) {
        const pn = sp.pn[u.bmUnitId] ?? 0
        if (pn > max) max = pn
      }
      // Fall back to SEL for cold units with no PN data in the window
      out[u.bmUnitId] = max > 0 ? max : (u.sel ?? 0)
    }
    return out
  }, [units, settlementPeriods])

  const unitById = useMemo(() => new Map(units.map(u => [u.bmUnitId, u])), [units])

  const activeDraftCost = useMemo(() => {
    if (!activeDraft) return 0
    const seen = new Set<string>()
    let total = 0
    for (const a of activeDraft.actions) {
      if (seen.has(a.bmUnitId)) continue
      seen.add(a.bmUnitId)
      const u = unitById.get(a.bmUnitId)
      const mel = u?.registeredCapacity ?? 0
      const pn = unitPnByBmUnit[a.bmUnitId] ?? 0
      total += Math.max(0, mel - pn) * 120
    }
    return total
  }, [activeDraft, unitById, unitPnByBmUnit])

  const activeDraftUnitIds = useMemo(
    () => new Set(activeDraft?.actions.map(a => a.bmUnitId) ?? []),
    [activeDraft]
  )

  const otherDraftUnitMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const d of drafts) {
      if (d.id === activeDraftId || d.status !== 'draft') continue
      for (const a of d.actions) {
        if (!map.has(a.bmUnitId)) map.set(a.bmUnitId, d.name)
      }
    }
    return map
  }, [drafts, activeDraftId])

  // ── handlers ──
  function handleCreateDraft() {
    createDraft()
    flashToast('New draft created')
  }

  function handleDuplicate() {
    if (!activeDraftId) return
    duplicateDraft(activeDraftId)
    flashToast('Draft duplicated')
  }

  function handleCommit() {
    if (!activeDraftId || !activeDraft) return
    setConfirmState({
      message: `Commit "${activeDraft.name}"?`,
      confirmLabel: 'Commit',
      onConfirm: () => {
        commitDraft(activeDraftId)
        flashToast('Draft committed')
        setConfirmState(null)
      },
    })
  }

  function handleDiscard() {
    if (!activeDraftId || !activeDraft) return
    setConfirmState({
      message: `Discard "${activeDraft.name}"?`,
      confirmLabel: 'Discard',
      onConfirm: () => {
        discardDraft(activeDraftId)
        flashToast('Draft discarded')
        setConfirmState(null)
      },
    })
  }

  function handleReopen() {
    if (!activeDraftId || !activeDraft) return
    const wasCommitted = activeDraft.status === 'committed'
    reopenDraft(activeDraftId)
    flashToast(wasCommitted ? 'Draft uncommitted' : 'Draft restored')
  }

  function handleDelete() {
    if (!activeDraftId || !activeDraft) return
    setConfirmState({
      message: `Permanently delete "${activeDraft.name}"?`,
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: () => {
        deleteDraft(activeDraftId)
        flashToast('Draft deleted')
        setConfirmState(null)
      },
    })
  }

  const SCENARIO_REASON: Record<string, ModellingAction['reasonCode']> = {
    margin:   'MARGIN',
    inertia:  'INERTIA',
    voltage:  'VOLTAGE',
    reserve:  'RESERVE',
    response: 'RESERVE',
    pullback: 'CONSTRAINT',
  }

  function handleAddUnits(ids: string[]) {
    if (!activeDraftId) return
    const reasonCode = SCENARIO_REASON[scenario] ?? 'MARGIN'
    addUnitsToDraft(activeDraftId, ids, reasonCode)
    flashToast(ids.length === 1 ? `Added ${ids[0]}` : `Added ${ids.length} units`)
  }

  function handleRemoveUnit(bmUnitId: string) {
    if (!activeDraftId) return
    removeUnitFromDraft(activeDraftId, bmUnitId)
    flashToast(`Removed ${bmUnitId}`)
  }

  function handleRemoveCommittedUnits(removals: { draftId: string; bmUnitId: string }[]) {
    for (const { draftId, bmUnitId } of removals) {
      removeUnitFromDraft(draftId, bmUnitId)
    }
    flashToast(
      removals.length === 1
        ? `Removed ${removals[0].bmUnitId} from committed draft`
        : `Removed ${removals.length} units from committed drafts`
    )
  }

  const isOwner = activeDraft?.ownerId === currentUser
  const readOnly = !activeDraft || activeDraft.status !== 'draft' || !isOwner

  const appClass = [
    'app',
    'layout-' + tweaks.layout,
    tweaks.showSidebar ? 'with-sidebar' : 'no-sidebar',
  ].join(' ')

  return (
    <div className={appClass}>
      {tweaks.showSidebar && (
        <DraftSidebar
          drafts={drafts}
          activeId={activeDraftId}
          currentUser={currentUser}
          onSelectUser={setCurrentUser}
          onSelect={setActiveDraft}
          onCreate={handleCreateDraft}
          showArchive={showArchive}
          setShowArchive={setShowArchive}
          settlementPeriods={settlementPeriods}
          isLoading={isLoading}
          onRefresh={loadData}
        />
      )}

      <main className="workspace">
        {/* Tab bar */}
        <div className="tab-bar">
          <button
            className={`tab-btn${activeTab === 'workspace' ? ' active' : ''}`}
            onClick={() => setActiveTab('workspace')}
          >
            Workspace
          </button>
          <button
            className={`tab-btn${activeTab === 'chart' ? ' active' : ''}`}
            onClick={() => setActiveTab('chart')}
          >
            Chart
          </button>
          <button
            className={`tab-btn${activeTab === 'committed' ? ' active' : ''}`}
            onClick={() => setActiveTab('committed')}
          >
            Committed
          </button>
          <div className="tab-spacer" />
          {!tweaks.showSidebar && (
            <button
              className="tab-btn"
              style={{ fontSize: 11 }}
              onClick={loadData}
              disabled={isLoading}
            >
              {isLoading ? 'Loading…' : 'Refresh'}
            </button>
          )}
          <button
            className="tweaks-trigger"
            onClick={() => setShowConfig(v => !v)}
            style={{ margin: '0 0 0 8px' }}
          >
            ⚙ Config
          </button>
        </div>

        {/* Workspace tab */}
        {activeTab === 'workspace' && (
          <div className="workspace-content">
            {drafts.length === 0 ? (
              <div className="workspace-empty">
                <h2>No drafts yet</h2>
                <p>Create a draft to start modelling units.</p>
                <button className="btn btn-primary" onClick={handleCreateDraft}>
                  <span className="plus">+</span> New draft
                </button>
              </div>
            ) : activeDraft ? (
              <>
                <DraftDetails
                  draft={activeDraft}
                  settlementPeriods={settlementPeriods}
                  cost={activeDraftCost}
                  currentUser={currentUser}
                  onChangeName={name => renameDraft(activeDraftId!, name)}
                  onChangeFrom={from => updateDraftWindow(activeDraftId!, from, activeDraft.toPeriod)}
                  onChangeTo={to => updateDraftWindow(activeDraftId!, activeDraft.fromPeriod, to)}
                  onCommit={handleCommit}
                  onDiscard={handleDiscard}
                  onReopen={handleReopen}
                  onDelete={handleDelete}
                  onDuplicate={handleDuplicate}
                  onShare={userId => shareDraft(activeDraftId!, userId)}
                  onUnshare={userId => unshareDraft(activeDraftId!, userId)}
                />
                <div className={`workspace-grid grid-${tweaks.layout}`}>
                  <AvailableTable
                    units={unitsForAvailableTable}
                    unitPnByBmUnit={unitPnByBmUnit}
                    activeDraftUnitIds={activeDraftUnitIds}
                    otherDraftUnitMap={otherDraftUnitMap}
                    selectionPattern={tweaks.selectionPattern}
                    readOnly={readOnly}
                    voltageArea={voltageArea}
                    scenario={scenario}
                    onScenarioChange={setScenario}
                    onAddUnits={handleAddUnits}
                  />
                  <SelectedTable
                    draft={activeDraft}
                    unitById={unitById}
                    unitPnByBmUnit={unitPnByBmUnit}
                    readOnly={readOnly}
                    scenario={scenario}
                    onRemoveUnit={handleRemoveUnit}
                    onUpdateNotes={(bmUnitId, notes) =>
                      updateUnitNotes(activeDraftId!, bmUnitId, notes)
                    }
                    onUpdateReason={(bmUnitId, reasonCode) =>
                      updateUnitReason(activeDraftId!, bmUnitId, reasonCode)
                    }
                    onUpdateOperationType={(bmUnitId, operationType) =>
                      updateUnitOperationType(activeDraftId!, bmUnitId, operationType)
                    }
                  />
                </div>
              </>
            ) : null}
          </div>
        )}

        {/* Chart tab */}
        {activeTab === 'chart' && (
          <div className="chart-tab">
            {error && (
              <div className="error-banner">Error: {error}</div>
            )}
            {isLoading && (
              <div className="loading-banner">Loading data…</div>
            )}
            <MarginChart />
          </div>
        )}

        {/* Committed tab */}
        {activeTab === 'committed' && (
          <CommittedTab
            drafts={drafts}
            unitById={unitById}
            unitPnByBmUnit={unitPnByBmUnit}
            onRemoveUnits={handleRemoveCommittedUnits}
          />
        )}

      </main>

      {showConfig && (
        <ConfigPanel
          tweaks={tweaks}
          onChangeTweak={setTweak}
          voltageArea={voltageArea}
          onVoltageAreaChange={setVoltageArea}
          onClose={() => setShowConfig(false)}
        />
      )}

      {confirmState && (
        <ConfirmModal
          message={confirmState.message}
          confirmLabel={confirmState.confirmLabel}
          danger={confirmState.danger}
          onConfirm={confirmState.onConfirm}
          onCancel={() => setConfirmState(null)}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
