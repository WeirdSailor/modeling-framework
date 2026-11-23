'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Inter } from 'next/font/google'
import { useModellingStore } from '@/store/useModellingStore'
import { buildDemoInterconnectorRows } from '@/config/interconnectorFixtures'
import {
  AREA_CONFIG, CUSTOM_TICK_CANDIDATES, HEADER_HEIGHT, MIN_TICK_PX, PRESET_TICK_MINUTES, ROW_HEIGHT,
  type AreaSource, type IcAreaConfig,
} from '@/dashboard2/dashboard.config'
import { loadInterconnectorReference, type InterconnectorReference } from '@/dashboard2/data/interconnectorReference'
import { buildInterconnectorRows, realDataLoadedAt } from '@/dashboard2/data/realAdapters'
import { createXScale } from '@/dashboard2/geometry'
import { CursorContext, createCursorStore } from '@/dashboard2/state/cursorStore'
import { useTimeWindow } from '@/dashboard2/state/useTimeWindow'
import { floorToSp, pickTickStep, SP_MS } from '@/dashboard2/time'
import type { TimeWindow } from '@/dashboard2/types'
import TopBar from '@/dashboard2/components/TopBar'
import CustomRangeBanner from '@/dashboard2/components/CustomRangeBanner'
import TimeAxis from '@/dashboard2/components/TimeAxis'
import WorstValue from '@/dashboard2/components/WorstValue'
import IcChart, { IC_ESTIMATE_OPACITY } from '@/dashboard2/components/charts/IcChart'
import styles from '@/dashboard2/dashboard2.module.css'

const inter = Inter({ subsets: ['latin'], weight: ['400', '500', '600', '700'] })
const cfg = AREA_CONFIG.find(area => area.id === 'interconnectors') as IcAreaConfig
const noDrillDown = () => {}

interface Props {
  initialWindow?: TimeWindow
  source: AreaSource
  onBack: () => void
}

export default function InterconnectorsDetailPage({ initialWindow, source, onBack }: Props) {
  const isDemo = source === 'mock'
  const { mode, window: win, nowMs, selectPreset, applyCustom, backToLive } = useTimeWindow(initialWindow)
  const periods = useModellingStore(state => state.settlementPeriods)
  const isLoading = useModellingStore(state => state.isLoading)
  const dataError = useModellingStore(state => state.error)
  const [references, setReferences] = useState<InterconnectorReference[] | null>(null)
  const [referenceFailed, setReferenceFailed] = useState(false)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    if (isDemo) return
    let cancelled = false
    setReferenceFailed(false)
    loadInterconnectorReference().then(
      result => { if (!cancelled) setReferences(result) },
      () => { if (!cancelled) setReferenceFailed(true) },
    )
    return () => { cancelled = true }
  }, [retry, isDemo])

  const rows = useMemo(() => {
    const window = { start: new Date(win.startMs).toISOString(), end: new Date(win.endMs).toISOString() }
    if (isDemo) return buildDemoInterconnectorRows(window, nowMs)
    return references ? buildInterconnectorRows(window, { settlementPeriods: periods }, references) : []
  }, [isDemo, references, periods, win.startMs, win.endMs, nowMs])

  const axisRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = axisRef.current
    if (!el) return
    const measure = () => setWidth(Math.floor(el.getBoundingClientRect().width))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  const scale = useMemo(() => createXScale(win.startMs, win.endMs, width), [win.startMs, win.endMs, width])
  const tickMinutes = mode.type === 'preset' ? PRESET_TICK_MINUTES[mode.horizon]
    : pickTickStep(win.endMs - win.startMs, width || 1, CUSTOM_TICK_CANDIDATES, MIN_TICK_PX)
  const [cursor] = useState(createCursorStore)
  useEffect(() => { cursor.set({ pinnedMs: null, hoverMs: null, hover: null }) }, [cursor, win.startMs, win.endMs])
  const loadedAt = isDemo ? nowMs - 15 * 60_000 : realDataLoadedAt()
  const loadedAtIso = loadedAt === null ? null : new Date(loadedAt).toISOString()

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const state = cursor.get()
    const base = state.pinnedMs ?? state.hoverMs ?? floorToSp(nowMs)
    let next: number | null
    if (event.key === 'Escape') next = null
    else if (event.key === 'ArrowLeft') next = base - SP_MS
    else if (event.key === 'ArrowRight') next = base + SP_MS
    else if (event.key === 'Home') next = win.startMs
    else if (event.key === 'End') next = win.endMs - SP_MS
    else return
    event.preventDefault()
    cursor.set({ pinnedMs: next === null ? null : Math.max(win.startMs, Math.min(win.endMs - SP_MS, next)), hoverMs: null, hover: null })
  }

  return (
    <CursorContext.Provider value={cursor}>
      <div className={`${styles.root} ${inter.className}`} aria-label="Interconnectors detail">
        <div className={styles.detailBreadcrumb}>
          <button type="button" className={styles.btn} onClick={onBack}>← Dashboard</button>
          <nav aria-label="Breadcrumb">Dashboard <span aria-hidden>/</span> <b aria-current="page">Interconnectors</b></nav>
          {isDemo && <span className={styles.demoBadge}>Demo data</span>}
        </div>
        <TopBar
          active={mode.type === 'custom' ? 'custom' : mode.horizon}
          windowStartMs={win.startMs} windowEndMs={win.endMs}
          onSelectPreset={selectPreset} onApplyCustom={applyCustom}
          forecastRunAt={loadedAtIso} updatedAt={loadedAtIso}
          lastFetchFailed={!isDemo && (referenceFailed || !!dataError)}
        />
        {mode.type === 'custom' && <CustomRangeBanner startMs={win.startMs} endMs={win.endMs} onBackToLive={backToLive} />}
        <div className={styles.panel} tabIndex={0} onKeyDown={onKeyDown} aria-label="Interconnector swing charts">
          <div className={`${styles.grid} ${styles.header}`} style={{ height: HEADER_HEIGHT }}>
            <div className={styles.left}>Interconnector</div>
            <div className={styles.chartCell} ref={axisRef}>
              {width > 0 && <TimeAxis scale={scale} nowMs={nowMs} tickMinutes={tickMinutes} />}
            </div>
          </div>
          {!isDemo && referenceFailed ? (
            <div className={styles.detailMessage} role="alert">
              Could not load the interconnector list. <button type="button" className={styles.btn} onClick={() => setRetry(n => n + 1)}>Retry</button>
            </div>
          ) : !isDemo && references === null ? (
            <div className={styles.detailMessage} role="status">Loading interconnectors…</div>
          ) : (
            <>
              {!rows.some(row => row.area.periods.length > 0) && (
                <div className={styles.detailMessage} role="status">
                  {isLoading ? 'Loading interconnector flows…' : 'No interconnector flow data available for this window.'}
                </div>
              )}
              {rows.map(row => (
                <div key={row.id} className={styles.grid} role="group" aria-label={row.name} style={{ height: ROW_HEIGHT.ic }}>
                  <div className={styles.left}>
                    <span className={styles.interconnectorName} title={row.id}>{row.name}</span>
                    <WorstValue cfg={{ ...cfg, label: row.name, ariaName: row.name }} area={row.area} startMs={win.startMs} endMs={win.endMs} />
                  </div>
                  <div className={styles.chartCell}>
                    {width > 0 && <IcChart area={row.area} cfg={cfg} scale={scale} height={ROW_HEIGHT.ic} nowMs={nowMs} showDirectionLabels={false} onDrillDown={noDrillDown} />}
                  </div>
                </div>
              ))}
            </>
          )}
          <div className={styles.legend}>
            <span className={styles.legendItem}><svg width="12" height="14" aria-hidden><rect x="2" y="1" width="8" height="12" rx="1.5" fill="#7D8A9C" /></svg>IC swing</span>
            <span className={styles.legendItem}><svg width="12" height="14" aria-hidden><rect x="2" y="1" width="8" height="12" rx="1.5" fill="#7D8A9C" opacity={IC_ESTIMATE_OPACITY} /></svg>IC estimate</span>
            {isDemo && <span className={styles.legendNote}>Mock data: Interconnectors</span>}
          </div>
        </div>
      </div>
    </CursorContext.Provider>
  )
}
