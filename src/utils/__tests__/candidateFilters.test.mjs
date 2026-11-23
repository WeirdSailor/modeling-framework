import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyCandidates, candidateCards, matchesCandidateCard, cumulativeAvailability } from '../candidateFilters.ts'

const filters = extra => ({
  typeFilter: new Set(), gspFilter: {}, asFilter: { sr: false, qr: false },
  deRatePct: 0, priceThreshold: '', selectedCard: 'usable', ...extra,
})
const row = (id, extra = {}) => ({
  bmUnitId: id, nationalGridBmUnit: id, fuelType: 'CCGT', gspGroup: '_A',
  priceToMel: 100, qualifies: ['start'],
  mel: 200, pn: 100, ...extra,
})

test('overlapping exclusions are counted once: constraint, then service, then price', () => {
  const rows = classifyCandidates([
    row('A', { gspGroup: '_B', priceToMel: 200 }),
    row('B', { priceToMel: 200 }),
    row('C', { priceToMel: 200 }), row('D'),
  ], filters({ gspFilter: { _B: 'exclude' }, asFilter: { sr: true, qr: true }, priceThreshold: '150', deRatePct: 20 }),
  { A: 'SR', B: 'QR' })
  assert.deepEqual(rows.map(r => r.category), ['constrained', 'contracted', 'highPrice', 'usable'])
  const cards = candidateCards(rows)
  assert.deepEqual(cards.total, { count: 4, sum: 400 })
  assert.deepEqual(cards.usable, { count: 1, sum: 80 })
  assert.deepEqual(cards.derated, { count: 1, sum: 20 })
  assert.equal(cards.total.sum, cards.constrained.sum + cards.contracted.sum + cards.highPrice.sum + cards.derated.sum + cards.usable.sum)
})

test('type filters affect every card; GSP includes and excludes classify remaining rows', () => {
  const rows = classifyCandidates([row('A'), row('B', { gspGroup: '_B' }), row('C', { fuelType: 'OCGT' })],
    filters({ typeFilter: new Set(['CCGT']), gspFilter: { _A: 'include', _B: 'exclude' } }), {})
  assert.deepEqual(rows.map(r => [r.bmUnitId, r.category]), [['A', 'usable'], ['B', 'constrained']])
  assert.equal(candidateCards(rows).total.count, 2)
})

test('card selection returns the corresponding rows, including inspectable exclusions', () => {
  const rows = classifyCandidates([row('A'), row('B', { priceToMel: 200 })], filters({ priceThreshold: '150' }), {})
  for (const [card, expected] of [['total', ['A', 'B']], ['highPrice', ['B']], ['usable', ['A']], ['derated', ['A']], ['contracted', []]]) {
    assert.deepEqual(rows.filter(r => matchesCandidateCard(r, card)).map(r => r.bmUnitId), expected)
  }
})

test('cleared/zero price caps do not exclude units; equality at cap remains usable', () => {
  for (const priceThreshold of ['', '0', '100']) {
    const rows = classifyCandidates([row('A')], filters({ priceThreshold }), {})
    assert.equal(rows[0].category, 'usable')
  }
})

test('AVAIL. is MEL minus PN for running and offline units, independent of action types', () => {
  const rows = classifyCandidates([
    row('A', { mel: 200, pn: 70, qualifies: ['deload', 'desync', 'capacity'] }),
    row('B', { mel: 300, pn: 0, qualifies: ['start'] }),
    row('C', { mel: 200, pn: 200 }),
    row('D', { mel: 200, pn: 220 }),
  ], filters(), {})
  assert.deepEqual(rows.map(r => r.availableMw), [130, 300, 0, -20])
  assert.equal(candidateCards(rows).total.sum, 410)
})

test('de-rating reduces usable headroom while AVAIL. stays MEL minus PN', () => {
  const candidate = row('A')
  for (const [deRatePct, expected] of [[0, 100], [25, 75], [100, 0], [200, 0], [-20, 100]]) {
    const result = classifyCandidates([candidate], filters({ deRatePct }), {})[0]
    assert.equal(result.usableMw, expected)
    assert.equal(result.availableMw, 100)
  }
  assert.equal(candidate.mel, 200)
  assert.equal(candidate.pn, 100)
})

test('empty candidate sets produce zero cards', () => {
  assert.ok(Object.values(candidateCards([])).every(card => card.count === 0 && card.sum === 0))
})

test('CUMUL follows the displayed sort order and resets for a filtered list', () => {
  const rows = classifyCandidates([
    row('A', { mel: 200, pn: 50 }), row('B', { mel: 200, pn: 100 }),
    row('C', { mel: 200, pn: 175, priceToMel: 200 }),
  ], filters({ priceThreshold: '150' }), {})
  assert.deepEqual(cumulativeAvailability(rows).map(r => r.cumulativeMw), [150, 250, 275])
  const visible = rows.filter(r => matchesCandidateCard(r, 'usable')).sort((a, b) => a.availableMw - b.availableMw)
  const displayed = cumulativeAvailability(visible)
  assert.deepEqual(displayed.map(r => [r.bmUnitId, r.cumulativeMw]), [['B', 100], ['A', 250]])
  assert.equal(displayed.at(-1).cumulativeMw, candidateCards(rows).usable.sum)
  assert.equal('cumulativeMw' in rows[0], false)
  assert.deepEqual(cumulativeAvailability([]), [])
})
