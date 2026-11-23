import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scheduleAvailability } from '../scheduleAvailability.ts'
import { classifyCandidates, candidateCards, cumulativeAvailability } from '../candidateFilters.ts'

const period = (settlementPeriod, pn, mel = 200) => ({ settlementPeriod, pn: { A: pn }, mel: { A: mel } })
const periods = [period(1, 190), period(2, 50), period(3, 120), period(4, 195)]

test('From and To bound availability inclusively and exclude periods outside the window', () => {
  assert.deepEqual(scheduleAvailability('A', periods, { fromPeriod: 2, toPeriod: 2 }), { mel: 200, pn: 50 })
  assert.deepEqual(scheduleAvailability('A', periods, { fromPeriod: 2, toPeriod: 3 }), { mel: 200, pn: 120 })
  assert.deepEqual(scheduleAvailability('A', periods, { fromPeriod: 3, toPeriod: 4 }), { mel: 200, pn: 195 })
})

test('uses the MEL and PN pair with least headroom, including changing MEL', () => {
  assert.deepEqual(scheduleAvailability('A', [period(1, 150, 300), period(2, 80, 100)], { fromPeriod: 1, toPeriod: 2 }), { mel: 100, pn: 80 })
})

test('handles missing PN, missing MEL, and empty ranges using existing slot fallbacks', () => {
  assert.deepEqual(scheduleAvailability('A', [{ settlementPeriod: 1, pn: {}, mel: { A: 200 } }], { fromPeriod: 1, toPeriod: 1 }), { mel: 200, pn: 0 })
  assert.deepEqual(scheduleAvailability('A', [{ settlementPeriod: 1, pn: { A: 50 }, mel: {} }], { fromPeriod: 1, toPeriod: 1 }), { mel: 50, pn: 50 })
  assert.equal(scheduleAvailability('A', periods, { fromPeriod: 5, toPeriod: 6 }), undefined)
})

test('editing To updates AVAIL., CUMUL, and card totals from the same window values', () => {
  const filters = { typeFilter: new Set(), gspFilter: {}, asFilter: { sr: false, qr: false }, deRatePct: 20, priceThreshold: '' }
  for (const [toPeriod, expected] of [[2, 150], [3, 80], [4, 5]]) {
    const values = scheduleAvailability('A', periods, { fromPeriod: 2, toPeriod })
    const rows = classifyCandidates([{ bmUnitId: 'A', fuelType: 'CCGT', gspGroup: '_A', priceToMel: 0, ...values }], filters, {})
    assert.equal(rows[0].availableMw, expected)
    assert.equal(cumulativeAvailability(rows)[0].cumulativeMw, expected * 0.8)
    assert.equal(candidateCards(rows).total.sum, expected)
    assert.equal(candidateCards(rows).usable.sum, expected * 0.8)
  }
})
