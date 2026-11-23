import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CANDIDATE_GROUPS, candidateGroupAction, matchesCandidateGroup } from '../../components/schedule/candidateGroups.ts'
import { classifyCandidates, candidateCards, matchesCandidateCard } from '../candidateFilters.ts'

const row = (id, extra = {}) => ({
  bmUnitId: id, fuelType: 'CCGT', running: true, pn: 60, mel: 100, sel: 20,
  inertiaGvas: 5, qualifies: ['deload', 'desync', 'capacity'], gspGroup: '_A', priceToMel: 100,
  ...extra,
})
const off = row('OFF', { running: false, pn: 0, qualifies: ['start'] })
const running = row('ON')
const atSel = row('AT_SEL', { pn: 20, qualifies: ['desync', 'capacity'] })
const wind = row('WIND', { fuelType: 'WIND', inertiaGvas: 0, sel: 0, qualifies: ['desync'] })
const battery = row('BESS', { fuelType: 'BATTERY', inertiaGvas: 0 })

test('Type A has the requested candidate groups without Model capacity or a separate Recovery option', () => {
  assert.deepEqual(CANDIDATE_GROUPS.map(group => group.label), [
    'Syncs to SEL', 'Deload to SEL', 'Desyncs', 'All Units', 'Inertia',
    'Positive Recovery Reserve', 'Negative Recovery Reserve', 'Low Response', 'High Response', 'Constrained Pullback',
  ])
})

test('Syncs, Deload and Desyncs retain the existing action eligibility rules', () => {
  const rows = [off, running, atSel]
  const ids = group => rows.filter(r => matchesCandidateGroup(r, group)).map(r => r.bmUnitId)
  assert.deepEqual(ids('syncs'), ['OFF'])
  assert.deepEqual(ids('deload'), ['ON'])
  assert.deepEqual(ids('desyncs'), ['ON', 'AT_SEL'])
})

test('All Units includes mixed states and fuel types; Inertia uses the existing contribution estimate', () => {
  for (const r of [off, running, wind, battery]) assert.ok(matchesCandidateGroup(r, 'all'))
  assert.ok(matchesCandidateGroup(off, 'inertia'))
  assert.ok(matchesCandidateGroup(running, 'inertia'))
  assert.ok(!matchesCandidateGroup(wind, 'inertia'))
  assert.ok(!matchesCandidateGroup(battery, 'inertia'))
})

test('reserve and response groups distinguish upward headroom from reducible output', () => {
  assert.ok(matchesCandidateGroup(off, 'positiveRecovery'))
  assert.ok(!matchesCandidateGroup(off, 'negativeRecovery'))
  assert.ok(matchesCandidateGroup(running, 'positiveRecovery'))
  assert.ok(matchesCandidateGroup(running, 'negativeRecovery'))
  assert.ok(!matchesCandidateGroup(row('FULL', { pn: 100 }), 'positiveRecovery'))
  assert.ok(!matchesCandidateGroup(atSel, 'negativeRecovery'))
  assert.ok(matchesCandidateGroup(atSel, 'lowResponse'))
  assert.ok(!matchesCandidateGroup(atSel, 'highResponse'))
  assert.ok(!matchesCandidateGroup(off, 'lowResponse'))
  assert.ok(!matchesCandidateGroup(wind, 'lowResponse'))
  assert.ok(matchesCandidateGroup(running, 'highResponse'))
})

test('Constrained Pullback uses the existing wind-curtailment candidate family', () => {
  assert.ok(matchesCandidateGroup(wind, 'pullback'))
  assert.ok(!matchesCandidateGroup(running, 'pullback'))
  assert.ok(!matchesCandidateGroup({ ...wind, running: false, pn: 0 }, 'pullback'))
})

test('automatic assignment remains separate and never assigns Model capacity in Type A', () => {
  assert.equal(candidateGroupAction(off, 'syncs'), 'start')
  assert.equal(candidateGroupAction(running, 'deload'), 'deload')
  assert.equal(candidateGroupAction(running, 'desyncs'), 'desync')
  assert.equal(candidateGroupAction(off, 'all'), 'start')
  assert.equal(candidateGroupAction(running, 'all'), 'deload')
  assert.equal(candidateGroupAction(atSel, 'all'), 'desync')
  assert.equal(candidateGroupAction(wind, 'pullback'), 'desync')
  assert.equal(candidateGroupAction(atSel, 'inertia'), null, 'do not remove inertia as a fallback')
  assert.equal(candidateGroupAction(atSel, 'positiveRecovery'), null, 'do not reduce reserve as a fallback')
  assert.equal(candidateGroupAction(row('CAPACITY_ONLY', { qualifies: ['capacity'] }), 'all'), null)
  for (const group of CANDIDATE_GROUPS) {
    for (const r of [off, running, atSel, wind, battery]) {
      const action = candidateGroupAction(r, group.id)
      assert.notEqual(action, 'capacity')
      if (action) assert.ok(r.qualifies.includes(action))
    }
  }
})

test('candidate groups scope card totals and keep filtered exclusions inspectable', () => {
  const rows = [off, running, row('BLOCKED', { gspGroup: '_B' }), battery]
  const filters = {
    typeFilter: new Set(), gspFilter: { _B: 'exclude' }, asFilter: { sr: false, qr: false },
    deRatePct: 25, priceThreshold: '', selectedCard: 'usable',
  }
  const classified = classifyCandidates(rows, filters, {})
  const scoped = classified.filter(r => matchesCandidateGroup(r, 'inertia'))
  const cards = candidateCards(scoped)
  assert.equal(cards.total.count, 3)
  assert.equal(cards.total.sum, 180)
  assert.equal(cards.constrained.count, 1)
  assert.equal(cards.usable.sum, 105)
  assert.deepEqual(scoped.filter(r => matchesCandidateCard(r, 'constrained')).map(r => r.bmUnitId), ['BLOCKED'])
  assert.deepEqual(scoped.filter(r => matchesCandidateCard(r, 'usable')).map(r => r.bmUnitId), ['OFF', 'ON'])
})
