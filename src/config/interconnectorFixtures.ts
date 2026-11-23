// Illustrative signed net positions, shared by individual and consolidated IC views.
// Reversals are staggered so some swings reinforce and others cancel in the total.
import { demoRandom, randomInt } from './demoRandom'
import { interconnectorName } from '@/dashboard2/data/interconnectorReference'
import { SP_MS, floorToSp } from '@/dashboard2/time'
import type { IcAreaData, TimeWindow } from '@/dashboard2/types'

const CONNECTIONS = [
  { id: 'FRANCE', range: 2000 }, { id: 'BRITNED', range: 1000 },
  { id: 'ELECLINK', range: 1000 }, { id: 'IFA2', range: 1000 },
  { id: 'NEMOLINK', range: 1000 }, { id: 'NSL', range: 1400 },
  { id: 'VIKINGLINK', range: 1400 }, { id: 'EWIC', range: 500 },
  { id: 'GREENLINK', range: 500 }, { id: 'MOYLE', range: 500 },
]

export function buildDemoInterconnectorRows(window: TimeWindow, nowMs: number) {
  const anchor = floorToSp(nowMs)
  const start = Date.parse(window.start), end = Date.parse(window.end)
  return CONNECTIONS.map(connection => {
    const random = demoRandom('interconnector-' + connection.id + '-v2')
    const clamp = (value: number) => Math.round(Math.max(-connection.range, Math.min(connection.range, value)))
    let position = clamp((random() < 0.5 ? -1 : 1) * connection.range * (0.8 + 0.19 * random()))
    let nextChange = randomInt(random, 1, 5)
    let firstChange = true
    const periods: IcAreaData['periods'] = []
    for (let offset = -1; offset < 48; offset++) {
      if (offset >= nextChange) {
        const reversal = connection.range >= 1000 && (firstChange || random() < 0.55)
        position = reversal
          ? clamp(-Math.sign(position || 1) * connection.range * (0.84 + 0.16 * random()))
          : clamp(position + (random() - 0.5) * connection.range * 0.9)
        nextChange = offset + randomInt(random, 2, 9)
        firstChange = false
      } else if (random() < 0.7) {
        // Ordinary schedule changes need visible grey bars between large reversals.
        // Larger links vary within their current direction; smaller links may cross zero.
        let candidate = position
        for (let attempt = 0; attempt < 4; attempt++) {
          candidate = connection.range >= 1000
            ? clamp(Math.sign(position || 1) * connection.range * (0.5 + random() * 0.5))
            : clamp((random() * 2 - 1) * connection.range)
          if (Math.abs(candidate - position) >= 180) break
        }
        position = candidate
      }
      const ms = anchor + offset * SP_MS
      if (ms < start - SP_MS || ms >= end) continue
      const estimated = offset >= 4
      periods.push({
        spStart: new Date(ms).toISOString(), netPositionMw: position, estimated,
        sourceStart: new Date(estimated ? ms - 86_400_000 : ms).toISOString(),
      })
    }
    return {
      id: connection.id, name: interconnectorName(connection.id),
      area: { kind: 'ic' as const, id: 'interconnectors' as const, periods },
    }
  }).sort((a, b) => a.name.localeCompare(b.name))
}

/** Sum positions, then let the shared chart calculate swings; never sum absolute swings. */
export function buildDemoInterconnectors(window: TimeWindow, nowMs: number): IcAreaData {
  const rows = buildDemoInterconnectorRows(window, nowMs)
  return {
    kind: 'ic', id: 'interconnectors',
    periods: rows[0].area.periods.map((period, index) => ({
      ...period, netPositionMw: rows.reduce((sum, row) => sum + row.area.periods[index].netPositionMw, 0),
    })),
  }
}
