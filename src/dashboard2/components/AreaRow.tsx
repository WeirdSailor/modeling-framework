'use client'

// One area row: left column (name + worst-in-window) and the chart slot.

import { ROW_HEIGHT, type AreaConfig } from '../dashboard.config'
import type { XScale } from '../geometry'
import type { AreaData, DrillDownEvent, IcAreaData, LineAreaData, StripAreaData } from '../types'
import WorstValue from './WorstValue'
import LineChart from './charts/LineChart'
import StripChart from './charts/StripChart'
import IcChart from './charts/IcChart'
import styles from '../dashboard2.module.css'

interface Props {
  cfg: AreaConfig
  area: AreaData | undefined
  scale: XScale
  nowMs: number
  onDrillDown: (e: DrillDownEvent) => void
}

export default function AreaRow({ cfg, area, scale, nowMs, onDrillDown }: Props) {
  const height = ROW_HEIGHT[cfg.kind]
  let chart
  if (cfg.kind === 'line') {
    chart = <LineChart area={area as LineAreaData | undefined} cfg={cfg} scale={scale} height={height} nowMs={nowMs} onDrillDown={onDrillDown} />
  } else if (cfg.kind === 'strip') {
    chart = <StripChart area={area as StripAreaData | undefined} areaId={cfg.id} scale={scale} height={height} nowMs={nowMs} onDrillDown={onDrillDown} />
  } else {
    chart = <IcChart area={area as IcAreaData | undefined} cfg={cfg} scale={scale} height={height} nowMs={nowMs} onDrillDown={onDrillDown} />
  }
  return (
    <div className={styles.grid} role="group" aria-label={cfg.ariaName} style={{ height }}>
      <div className={styles.left}>
        <div className={styles.name}>{cfg.label}</div>
        <WorstValue cfg={cfg} area={area} startMs={scale.startMs} endMs={scale.endMs} />
      </div>
      <div className={styles.chartCell}>{chart}</div>
    </div>
  )
}
