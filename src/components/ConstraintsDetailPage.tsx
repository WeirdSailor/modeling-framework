'use client'

// Level-2 detail view for transmission constraints, opened from Dashboard 2's CONSTRAINTS row.
// Dashboard 2 shows the consolidated per-SP state; this page holds the full per-constraint timeline
// (ConstraintsTile: KPIs, sort, changes since the previous run, per-SP cells, detail sidebar).

import { useState } from 'react'
import ConstraintsTile from './ConstraintsTile'

export const CONSTRAINT_TIMEFRAME_OPTIONS = [
  { label: 'Next 2h',  spCount: 4  },
  { label: 'Next 4h',  spCount: 8  },
  { label: 'Next 8h',  spCount: 16 },
  { label: 'Next 12h', spCount: 24 },
  { label: 'Next 24h', spCount: 48 },
]

/** Smallest timeframe that covers `spCount` SPs (falls back to the longest). */
export function constraintTimeframeIndexFor(spCount: number): number {
  const i = CONSTRAINT_TIMEFRAME_OPTIONS.findIndex(o => o.spCount >= spCount)
  return i === -1 ? CONSTRAINT_TIMEFRAME_OPTIONS.length - 1 : i
}

interface Props {
  initialSpCount: number
  onBack: () => void
}

export default function ConstraintsDetailPage({ initialSpCount, onBack }: Props) {
  const [tfIndex, setTfIndex] = useState(() => constraintTimeframeIndexFor(initialSpCount))
  const { spCount, label } = CONSTRAINT_TIMEFRAME_OPTIONS[tfIndex]

  return (
    <div style={{ padding: '12px 16px', overflow: 'auto', flex: 1, minHeight: 0 }}>
      {/* Breadcrumb + timeframe */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={onBack}
          style={{
            padding: '3px 10px', borderRadius: 4, fontSize: 11, cursor: 'pointer',
            background: 'var(--surface)', color: 'var(--text-muted)', border: '1px solid var(--border)',
          }}
        >
          ← Dashboard
        </button>
        <nav aria-label="Breadcrumb" style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          <span>Dashboard</span>
          <span aria-hidden style={{ margin: '0 6px' }}>/</span>
          <span aria-current="page" style={{ fontWeight: 700, letterSpacing: '.06em', color: 'var(--text)' }}>
            Constraints — {label}
          </span>
        </nav>
        <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
          {CONSTRAINT_TIMEFRAME_OPTIONS.map((opt, i) => (
            <button
              key={opt.label}
              type="button"
              aria-pressed={tfIndex === i}
              onClick={() => setTfIndex(i)}
              style={{
                padding: '3px 10px', borderRadius: 4, fontSize: 11, cursor: 'pointer',
                background: tfIndex === i ? 'var(--accent,#6366f1)' : 'var(--surface)',
                color: tfIndex === i ? '#fff' : 'var(--text-muted)',
                border: '1px solid var(--border)',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <ConstraintsTile
        spCount={spCount}
        onOpenConstraint={(id) => {
          // TODO: wire to a per-constraint (level-3) detail view once one exists.
          console.log('Open constraint detail (stub):', id)
        }}
      />
    </div>
  )
}
