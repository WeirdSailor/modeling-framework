'use client'

import { useRef, useState } from 'react'
import { SCENARIOS, GSP_AREAS, type ScenarioId } from '@/config/scenarios'
import { spToTime, dateToSettlementDate } from '@/utils/settlements'

// ── TweakState (moved here from TweaksPanel) ──────────────────────────────────

export interface TweakState {
  theme: 'light' | 'dark'
  layout: 'three-col' | 'stacked'
  showSidebar: boolean
  selectionPattern: 'buttons' | 'click'
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function SegControl<T extends string>({
  value, options, onChange,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  const n = options.length
  const idx = Math.max(0, options.findIndex(o => o.value === value))
  return (
    <div className="twk-seg">
      <div
        className="twk-seg-thumb"
        style={{
          left: `calc(2px + ${idx} * (100% - 4px) / ${n})`,
          width: `calc((100% - 4px) / ${n})`,
        }}
      />
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      className="twk-toggle"
      data-on={value ? '1' : '0'}
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
    >
      <i />
    </button>
  )
}

// ── Tweaks tab ────────────────────────────────────────────────────────────────

function TweaksTab({
  tweaks,
  onChangeTweak,
}: {
  tweaks: TweakState
  onChangeTweak: <K extends keyof TweakState>(key: K, value: TweakState[K]) => void
}) {
  return (
    <div className="twk-body">
      <div className="twk-sect">Theme</div>
      <SegControl
        value={tweaks.theme}
        options={[
          { value: 'light', label: 'Light' },
          { value: 'dark',  label: 'Dark' },
        ]}
        onChange={v => onChangeTweak('theme', v)}
      />

      <div className="twk-sect">Layout</div>
      <SegControl
        value={tweaks.layout}
        options={[
          { value: 'three-col', label: 'Side by side' },
          { value: 'stacked',   label: 'Stacked' },
        ]}
        onChange={v => onChangeTweak('layout', v)}
      />
      <div className="twk-row twk-row-h">
        <div className="twk-lbl"><span>Drafts sidebar</span></div>
        <Toggle value={tweaks.showSidebar} onChange={v => onChangeTweak('showSidebar', v)} />
      </div>

      <div className="twk-sect">Selection</div>
      <SegControl
        value={tweaks.selectionPattern}
        options={[
          { value: 'buttons', label: 'Buttons' },
          { value: 'click',   label: 'Click' },
        ]}
        onChange={v => onChangeTweak('selectionPattern', v)}
      />
    </div>
  )
}

// ── Scenarios tab ─────────────────────────────────────────────────────────────

function ScenariosTab({
  voltageArea,
  onVoltageAreaChange,
}: {
  voltageArea: string
  onVoltageAreaChange: (area: string) => void
}) {
  const [expanded, setExpanded] = useState<ScenarioId | null>(null)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 12px', overflowY: 'auto', maxHeight: 560 }}>
      {SCENARIOS.map(sc => {
        const isOpen = expanded === sc.id
        return (
          <div
            key={sc.id}
            style={{
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              background: 'var(--bg-row-alt)',
              overflow: 'hidden',
            }}
          >
            <button
              onClick={() => setExpanded(isOpen ? null : sc.id)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '7px 10px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                color: 'var(--text)',
              }}
            >
              <span style={{
                fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '.06em', color: 'var(--accent)', minWidth: 66,
              }}>
                {sc.name}
              </span>
              <span style={{ fontSize: 11.5, color: 'var(--text-soft)', flex: 1 }}>
                {sc.shortDescription}
              </span>
              {sc.supportsArea && (
                <span style={{
                  fontSize: 9.5, fontWeight: 600, color: 'var(--text-faint)',
                  background: 'var(--bg-panel)', padding: '1px 5px', borderRadius: 3,
                }}>
                  Area
                </span>
              )}
              <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>
                {isOpen ? '▲' : '▼'}
              </span>
            </button>

            {isOpen && (
              <div style={{
                padding: '8px 10px 10px',
                borderTop: '1px solid var(--border)',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}>
                <ScField label="Description">{sc.description}</ScField>
                <ScField label="Ranking">
                  <span style={{ fontFamily: 'var(--font-roboto-mono, monospace)', fontSize: 11 }}>
                    {sc.rankingBasis}
                  </span>
                </ScField>
                {sc.unitPreference && (
                  <ScField label="Preference">{sc.unitPreference}</ScField>
                )}
                <ScField label="Best for">{sc.bestFor}</ScField>

                {sc.supportsArea && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                    <span style={{
                      fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
                      letterSpacing: '.05em', color: 'var(--text-faint)', minWidth: 60,
                    }}>
                      Area
                    </span>
                    <select
                      value={voltageArea}
                      onChange={e => onVoltageAreaChange(e.target.value)}
                      style={{
                        fontSize: 11.5,
                        padding: '3px 6px',
                        borderRadius: 'var(--radius)',
                        border: '1px solid var(--border)',
                        background: 'var(--bg-input)',
                        color: 'var(--text)',
                        cursor: 'pointer',
                      }}
                    >
                      <option value="">All areas</option>
                      {GSP_AREAS.map(a => (
                        <option key={a.id} value={a.id}>{a.label}</option>
                      ))}
                    </select>
                    {voltageArea && (
                      <span style={{ fontSize: 10.5, color: 'var(--text-soft)' }}>
                        {voltageArea} ranks first
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
      <p style={{ margin: '4px 0 0', fontSize: 10.5, color: 'var(--text-faint)', fontStyle: 'italic', lineHeight: 1.4 }}>
        Criteria are indicative — live sorting will be wired in a future update.
      </p>
    </div>
  )
}

function ScField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
      <span style={{
        fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
        letterSpacing: '.05em', color: 'var(--text-faint)', minWidth: 62,
        paddingTop: 2, flexShrink: 0,
      }}>
        {label}
      </span>
      <span style={{ fontSize: 11.5, color: 'var(--text-soft)', lineHeight: 1.5 }}>
        {children}
      </span>
    </div>
  )
}

// ── Data tab ──────────────────────────────────────────────────────────────────

function DataTab({
  dataMode,
  onDataModeChange,
  historicalDate,
  onHistoricalDateChange,
  historicalStartSp,
  onHistoricalStartSpChange,
  onLoadHistorical,
}: {
  dataMode: 'real' | 'historical'
  onDataModeChange: (mode: 'real' | 'historical') => void
  historicalDate: string
  onHistoricalDateChange: (date: string) => void
  historicalStartSp: number
  onHistoricalStartSpChange: (sp: number) => void
  onLoadHistorical: (date: string, startSp: number) => void
}) {
  const yesterday = dateToSettlementDate(
    new Date(Date.now() - 24 * 60 * 60 * 1000)
  )
  const startTime = spToTime(historicalStartSp)
  const endDate = dateToSettlementDate(
    new Date(new Date(`${historicalDate}T00:00:00Z`).getTime() + 24 * 60 * 60 * 1000)
  )
  function fmtDate(iso: string) {
    const [y, m, d] = iso.split('-')
    return `${d}/${m}/${y}`
  }

  return (
    <div className="twk-body">
      <div className="twk-sect">Data source</div>
      <SegControl
        value={dataMode}
        options={[
          { value: 'real', label: 'Real-time' },
          { value: 'historical', label: 'Historical' },
        ]}
        onChange={onDataModeChange}
      />

      {dataMode === 'historical' && (
        <>
          <div className="twk-sect">Date</div>
          <input
            type="date"
            value={historicalDate}
            max={yesterday}
            onChange={e => onHistoricalDateChange(e.target.value)}
            style={{
              width: '100%',
              fontSize: 12,
              padding: '4px 6px',
              borderRadius: 'var(--radius)',
              border: '1px solid var(--border)',
              background: 'var(--bg-input)',
              color: 'var(--text)',
              boxSizing: 'border-box',
            }}
          />

          <div className="twk-sect">Start time (UTC)</div>
          <select
            value={historicalStartSp}
            onChange={e => onHistoricalStartSpChange(Number(e.target.value))}
            style={{
              width: '100%',
              fontSize: 12,
              padding: '4px 6px',
              borderRadius: 'var(--radius)',
              border: '1px solid var(--border)',
              background: 'var(--bg-input)',
              color: 'var(--text)',
            }}
          >
            {Array.from({ length: 48 }, (_, i) => {
              const sp = i + 1
              return (
                <option key={sp} value={sp}>
                  {spToTime(sp)}
                </option>
              )
            })}
          </select>

          <p style={{
            fontSize: 10.5,
            color: 'var(--text-soft)',
            margin: '6px 0',
            lineHeight: 1.4,
          }}>
            48 SPs: {startTime} UTC {fmtDate(historicalDate)} → {startTime} UTC {fmtDate(endDate)}
          </p>

          <button
            className="btn btn-primary btn-block"
            onClick={() => onLoadHistorical(historicalDate, historicalStartSp)}
            style={{ marginTop: 4 }}
          >
            Load historical data
          </button>
        </>
      )}
    </div>
  )
}

// ── ConfigPanel ───────────────────────────────────────────────────────────────

interface Props {
  tweaks: TweakState
  onChangeTweak: <K extends keyof TweakState>(key: K, value: TweakState[K]) => void
  voltageArea: string
  onVoltageAreaChange: (area: string) => void
  onClose: () => void
  dataMode: 'real' | 'historical'
  onDataModeChange: (mode: 'real' | 'historical') => void
  historicalDate: string
  onHistoricalDateChange: (date: string) => void
  historicalStartSp: number
  onHistoricalStartSpChange: (sp: number) => void
  onLoadHistorical: (date: string, startSp: number) => void
}

type ConfigTab = 'tweaks' | 'scenarios' | 'data'

export default function ConfigPanel({
  tweaks, onChangeTweak, voltageArea, onVoltageAreaChange, onClose,
  dataMode, onDataModeChange,
  historicalDate, onHistoricalDateChange,
  historicalStartSp, onHistoricalStartSpChange,
  onLoadHistorical,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null)
  const offsetRef = useRef({ x: 16, y: 16 })
  const [configTab, setConfigTab] = useState<ConfigTab>('tweaks')

  const onDragStart = (e: React.MouseEvent) => {
    const panel = panelRef.current
    if (!panel) return
    const r = panel.getBoundingClientRect()
    const sx = e.clientX, sy = e.clientY
    const startRight  = window.innerWidth  - r.right
    const startBottom = window.innerHeight - r.bottom
    const move = (ev: MouseEvent) => {
      offsetRef.current = {
        x: startRight  - (ev.clientX - sx),
        y: startBottom - (ev.clientY - sy),
      }
      panel.style.right  = offsetRef.current.x + 'px'
      panel.style.bottom = offsetRef.current.y + 'px'
    }
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  return (
    <div
      ref={panelRef}
      className="twk-panel"
      style={{ right: offsetRef.current.x, bottom: offsetRef.current.y, width: 480 }}
    >
      {/* Drag handle / header */}
      <div className="twk-hd" onMouseDown={onDragStart}>
        <div style={{ display: 'flex', gap: 0 }}>
          {(['tweaks', 'scenarios', 'data'] as ConfigTab[]).map(t => (
            <button
              key={t}
              type="button"
              onMouseDown={e => e.stopPropagation()}
              onClick={() => setConfigTab(t)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: configTab === t ? 700 : 400,
                color: configTab === t ? 'var(--text)' : 'var(--text-faint)',
                padding: '0 10px 0 0',
                textTransform: 'capitalize',
              }}
            >
              {t}
            </button>
          ))}
        </div>
        <button
          className="twk-x"
          aria-label="Close"
          onMouseDown={e => e.stopPropagation()}
          onClick={onClose}
        >✕</button>
      </div>

      {/* Tab content */}
      {configTab === 'tweaks' && (
        <TweaksTab tweaks={tweaks} onChangeTweak={onChangeTweak} />
      )}
      {configTab === 'scenarios' && (
        <ScenariosTab voltageArea={voltageArea} onVoltageAreaChange={onVoltageAreaChange} />
      )}
      {configTab === 'data' && (
        <DataTab
          dataMode={dataMode}
          onDataModeChange={onDataModeChange}
          historicalDate={historicalDate}
          onHistoricalDateChange={onHistoricalDateChange}
          historicalStartSp={historicalStartSp}
          onHistoricalStartSpChange={onHistoricalStartSpChange}
          onLoadHistorical={onLoadHistorical}
        />
      )}
    </div>
  )
}
