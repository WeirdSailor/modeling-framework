import { demoIssueWindows, demoRandom, randomInt } from './demoRandom'
import { floorToSp, SP_MS } from '@/dashboard2/time'
import type { SpState, StripAreaData, StripPeriod, TimeWindow } from '@/dashboard2/types'

/** Independent event timing, lengths, products and severities for each service. */
export function buildDemoServiceArea(
  id: 'reserve' | 'response', items: StripAreaData['items'], window: TimeWindow, nowMs: number,
): StripAreaData {
  const random = demoRandom(id + '-states-v1')
  const slots: Record<string, SpState>[] = Array.from({ length: 48 }, () => ({}))
  for (const event of demoIssueWindows(id + '-uneven-v1')) {
    const products = [...items]
    const count = randomInt(random, 1, Math.min(3, products.length))
    const selected = Array.from({ length: count }, () => products.splice(randomInt(random, 0, products.length - 1), 1)[0])
    for (let offset = 0; offset < event.length; offset++) {
      for (const product of selected) {
        if (offset > 0 && random() < 0.25) continue
        slots[event.start + offset][product.id] = random() < 0.42 ? 'violated' : 'tight'
      }
    }
  }
  // Keep both severities represented in the default window without a fixed ramp shape.
  const visible = slots.slice(0, 24).filter(slot => Object.keys(slot).length > 0)
  for (const [index, state] of (['tight', 'violated'] as const).entries()) {
    if (!visible.some(slot => Object.values(slot).includes(state))) {
      visible[randomInt(random, 0, visible.length - 1)][items[index].id] = state
    }
  }
  const anchor = floorToSp(nowMs)
  const start = Date.parse(window.start), end = Date.parse(window.end)
  const periods: StripPeriod[] = slots.flatMap((itemStates, index) => {
    const t = anchor + index * SP_MS
    return t >= start && t < end ? [{ spStart: new Date(t).toISOString(), itemStates, actions: [] }] : []
  })
  return { kind: 'strip', id, items, periods }
}
