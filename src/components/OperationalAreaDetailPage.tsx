'use client'

import { AREA_CONFIG } from '@/dashboard2/dashboard.config'
import type { AreaId } from '@/dashboard2/types'

interface Props {
  areaId: Exclude<AreaId, 'constraints'>
  onBack: () => void
}

export default function OperationalAreaDetailPage({ areaId, onBack }: Props) {
  const area = AREA_CONFIG.find(config => config.id === areaId)!

  return (
    <div style={{ padding: '12px 16px', overflow: 'auto', flex: 1, minHeight: 0 }}>
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
            {area.ariaName}
          </span>
        </nav>
      </div>
    </div>
  )
}
