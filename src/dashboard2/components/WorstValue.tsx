// Worst-in-window block in the left column (spec §8.1).

import { icSwings, icTone, largestSwing, lineTone, lineWorst, stripWorst } from '../derive'
import { formatInt, formatSigned, formatSwingMagnitude, plural, spokenSigned } from '../format'
import type { AreaConfig } from '../dashboard.config'
import type { AreaData } from '../types'
import styles from '../dashboard2.module.css'

interface Props {
  cfg: AreaConfig
  area: AreaData | undefined
  startMs: number
  endMs: number
}

interface Block { big: string; tone: 'crit' | 'warn' | 'muted'; sub?: string; aria: string }

function compute(cfg: AreaConfig, area: AreaData | undefined, startMs: number, endMs: number): Block | null {
  if (!area) return null
  if (cfg.kind === 'line' && area.kind === 'line') {
    const w = lineWorst(area.periods, startMs, endMs)
    if (!w) return null
    return {
      big: formatSigned(w.headroom),
      tone: lineTone(w.headroom, w.requirement, cfg.tight),
      sub: `req ${formatInt(w.requirement)}`,
      aria: `${cfg.ariaName}, worst headroom ${spokenSigned(w.headroom)}, requirement ${formatInt(w.requirement)}`,
    }
  }
  if (cfg.kind === 'strip' && area.kind === 'strip') {
    const w = stripWorst(area.periods, startMs, endMs)
    if (!w) return null
    if (w.kind === 'ok') return { big: 'OK', tone: 'muted', aria: `${cfg.ariaName}, OK` }
    const sps = w.spCount === 1 ? '1 SP' : `${w.spCount} SPs`
    const items = plural(w.itemCount, cfg.noun)
    return w.kind === 'violated'
      ? { big: sps, tone: 'crit', sub: items, aria: `${cfg.ariaName}, ${sps} violated, ${items}` }
      : { big: `${sps} tight`, tone: 'warn', sub: items, aria: `${cfg.ariaName}, ${sps} tight, ${items}` }
  }
  if (cfg.kind === 'ic' && area.kind === 'ic') {
    const s = largestSwing(icSwings(area.periods, startMs, endMs))
    if (!s) return null
    const abs = Math.abs(s.swing)
    const tone = icTone(abs, cfg.amber, cfg.red)
    return {
      big: formatSwingMagnitude(abs),
      tone: tone === 'red' ? 'crit' : tone === 'amber' ? 'warn' : 'muted',
      sub: s.estimated ? 'largest swing (est.)' : 'largest swing',
      aria: `${cfg.ariaName}, largest swing ${formatSwingMagnitude(abs)}${s.estimated ? ', estimated' : ''}`,
    }
  }
  return null
}

export default function WorstValue({ cfg, area, startMs, endMs }: Props) {
  const b = compute(cfg, area, startMs, endMs)
  if (!b) {
    return (
      <div className={styles.worst} aria-label={`${cfg.ariaName}, no data`}>
        <div className={`${styles.worstSub} ${styles.muted}`} style={{ fontSize: 14 }}>No data</div>
      </div>
    )
  }
  return (
    <div className={styles.worst} aria-label={b.aria}>
      <div className={`${styles.worstBig} ${styles[b.tone]}`} aria-hidden="true">{b.big}</div>
      {b.sub && <div className={styles.worstSub} aria-hidden="true">{b.sub}</div>}
    </div>
  )
}
