'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useModellingStore } from '@/store/useModellingStore'
import type { ModellingAction, OperationType, UserId } from '@/models/types'
import { fetchAllData, fetchHistoricalData } from '@/services/elexon'
import { loadAreaRequirements, saveAreaRequirements } from '@/services/requirementsSync'
import { dateToSp, dateToSettlementDate } from '@/utils/settlements'
import { isUnitPnCommitted } from '@/utils/margin'
import { EXCLUDED_FUEL_TYPES, PULLBACK_FUEL_TYPES } from '@/utils/fuelTypes'
import { MarginChart } from '@/components/MarginChart'
import DraftSidebar from '@/components/DraftSidebar'
import DraftDetails from '@/components/DraftDetails'
import AvailableTable from '@/components/AvailableTable'
import SelectedTable from '@/components/SelectedTable'
import ConfigPanel, { type TweakState } from '@/components/ConfigPanel'
import ConfirmModal from '@/components/ConfirmModal'
import FeedbackModal from '@/components/FeedbackModal'
import CommittedTab from '@/components/CommittedTab'
import RedeclareTab from '@/components/RedeclareTab'
import GraphTab from '@/components/GraphTab'
import RequirementsTab from '@/components/RequirementsTab'
import Dashboard from '@/components/Dashboard'
import AreaChart from '@/components/AreaChart'
import type { AreaId } from '@/config/areas'
import { AREAS, getArea } from '@/config/areas'
import { computeAreaStatus } from '@/utils/areaAggregates'

type Tab = 'dashboard' | 'workspace' | 'chart' | 'committed' | 'redeclare' | 'graph' | 'requirements'

interface ConfirmState {
  message: string
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void
}

let toastTimer: ReturnType<typeof setTimeout> | undefined

const STATUS_DOT_COLOR: Record<string, string> = {
  shortfall: '#ef4444',
  tight:     '#f59e0b',
  ok:        '#22c55e',
}

export default function Home() {
  // ── tweaks ──
  const [tweaks, setTweaksState] = useState<TweakState>({
    theme: 'dark',
    layout: 'three-col',
    showSidebar: true,
    selectionPattern: 'buttons',
    reservePct: 10,
    chartInteractionMode: 'twoClick',
  })
  const setTweak = useCallback(<K extends keyof TweakState>(key: K, value: TweakState[K]) => {
    setTweaksState(prev => ({ ...prev, [key]: value }))
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', tweaks.theme)
  }, [tweaks.theme])

  const [activeTab, setActiveTab] = useState<Tab>('dashboard')
  const [activeAreaTab, setActiveAreaTab] = useState<AreaId>('margin')
  const [hiddenDraftIds, setHiddenDraftIds] = useState<Set<string>>(new Set())
  const toggleDraftChartVisibility = useCallback((id: string) => {
    setHiddenDraftIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }, [])
  const [showConfig, setShowConfig] = useState(false)
  const [showFeedback, setShowFeedback] = useState(false)
  const [showArchive, setShowArchive] = useState(true)
  const [toast, setToast] = useState<string | null>(null)
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null)
  const [voltageArea, setVoltageArea] = useState('')
  const [scenario, setScenario] = useState('none')
  const [gspFilter, setGspFilter] = useState<Record<string, 'include' | 'exclude'>>({})
  const [solveTarget, setSolveTarget] = useState<{
    fromSp: number
    toSp: number
    worstDeficitMw: number
    adjustedMw: number
  } | null>(null)
  const [clearSelectionKey, setClearSelectionKey] = useState(0)
  const [solvePanelVisible, setSolvePanelVisible] = useState(false)
  const [dataMode, setDataMode] = useState<'real' | 'historical'>('real')
  const [historicalDate, setHistoricalDate] = useState<string>(
    () => dateToSettlementDate(new Date(Date.now() - 24 * 60 * 60 * 1000))
  )
  const [historicalStartSp, setHistoricalStartSp] = useState<number>(
    () => dateToSp(new Date())
  )

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
  const renameDraft             = useModellingStore(s => s.renameDraft)
  const updateDraftDescription  = useModellingStore(s => s.updateDraftDescription)
  const updateDraftWindow = useModellingStore(s => s.updateDraftWindow)
  const updateUnitNotes   = useModellingStore(s => s.updateUnitNotes)
  const updateUnitReason        = useModellingStore(s => s.updateUnitReason)
  const updateUnitOperationType = useModellingStore(s => s.updateUnitOperationType)
  const updateUnitWindow        = useModellingStore(s => s.updateUnitWindow)
  const currentUser       = useModellingStore(s => s.currentUser)
  const setCurrentUser    = useModellingStore(s => s.setCurrentUser)
  const duplicateDraft    = useModellingStore(s => s.duplicateDraft)
  const shareDraft        = useModellingStore(s => s.shareDraft)
  const unshareDraft      = useModellingStore(s => s.unshareDraft)
  const commitDraft       = useModellingStore(s => s.commitDraft)
  const discardDraft      = useModellingStore(s => s.discardDraft)
  const reopenDraft       = useModellingStore(s => s.reopenDraft)
  const deleteDraft       = useModellingStore(s => s.deleteDraft)
  const dataOverrides     = useModellingStore(s => s.dataOverrides)
  const setDataOverride   = useModellingStore(s => s.setDataOverride)
  const clearDataOverride = useModellingStore(s => s.clearDataOverride)
  const clearAllDataOverrides = useModellingStore(s => s.clearAllDataOverrides)
  const unitServices      = useModellingStore(s => s.unitServices)
  const setUnitService    = useModellingStore(s => s.setUnitService)
  const areaRequirements       = useModellingStore(s => s.areaRequirements)
  const setAllAreaRequirements = useModellingStore(s => s.setAllAreaRequirements)
  const areaThresholds         = useModellingStore(s => s.areaThresholds)
  const setAllAreaThresholds   = useModellingStore(s => s.setAllAreaThresholds)

  // ── requirements sync ──
  const requirementsReady = useRef(false)

  useEffect(() => {
    loadAreaRequirements().then(result => {
      if (result) {
        setAllAreaRequirements(result.requirements)
        setAllAreaThresholds(result.thresholds)
      }
      requirementsReady.current = true
    })
  }, [setAllAreaRequirements, setAllAreaThresholds])

  useEffect(() => {
    if (!requirementsReady.current) return
    const timer = setTimeout(() => { void saveAreaRequirements(areaRequirements, areaThresholds) }, 500)
    return () => clearTimeout(timer)
  }, [areaRequirements, areaThresholds])

  // ── data fetch ──
  const loadData = useCallback(async () => {
    clearAllDrafts()
    setLoading(true)
    setError(null)
    try {
      const { units, settlementPeriods } = await fetchAllData()
      setUnits(units)
      setSPs(settlementPeriods)
      setSolveTarget(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [setLoading, setError, setUnits, setSPs, clearAllDrafts])

  const loadHistoricalData = useCallback(async (date: string, startSp: number) => {
    const doLoad = async () => {
      clearAllDrafts()
      setLoading(true)
      setError(null)
      try {
        const { units, settlementPeriods } = await fetchHistoricalData(date, startSp)
        setUnits(units)
        setSPs(settlementPeriods)
        setSolveTarget(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load historical data')
      } finally {
        setLoading(false)
      }
    }

    if (drafts.length > 0) {
      setConfirmState({
        message: 'Loading new data will delete all current drafts. Continue?',
        confirmLabel: 'Load data',
        danger: true,
        onConfirm: () => {
          setConfirmState(null)
          void doLoad()
        },
      })
    } else {
      await doLoad()
    }
  }, [clearAllDrafts, setLoading, setError, setUnits, setSPs, drafts, setConfirmState])

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

  const handleSolveSelect = useCallback((fromSp: number, toSp: number, worstDeficitMw: number) => {
    setSolveTarget({ fromSp, toSp, worstDeficitMw, adjustedMw: Math.abs(worstDeficitMw) })
    setSolvePanelVisible(true)
  }, [])

  const handleAreaSolveSelect = useCallback((fromSp: number, toSp: number, worstDeficitMw: number) => {
    setSolveTarget({ fromSp, toSp, worstDeficitMw, adjustedMw: Math.abs(worstDeficitMw) })
    setSolvePanelVisible(true)
  }, [])

  const handleSolveMwChange = useCallback((mw: number) => {
    setSolveTarget(t => t ? { ...t, adjustedMw: Math.max(1, mw) } : t)
  }, [])

  const handleSolveNavigate = useCallback(() => {
    if (!solveTarget) return
    const draftId = createDraft()
    updateDraftWindow(draftId, solveTarget.fromSp, solveTarget.toSp)
    setSolvePanelVisible(false)
    setClearSelectionKey(k => k + 1)
    setScenario(getArea(activeAreaTab).defaultScenario)
    setActiveTab('workspace')
  }, [solveTarget, createDraft, updateDraftWindow, setScenario, activeAreaTab])

  const handleDashboardTileClick = useCallback((area: AreaId) => {
    setActiveAreaTab(area)
    setActiveTab('chart')
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

  const activeDraftUnitIds = useMemo(
    () => new Set(activeDraft?.actions.map(a => a.bmUnitId) ?? []),
    [activeDraft]
  )

  const otherDraftUnitMap = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const d of drafts) {
      if (d.id === activeDraftId || d.status !== 'draft') continue
      for (const a of d.actions) {
        const names = map.get(a.bmUnitId)
        if (names) names.push(d.name)
        else map.set(a.bmUnitId, [d.name])
      }
    }
    return map
  }, [drafts, activeDraftId])

  // ── helpers ──
  function fmtSlot(sp: number | undefined): string {
    if (!sp) return '—'
    const found = settlementPeriods.find(s => s.settlementPeriod === sp)
    return found ? found.startTime.slice(11, 16) : `SP ${sp}`
  }

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
    reserve:  'RECOVERY_RESERVE',
    response: 'RESPONSE',
    pullback: 'MARGIN',
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

  const areaStatusMap = useMemo(() =>
    Object.fromEntries(
      AREAS.map(a => [
        a.id,
        computeAreaStatus(a.id, settlementPeriods, areaRequirements, 48, tweaks.reservePct),
      ])
    )
  , [settlementPeriods, areaRequirements, tweaks.reservePct])

  const isOwner = activeDraft?.ownerId === currentUser
  const readOnly = !activeDraft || activeDraft.status !== 'draft' || !isOwner

  const [sidebarOpen, setSidebarOpen] = useState(true)

  const appClass = [
    'app',
    'layout-' + tweaks.layout,
    tweaks.showSidebar ? 'with-sidebar' : 'no-sidebar',
    tweaks.showSidebar && !sidebarOpen ? 'sidebar-collapsed' : '',
  ].filter(Boolean).join(' ')

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
          hiddenDraftIds={hiddenDraftIds}
          onToggleChartVisibility={toggleDraftChartVisibility}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen(v => !v)}
        />
      )}

      <main className="workspace">
        {/* Tab bar */}
        <div className="tab-bar">
          <button
            className={`tab-btn${activeTab === 'dashboard' ? ' active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            Dashboard
          </button>
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
            className={`tab-btn${activeTab === 'graph' ? ' active' : ''}`}
            onClick={() => setActiveTab('graph')}
          >
            BMU Summary
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
            onClick={() => setActiveTab('redeclare')}
            style={{
              margin: '0 0 0 8px',
              ...(activeTab === 'redeclare' ? { borderColor: 'var(--accent)', color: 'var(--text)' } : {}),
            }}
          >
            Redeclare
          </button>
          <button
            className="tweaks-trigger"
            onClick={() => setActiveTab('requirements')}
            style={{
              margin: '0 0 0 6px',
              ...(activeTab === 'requirements' ? { borderColor: 'var(--accent)', color: 'var(--text)' } : {}),
            }}
          >
            Requirements
          </button>
          <button
            className="tweaks-trigger"
            onClick={() => setShowConfig(v => !v)}
            style={{ margin: '0 0 0 6px' }}
          >
            ⚙ Config
          </button>
          <button
            className="tweaks-trigger"
            onClick={() => setShowFeedback(true)}
            style={{ margin: '0 0 0 6px' }}
          >
            💬 Feedback
          </button>
        </div>

        {/* Dashboard tab */}
        {activeTab === 'dashboard' && (
          <Dashboard
            settlementPeriods={settlementPeriods}
            areaRequirements={areaRequirements}
            areaThresholds={areaThresholds}
            reservePct={tweaks.reservePct}
            drafts={drafts}
            dataOverrides={dataOverrides}
            onTileClick={handleDashboardTileClick}
          />
        )}

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
                  currentUser={currentUser}
                  onChangeName={name => renameDraft(activeDraftId!, name)}
                  onChangeDescription={desc => updateDraftDescription(activeDraftId!, desc)}
                  solveMw={solveTarget?.adjustedMw ?? null}
                  onSolveMwChange={handleSolveMwChange}
                  onChangeFrom={from => {
                    setSolveTarget(null)
                    updateDraftWindow(activeDraftId!, from, activeDraft.toPeriod)
                  }}
                  onChangeTo={to => {
                    setSolveTarget(null)
                    updateDraftWindow(activeDraftId!, activeDraft.fromPeriod, to)
                  }}
                  onCommit={handleCommit}
                  onDiscard={handleDiscard}
                  onReopen={handleReopen}
                  onDelete={handleDelete}
                  onDuplicate={handleDuplicate}
                  onShare={userId => shareDraft(activeDraftId!, userId)}
                  onUnshare={userId => unshareDraft(activeDraftId!, userId)}
                  scenario={scenario}
                  onScenarioChange={setScenario}
                  gspFilter={gspFilter}
                  onGspFilterChange={setGspFilter}
                />
                <div className={`workspace-grid grid-${tweaks.layout}`}>
                  <AvailableTable
                    units={unitsForAvailableTable}
                    unitPnByBmUnit={unitPnByBmUnit}
                    unitServices={unitServices}
                    activeDraftUnitIds={activeDraftUnitIds}
                    otherDraftUnitMap={otherDraftUnitMap}
                    selectionPattern={tweaks.selectionPattern}
                    readOnly={readOnly}
                    voltageArea={voltageArea}
                    scenario={scenario}
                    gspFilter={gspFilter}
                    onAddUnits={handleAddUnits}
                    solveMode={solveTarget !== null}
                    solveMw={solveTarget?.adjustedMw ?? null}
                  />
                  <SelectedTable
                    draft={activeDraft}
                    unitById={unitById}
                    unitPnByBmUnit={unitPnByBmUnit}
                    unitServices={unitServices}
                    settlementPeriods={settlementPeriods}
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
                    onUpdateUnitWindow={(bmUnitId, fromPeriod, toPeriod) =>
                      updateUnitWindow(activeDraftId!, bmUnitId, fromPeriod, toPeriod)
                    }
                  />
                </div>
              </>
            ) : null}
          </div>
        )}

        {/* Chart tab */}
        {activeTab === 'chart' && (
          <div className="chart-tab" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {error && (
              <div className="error-banner">Error: {error}</div>
            )}
            {isLoading && (
              <div className="loading-banner">Loading data…</div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
              {/* Area selector */}
              {(() => {
                const st = areaStatusMap[activeAreaTab]
                const dotColor = STATUS_DOT_COLOR[st?.status ?? 'ok']
                const activeArea = AREAS.find(a => a.id === activeAreaTab)
                return (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '6px 14px', borderBottom: '1px solid var(--border)',
                    background: 'var(--surface)', flexShrink: 0,
                  }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>Area:</span>
                    <select
                      value={activeAreaTab}
                      onChange={e => setActiveAreaTab(e.target.value as AreaId)}
                      style={{
                        fontSize: 11, padding: '3px 8px',
                        border: '1px solid var(--border)', borderRadius: 4,
                        background: 'var(--bg)', color: 'var(--text)', cursor: 'pointer',
                      }}
                    >
                      {AREAS.map(a => {
                        const s = areaStatusMap[a.id]
                        const label = s?.status === 'shortfall' ? ` ⚠ ${a.name}` : a.name
                        return <option key={a.id} value={a.id}>{label}</option>
                      })}
                    </select>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, display: 'inline-block', flexShrink: 0 }} />
                    <span style={{ fontSize: 11, color: dotColor, fontWeight: 600 }}>
                      {st?.status === 'shortfall' ? 'Shortfall' : st?.status === 'tight' ? 'Tight' : 'OK'}
                    </span>
                    {st && (
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 4 }}>
                        {st.worstGap >= 0 ? '+' : ''}{Math.round(st.worstGap).toLocaleString()} {activeArea?.unit}
                      </span>
                    )}
                  </div>
                )
              })()}

              {/* Margin chart */}
              {activeAreaTab === 'margin' && (
                <MarginChart
                  hiddenDraftIds={hiddenDraftIds}
                  reservePct={tweaks.reservePct}
                  chartInteractionMode={tweaks.chartInteractionMode}
                  clearSelectionKey={clearSelectionKey}
                  onSolveSelect={handleSolveSelect}
                />
              )}

              {/* Non-Margin area charts */}
              {activeAreaTab !== 'margin' && (() => {
                const areaConfig = getArea(activeAreaTab)
                const reqs = areaRequirements[activeAreaTab] ?? []
                return (
                  <AreaChart
                    area={areaConfig}
                    settlementPeriods={settlementPeriods}
                    areaRequirements={reqs}
                    drafts={drafts}
                    units={units}
                    hiddenDraftIds={hiddenDraftIds}
                    chartInteractionMode={tweaks.chartInteractionMode}
                    onSolveSelect={handleAreaSolveSelect}
                    isLoading={isLoading}
                  />
                )
              })()}
            </div>

            {/* Solve bar */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 20,
              padding: '10px 16px',
              background: 'var(--bg-panel)',
              border: `1px solid ${solvePanelVisible ? '#6366f1' : 'var(--border)'}`,
              borderRadius: 8,
              flexShrink: 0,
            }}>
              {(['From', 'To', 'Duration', 'Worst Shortfall'] as const).map(lbl => {
                let val = '—'
                let color: string | undefined
                if (solveTarget && solvePanelVisible) {
                  const dur = (solveTarget.toSp - solveTarget.fromSp + 1) * 30
                  if (lbl === 'From')          val = fmtSlot(solveTarget.fromSp)
                  if (lbl === 'To')            val = fmtSlot(solveTarget.toSp)
                  if (lbl === 'Duration')      val = dur < 60 ? `${dur} min` : `${(dur / 60).toFixed(1)} h`
                  if (lbl === 'Worst Shortfall') {
                    val = `${Math.round(solveTarget.worstDeficitMw).toLocaleString('en-GB')} MW`
                    color = '#ef4444'
                  }
                }
                return (
                  <div key={lbl} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-faint)' }}>{lbl}</span>
                    <span style={{ fontSize: 12, fontFamily: 'monospace', color: color ?? (solvePanelVisible ? 'var(--text)' : 'var(--text-faint)'), fontWeight: color ? 700 : 400 }}>{val}</span>
                  </div>
                )
              })}
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
                {solvePanelVisible && (
                  <button
                    style={{ fontSize: 11, color: 'var(--text-faint)', background: 'none', border: 'none', cursor: 'pointer' }}
                    onClick={() => { setSolveTarget(null); setSolvePanelVisible(false) }}
                  >
                    ✕ Clear
                  </button>
                )}
                <button
                  className="btn btn-primary"
                  disabled={!solvePanelVisible}
                  onClick={handleSolveNavigate}
                  style={{ fontSize: 12, opacity: solvePanelVisible ? 1 : 0.35, padding: '6px 16px' }}
                >
                  Solve ↗
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Committed tab */}
        {activeTab === 'committed' && (
          <CommittedTab
            drafts={drafts}
            unitById={unitById}
            unitPnByBmUnit={unitPnByBmUnit}
            dataOverrides={dataOverrides}
            unitServices={unitServices}
            settlementPeriods={settlementPeriods}
            onRemoveUnits={handleRemoveCommittedUnits}
          />
        )}

        {/* Redeclare tab */}
        {activeTab === 'redeclare' && (
          <RedeclareTab
            drafts={drafts}
            unitById={unitById}
            unitPnByBmUnit={unitPnByBmUnit}
            dataOverrides={dataOverrides}
            unitServices={unitServices}
            onSetOverride={setDataOverride}
            onClearOverride={clearDataOverride}
            onClearAll={clearAllDataOverrides}
            onSetService={setUnitService}
          />
        )}

        {/* Requirements tab */}
        {activeTab === 'requirements' && (
          <RequirementsTab
            reservePct={tweaks.reservePct}
            onReservePctChange={v => setTweak('reservePct', v)}
          />
        )}

        {/* Graph tab */}
        {activeTab === 'graph' && (
          <GraphTab
            settlementPeriods={settlementPeriods}
            units={units}
            drafts={drafts}
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
          dataMode={dataMode}
          onDataModeChange={setDataMode}
          historicalDate={historicalDate}
          onHistoricalDateChange={setHistoricalDate}
          historicalStartSp={historicalStartSp}
          onHistoricalStartSpChange={setHistoricalStartSp}
          onLoadHistorical={loadHistoricalData}
        />
      )}

      {showFeedback && (
        <FeedbackModal onClose={() => setShowFeedback(false)} />
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
