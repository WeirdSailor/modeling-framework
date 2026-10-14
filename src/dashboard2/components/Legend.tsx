// Legend row (spec §8.6). The right-hand note lists areas whose data is mock/fixture.

import { AREA_CONFIG } from '../dashboard.config'
import { arrowPoints } from '../geometry'
import type { MockSource } from '../types'
import { HATCH_FILL } from './charts/SvgDefs'
import { IC_ESTIMATE_OPACITY } from './charts/IcChart'
import styles from '../dashboard2.module.css'

export function mockNote(sources: MockSource[]): string | null {
  const parts: string[] = []
  for (const cfg of AREA_CONFIG) {
    const mine = sources.filter(s => s.areaId === cfg.id)
    if (mine.some(s => s.part === 'all')) parts.push(cfg.label)
    else if (mine.some(s => s.part === 'actions')) parts.push(`${cfg.label} actions`)
  }
  return parts.length > 0 ? `Mock data: ${parts.join(', ')}` : null
}

export default function Legend({ mockSources }: { mockSources: MockSource[] }) {
  const note = mockNote(mockSources)
  return (
    <div className={styles.legend}>
      <span className={styles.legendItem}>
        <svg width="26" height="10" aria-hidden="true"><line x1="0" y1="5" x2="26" y2="5" stroke="#8C97A7" strokeDasharray="6 4" /></svg>
        Requirement
      </span>
      <span className={styles.legendItem}>
        <svg width="18" height="12" aria-hidden="true"><rect width="18" height="12" fill={HATCH_FILL} /></svg>
        Violated
      </span>
      <span className={styles.legendItem}>
        <svg width="18" height="12" aria-hidden="true"><rect x=".5" y=".5" width="17" height="11" rx="2" fill="rgba(242,181,60,.30)" stroke="rgba(242,181,60,.85)" /></svg>
        Tight
      </span>
      <span className={styles.legendItem}>
        <svg width="18" height="12" aria-hidden="true"><rect x=".5" y=".5" width="17" height="11" rx="2" fill="#2C3746" stroke="#5B6B82" /></svg>
        Managed by actions
      </span>
      <span className={styles.legendItem}>
        <svg width="12" height="12" aria-hidden="true"><polygon points={arrowPoints(6, 6, 'down', 0.9)} fill="#E7EBF0" /></svg>
        Unusable
      </span>
      <span className={styles.legendItem}>
        <svg width="12" height="12" aria-hidden="true"><polygon points={arrowPoints(6, 7, 'up', 0.9)} fill="#E7EBF0" /></svg>
        Allocated
      </span>
      <span className={styles.legendItem}>
        <svg width="12" height="14" aria-hidden="true"><rect x="2" y="1" width="8" height="12" rx="1.5" fill="#7D8A9C" /></svg>
        IC swing
      </span>
      <span className={styles.legendItem}>
        <svg width="12" height="14" aria-hidden="true"><rect x="2" y="1" width="8" height="12" rx="1.5" fill="#7D8A9C" opacity={IC_ESTIMATE_OPACITY} /></svg>
        IC estimate
      </span>
      {note && <span className={styles.legendNote}>{note}</span>}
    </div>
  )
}
