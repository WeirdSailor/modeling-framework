'use client'

import { useState } from 'react'
import type { HorizonId } from '../types'
import HorizonSelector from './HorizonSelector'
import CustomRangePopover from './CustomRangePopover'
import DataStatus from './DataStatus'
import styles from '../dashboard2.module.css'

interface Props {
  active: HorizonId | 'custom'
  windowStartMs: number
  windowEndMs: number
  onSelectPreset: (h: HorizonId) => void
  onApplyCustom: (fromMs: number, toMs: number) => void
  forecastRunAt: string | null
  updatedAt: string | null
  lastFetchFailed: boolean
}

export default function TopBar(props: Props) {
  const [pickerOpen, setPickerOpen] = useState(false)
  return (
    <div className={styles.topbar}>
      <HorizonSelector active={props.active} onSelect={props.onSelectPreset} onCustom={() => setPickerOpen(true)} />
      {pickerOpen && (
        <CustomRangePopover
          initialStartMs={props.windowStartMs}
          initialEndMs={props.windowEndMs}
          onCancel={() => setPickerOpen(false)}
          onApply={(f, t) => { props.onApplyCustom(f, t); setPickerOpen(false) }}
        />
      )}
      <div className={styles.spacer} />
      <DataStatus
        isCustom={props.active === 'custom'}
        forecastRunAt={props.forecastRunAt}
        updatedAt={props.updatedAt}
        lastFetchFailed={props.lastFetchFailed}
      />
    </div>
  )
}
