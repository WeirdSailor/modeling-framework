'use client'

// Dashboard 2 root: cross-area operational awareness view (Docs/Design/Dashboard/DASHBOARD_IMPLEMENTATION.md).

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Inter } from 'next/font/google'
import { useModellingStore } from '@/store/useModellingStore'
import {
  AREA_CONFIG, AREA_SOURCES, CUSTOM_TICK_CANDIDATES, type AreaSources, HEADER_HEIGHT, MIN_TICK_PX, PRESET_TICK_MINUTES,
} from '../dashboard.config'
import { createXScale } from '../geometry'
import { SP_MS, floorToSp, pickTickStep } from '../time'
import { HybridDashboardDataProvider } from '../data/HybridDashboardDataProvider'
import { useTimeWindow } from '../state/useTimeWindow'
import { useDashboardData } from '../state/useDashboardData'
import { CursorContext, createCursorStore } from '../state/cursorStore'
import type { DraftOverlay, DrillDownEvent } from '../types'
import TopBar from './TopBar'
import CustomRangeBanner from './CustomRangeBanner'
import TimeAxis from './TimeAxis'
import AreaRow from './AreaRow'
import Legend from './Legend'
import SvgDefs from './charts/SvgDefs'
import styles from '../dashboard2.module.css'

const inter = Inter({ subsets: ['latin'], weight: ['400', '500', '600', '700'] })

const defaultDrillDown = (e: DrillDownEvent) => console.debug('[dashboard2] drill-down', e)
const NO_HIDDEN_DRAFTS: ReadonlySet<string> = new Set()

interface Props {
  reservePct: number
  areaSources?: AreaSources
  // Drafts hidden via the sidebar's chart-visibility toggle — same set MarginChart/AreaChart honour.
  hiddenDraftIds?: ReadonlySet<string>
  onDrillDown?: (e: DrillDownEvent) => void
}

export default function OperationalDashboard({
  reservePct, areaSources = AREA_SOURCES, hiddenDraftIds = NO_HIDDEN_DRAFTS, onDrillDown = defaultDrillDown,
}: Props) {
  const { mode, window: win, nowMs, selectPreset, applyCustom, backToLive } = useTimeWindow()

  // Provider reads reservePct and the area sources lazily so it stays a stable instance.
  const reservePctRef = useRef(reservePct)
  useEffect(() => { reservePctRef.current = reservePct }, [reservePct])
  const areaSourcesRef = useRef(areaSources)
  useEffect(() => { areaSourcesRef.current = areaSources }, [areaSources])
  const hiddenDraftIdsRef = useRef(hiddenDraftIds)
  useEffect(() => { hiddenDraftIdsRef.current = hiddenDraftIds }, [hiddenDraftIds])
  const provider = useMemo(() => new HybridDashboardDataProvider(
    () => reservePctRef.current, () => areaSourcesRef.current, () => hiddenDraftIdsRef.current,
  ), [])

  // Refetch immediately when the shared store data, the TR2 multiplier, the area sources or the
  // drafts (edits, promotes, sidebar visibility) change.
  const settlementPeriods = useModellingStore(s => s.settlementPeriods)
  const areaRequirements = useModellingStore(s => s.areaRequirements)
  const drafts = useModellingStore(s => s.drafts)
  const units = useModellingStore(s => s.units)
  const refreshKey = useMemo(
    () => ({ settlementPeriods, areaRequirements, reservePct, areaSources, drafts, units, hiddenDraftIds }),
    [settlementPeriods, areaRequirements, reservePct, areaSources, drafts, units, hiddenDraftIds],
  )
  const { data, lastFetchFailed } = useDashboardData(provider, win.startMs, win.endMs, refreshKey)

  // Shared chart width (ResizeObserver on the axis chart cell); every row uses the same scale.
  const axisCellRef = useRef<HTMLDivElement>(null)
  const [chartWidth, setChartWidth] = useState(0)
  useLayoutEffect(() => {
    const el = axisCellRef.current
    if (!el) return
    const measure = () => setChartWidth(Math.floor(el.getBoundingClientRect().width))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const scale = useMemo(() => createXScale(win.startMs, win.endMs, chartWidth), [win.startMs, win.endMs, chartWidth])

  const tickMinutes = mode.type === 'preset'
    ? PRESET_TICK_MINUTES[mode.horizon]
    : pickTickStep(win.endMs - win.startMs, chartWidth || 1, CUSTOM_TICK_CANDIDATES, MIN_TICK_PX)

  // Cursor: one store for the whole dashboard. Keep it if its SP is still in the window.
  const [cursorStore] = useState(createCursorStore)
  useEffect(() => {
    const s = cursorStore.get()
    const outside = (ms: number | null) => ms !== null && (ms < win.startMs || ms >= win.endMs)
    if (outside(s.pinnedMs)) cursorStore.set({ pinnedMs: null })
    if (outside(s.hoverMs)) cursorStore.set({ hoverMs: null, hover: null })
  }, [cursorStore, win.startMs, win.endMs])

  const onKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    const s = cursorStore.get()
    const first = win.startMs
    const last = win.endMs - SP_MS
    const clamp = (ms: number) => Math.max(first, Math.min(last, ms))
    const base = s.pinnedMs ?? s.hoverMs ?? clamp(floorToSp(nowMs))
    let next: number | null | undefined
    if (e.key === 'ArrowLeft') next = clamp(base - SP_MS)
    else if (e.key === 'ArrowRight') next = clamp(base + SP_MS)
    else if (e.key === 'Home') next = first
    else if (e.key === 'End') next = last
    else if (e.key === 'Escape') next = null
    if (next === undefined) return
    e.preventDefault()
    cursorStore.set({ pinnedMs: next, hoverMs: null, hover: null })
  }, [cursorStore, win.startMs, win.endMs, nowMs])

  const areasById = useMemo(() => new Map((data?.areas ?? []).map(a => [a.id, a])), [data])

  // Drafts drawn on at least one line row, for the legend (first occurrence wins).
  const overlayDrafts = useMemo(() => {
    const seen = new Map<string, Pick<DraftOverlay, 'draftId' | 'name' | 'color'>>()
    for (const a of data?.areas ?? []) {
      if (a.kind !== 'line') continue
      for (const o of a.draftOverlays ?? []) if (!seen.has(o.draftId)) seen.set(o.draftId, o)
    }
    return [...seen.values()]
  }, [data])

  return (
    <CursorContext.Provider value={cursorStore}>
      <div className={`${styles.root} ${inter.className}`} tabIndex={0} onKeyDown={onKeyDown} aria-label="Operational dashboard">
        <SvgDefs />
        <TopBar
          active={mode.type === 'custom' ? 'custom' : mode.horizon}
          windowStartMs={win.startMs}
          windowEndMs={win.endMs}
          onSelectPreset={selectPreset}
          onApplyCustom={applyCustom}
          forecastRunAt={data?.forecastRunAt ?? null}
          updatedAt={data?.updatedAt ?? null}
          lastFetchFailed={lastFetchFailed}
        />
        {mode.type === 'custom' && (
          <CustomRangeBanner startMs={win.startMs} endMs={win.endMs} onBackToLive={backToLive} />
        )}
        <div className={styles.panel}>
          <div className={`${styles.grid} ${styles.header}`} style={{ height: HEADER_HEIGHT }}>
            <div className={styles.left} />
            <div className={styles.chartCell} ref={axisCellRef}>
              {chartWidth > 0 && <TimeAxis scale={scale} nowMs={nowMs} tickMinutes={tickMinutes} />}
            </div>
          </div>
          {chartWidth > 0 && AREA_CONFIG.map(cfg => (
            <AreaRow key={cfg.id} cfg={cfg} area={areasById.get(cfg.id)} scale={scale} nowMs={nowMs} onDrillDown={onDrillDown} />
          ))}
          <Legend mockSources={data?.mockSources ?? []} drafts={overlayDrafts} />
        </div>
      </div>
    </CursorContext.Provider>
  )
}
