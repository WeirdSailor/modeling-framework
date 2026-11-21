// Small shared helpers for the Schedule tab.

import type { ActionType, BMUnit, ModellingAction, SettlementPeriodData } from '@/models/types'
import { ACTION_TYPE_LABELS } from '@/models/types'
import { actionTypeOf, slotValues } from '@/utils/actionEffects'

export const REASON_LABEL: Record<ModellingAction['reasonCode'], string> = {
  MARGIN:               'Margin',
  RECOVERY_RESERVE:     'Recovery Reserve',
  FREQ_CONTROL_RESERVE: 'Freq. Control',
  GENERAL_RESERVE:      'General Reserve',
  CONTINGENCY_RESERVE:  'Contingency',
  RESPONSE:             'Response',
  INERTIA:              'Inertia',
  VOLTAGE:              'Voltage',
}

export function fmtMw(n: number): string {
  return Math.round(n).toLocaleString()
}

/** "DD|HH:MM" for a window slot index, same format as DraftDetails. */
export function slotLabel(slot: number, periods: SettlementPeriodData[]): string {
  const sp = periods.find(s => s.settlementPeriod === slot)
  return sp ? `${sp.startTime.slice(8, 10)}|${sp.startTime.slice(11, 16)}` : `SP ${slot}`
}

export function ActionChip({ type }: { type: ActionType }) {
  return <span className={`chip chip-act-${type}`}>{ACTION_TYPE_LABELS[type]}</span>
}

/** "off → 600 MW", "420 → SEL 180 MW", "380 → 0 MW", "MEL 431 → 501 MW" (spec §8.3). */
export function describeChange(
  action: ModellingAction,
  sp: SettlementPeriodData | undefined,
  unit: BMUnit | undefined,
): string {
  if (!sp) return '—'
  const v = slotValues(action.bmUnitId, sp, unit)
  switch (actionTypeOf(action)) {
    case 'start':    return `off → ${fmtMw(action.outputLevel)} MW`
    case 'deload':   return `${fmtMw(v.pn)} → SEL ${fmtMw(v.sel)} MW`
    case 'desync':   return `${fmtMw(v.pn)} → 0 MW`
    case 'capacity': return `MEL ${fmtMw(v.pn)} → ${fmtMw(v.reg)} MW`
  }
}
