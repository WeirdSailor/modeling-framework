'use client'

import { useState, useMemo } from 'react'
import { useModellingStore } from '@/store/useModellingStore'
import { NON_MARGIN_AREAS } from '@/config/areas'
import { spToStartTime } from '@/utils/settlements'

export default function RequirementsTab() {
  const areaRequirements = useModellingStore(s => s.areaRequirements)
  const setAreaRequirement = useModellingStore(s => s.setAreaRequirement)
  const fillAreaRequirements = useModellingStore(s => s.fillAreaRequirements)
  const settlementPeriods = useModellingStore(s => s.settlementPeriods)

  const [activeArea, setActiveArea] = useState(NON_MARGIN_AREAS[0].id)
  const [fillReq, setFillReq] = useState('')
  const [fillCon, setFillCon] = useState('')

  const area = NON_MARGIN_AREAS.find(a => a.id === activeArea)!
  const rows = areaRequirements[activeArea] ?? []

  // Build a map of sp -> settlementDate for time display
  const spDateMap = useMemo(() => {
    const map: Record<number, string> = {}
    settlementPeriods.forEach(sp => {
      map[sp.settlementPeriod] = sp.settlementDate
    })
    return map
  }, [settlementPeriods])

  function handleFillApply() {
    const req = fillReq !== '' ? parseFloat(fillReq) : undefined
    const con = fillCon !== '' ? parseFloat(fillCon) : undefined
    if (req !== undefined || con !== undefined) {
      fillAreaRequirements(activeArea, req, con)
    }
  }

  return (
    <div className="redeclare-tab">
      {/* Area chip selector + fill toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
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

        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>
          Fill all SPs:
        </span>
        <input
          type="number"
          placeholder={`Req (${area.unit})`}
          value={fillReq}
          onChange={e => setFillReq(e.target.value)}
          style={{
            width: 90,
            padding: '3px 6px',
            fontSize: 11,
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 3,
            color: 'var(--text)',
          }}
        />
        <input
          type="number"
          placeholder={`Contracted (${area.unit})`}
          value={fillCon}
          onChange={e => setFillCon(e.target.value)}
          style={{
            width: 110,
            padding: '3px 6px',
            fontSize: 11,
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 3,
            color: 'var(--text)',
          }}
        />
        <button
          onClick={handleFillApply}
          style={{
            padding: '3px 10px',
            background: 'var(--accent)',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            fontSize: 11,
            cursor: 'pointer',
          }}
        >
          Apply
        </button>
      </div>

      {/* 48-row table */}
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>SP</th>
              <th>Time (UTC)</th>
              <th>Requirement ({area.unit})</th>
              <th>Contracted ({area.unit})</th>
              <th>Constrained ({area.unit})</th>
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
                      onChange={e =>
                        setAreaRequirement(activeArea, row.sp, 'requirement', parseFloat(e.target.value) || 0)
                      }
                      style={{
                        width: 80,
                        padding: '2px 5px',
                        fontSize: 11,
                        background: 'var(--bg)',
                        border: '1px solid var(--border)',
                        borderRadius: 3,
                        color: 'var(--text)',
                      }}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={row.contracted}
                      onChange={e =>
                        setAreaRequirement(activeArea, row.sp, 'contracted', parseFloat(e.target.value) || 0)
                      }
                      style={{
                        width: 80,
                        padding: '2px 5px',
                        fontSize: 11,
                        background: 'var(--bg)',
                        border: '1px solid var(--border)',
                        borderRadius: 3,
                        color: 'var(--text)',
                      }}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={row.constrained}
                      onChange={e =>
                        setAreaRequirement(activeArea, row.sp, 'constrained', parseFloat(e.target.value) || 0)
                      }
                      style={{
                        width: 80,
                        padding: '2px 5px',
                        fontSize: 11,
                        background: 'var(--bg)',
                        border: '1px solid var(--border)',
                        borderRadius: 3,
                        color: 'var(--text)',
                      }}
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
