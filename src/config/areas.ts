import type { ScenarioId } from './scenarios'

export type AreaId =
  | 'margin'
  | 'recovery_reserve'
  | 'freq_control_reserve'
  | 'general_reserve'
  | 'contingency_reserve'
  | 'response'
  | 'inertia'
  | 'voltage'

export interface AreaConfig {
  id: AreaId
  name: string
  shortName: string
  unit: string
  defaultScenario: ScenarioId
  color: string
}

export const AREAS: AreaConfig[] = [
  { id: 'margin',                name: 'Margin',                    shortName: 'Margin',      unit: 'MW',   defaultScenario: 'margin',   color: '#94a3b8' },
  { id: 'recovery_reserve',      name: 'Recovery Reserve',          shortName: 'Recov. Res.', unit: 'MW',   defaultScenario: 'reserve',  color: '#6366f1' },
  { id: 'freq_control_reserve',  name: 'Freq. Control Reserve',     shortName: 'Freq. Ctrl.', unit: 'MW',   defaultScenario: 'reserve',  color: '#8b5cf6' },
  { id: 'general_reserve',       name: 'General Reserve',           shortName: 'Gen. Res.',   unit: 'MW',   defaultScenario: 'reserve',  color: '#06b6d4' },
  { id: 'contingency_reserve',   name: 'Contingency Reserve',       shortName: 'Conting.',    unit: 'MW',   defaultScenario: 'reserve',  color: '#0ea5e9' },
  { id: 'response',              name: 'Response',                  shortName: 'Response',    unit: 'MW',   defaultScenario: 'response', color: '#f97316' },
  { id: 'inertia',               name: 'Inertia',                   shortName: 'Inertia',     unit: 'GVAs', defaultScenario: 'inertia',  color: '#22c55e' },
  { id: 'voltage',               name: 'Voltage',                   shortName: 'Voltage',     unit: 'MVAr', defaultScenario: 'voltage',  color: '#f59e0b' },
]

export const NON_MARGIN_AREAS = AREAS.filter(a => a.id !== 'margin')

export const NON_MARGIN_AREA_IDS = NON_MARGIN_AREAS.map(a => a.id)

export function getArea(id: AreaId): AreaConfig {
  const area = AREAS.find(a => a.id === id)
  if (!area) throw new Error(`Unknown area: ${id}`)
  return area
}
