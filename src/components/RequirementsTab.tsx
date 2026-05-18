'use client'

import { useState, useMemo } from 'react'
import { useModellingStore } from '@/store/useModellingStore'
import { NON_MARGIN_AREAS } from '@/config/areas'
import { spToStartTime } from '@/utils/settlements'

const INPUT_STYLE: React.CSSProperties = {
  width: 80,
  padding: '2px 5px',
  fontSize: 11,
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 3,
  color: 'var(--text)',
}

const FILL_INPUT_STYLE: React.CSSProperties = {
  width: 72,
  padding: '2px 5px',
  fontSize: 10,
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 3,
  color: 'var(--text)',
}

interface FillHeaderProps {
  label: string
  unit: string
  onFill: (value: number) => void
}

function FillHeader({ label, unit, onFill }: FillHeaderProps) {
  const [draft, setDraft] = useState('')

  function apply() {
    const v = parseFloat(draft)
    if (!isNaN(v)) { onFill(v); setDraft('') }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
      <span>{label} ({unit})</span>
      <div style={{ display: 'flex', gap: 3 }}>
        <input
          type="number"
          placeholder="value"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && apply()}
          style={FILL_INPUT_STYLE}
        />
        <button
          onClick={apply}
          title={`Fill all 48 SPs with this value`}
          style={{
            padding: '2px 6px',
            fontSize: 10,
            background: draft !== '' && !isNaN(parseFloat(draft)) ? 'var(--accent)' : 'var(--surface)',
            color: draft !== '' && !isNaN(parseFloat(draft)) ? '#fff' : 'var(--text-muted)',
            border: '1px solid var(--border)',
            borderRadius: 3,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          Fill ↓
        </button>
      </div>
    </div>
  )
}

interface Props {
  reservePct: number
  onReservePctChange: (v: number) => void
}

export default function RequirementsTab({ reservePct, onReservePctChange }: Props) {
  const areaRequirements   = useModellingStore(s => s.areaRequirements)
  const setAreaRequirement = useModellingStore(s => s.setAreaRequirement)
  const fillAreaRequirements = useModellingStore(s => s.fillAreaRequirements)
  const settlementPeriods  = useModellingStore(s => s.settlementPeriods)
  const areaThresholds     = useModellingStore(s => s.areaThresholds)
  const setAreaThreshold   = useModellingStore(s => s.setAreaThreshold)

  const [activeArea, setActiveArea] = useState(NON_MARGIN_AREAS[0].id)

  const area = NON_MARGIN_AREAS.find(a => a.id === activeArea)!
  const rows = areaRequirements[activeArea] ?? []

  const spDateMap = useMemo(() => {
    const map: Record<number, string> = {}
    settlementPeriods.forEach(sp => { map[sp.settlementPeriod] = sp.settlementDate })
    return map
  }, [settlementPeriods])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden', padding: '10px 16px 0' }}>
      {/* Area chip selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8, flexShrink: 0 }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Area:</span>
        {NON_MARGIN_AREAS.map(a => (
          <button
            key={a.id}
            onClick={() => setActiveArea(a.id)}
            style={{
              padding: '3px 10px',
              borderRadius: 4,
              fontSize: 11,
              border: '1px solid var(--border)',
              background: activeArea === a.id ? 'var(--accent)' : 'var(--surface)',
              color: activeArea === a.id ? '#fff' : 'var(--text-muted)',
              cursor: 'pointer',
            }}
          >
            {a.shortName}
          </button>
        ))}
      </div>

      {/* Sparkline threshold + reserve % (General Reserve only) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12, flexShrink: 0, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Dashboard sparkline threshold:</span>
          <input
            type="number"
            min={0}
            value={areaThresholds[activeArea] ?? 0}
            onChange={e => setAreaThreshold(activeArea, parseFloat(e.target.value) || 0)}
            style={{ ...INPUT_STYLE, width: 90 }}
          />
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{area.unit}</span>
        </div>

        {activeArea === 'general_reserve' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 16, borderLeft: '1px solid var(--border)' }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Margin reserve requirement (TR2):</span>
            <input
              type="number"
              min={0}
              max={50}
              step={1}
              value={reservePct}
              onChange={e => onReservePctChange(Math.min(50, Math.max(0, Number(e.target.value))))}
              style={{ ...INPUT_STYLE, width: 60, textAlign: 'right' }}
            />
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>%</span>
          </div>
        )}
      </div>

      {/* 48-row table */}
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>SP</th>
              <th>Time (UTC)</th>
              <th>
                <FillHeader
                  label="Requirement"
                  unit={area.unit}
                  onFill={v => fillAreaRequirements(activeArea, v, undefined, undefined)}
                />
              </th>
              <th>
                <FillHeader
                  label="Contracted"
                  unit={area.unit}
                  onFill={v => fillAreaRequirements(activeArea, undefined, v, undefined)}
                />
              </th>
              <th>
                <FillHeader
                  label="Constrained"
                  unit={area.unit}
                  onFill={v => fillAreaRequirements(activeArea, undefined, undefined, v)}
                />
              </th>
              <th>Net Available</th>
              <th>Gap</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const netAvail = row.contracted - row.constrained
              const gap = netAvail - row.requirement
              const gapColor =
                gap < 0 ? 'var(--red)' : gap < row.requirement * 0.1 ? 'var(--amber)' : 'var(--green)'
              const date = spDateMap[row.sp] ?? ''
              const timeStr = date ? spToStartTime(row.sp, date).slice(11, 16) : '--:--'
              return (
                <tr key={row.sp}>
                  <td>{row.sp}</td>
                  <td>{timeStr}</td>
                  <td>
                    <input
                      type="number"
                      value={row.requirement}
                      onChange={e => setAreaRequirement(activeArea, row.sp, 'requirement', parseFloat(e.target.value) || 0)}
                      style={INPUT_STYLE}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={row.contracted}
                      onChange={e => setAreaRequirement(activeArea, row.sp, 'contracted', parseFloat(e.target.value) || 0)}
                      style={INPUT_STYLE}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={row.constrained}
                      onChange={e => setAreaRequirement(activeArea, row.sp, 'constrained', parseFloat(e.target.value) || 0)}
                      style={INPUT_STYLE}
                    />
                  </td>
                  <td style={{ color: netAvail >= row.requirement ? 'var(--green)' : 'var(--red)' }}>
                    {netAvail.toLocaleString()}
                  </td>
                  <td style={{ fontWeight: 700, color: gapColor }}>
                    {gap >= 0 ? '+' : ''}{gap.toLocaleString()}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
