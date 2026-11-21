import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  workingPlanAsDraft, workingPlanDraftId, toModellingActions, WORKING_PLAN_COLOR, WORKING_PLAN_NAME,
} from '../workingPlan.ts'

const row = (bmUnitId, extra = {}) => ({
  bmUnitId, actionType: 'start', fromPeriod: 4, toPeriod: 8, outputLevel: 100,
  reasonCode: 'MARGIN', timestamp: new Date(0), ...extra,
})

test('workingPlanDraftId is namespaced per user', () => {
  assert.equal(workingPlanDraftId('NSE'), 'wp:NSE')
})

test('workingPlanAsDraft returns null for an empty or missing plan', () => {
  assert.equal(workingPlanAsDraft(undefined, 'NSE'), null)
  assert.equal(workingPlanAsDraft([], 'NSE'), null)
})

test('workingPlanAsDraft builds a draft-status overlay without notes', () => {
  const d = workingPlanAsDraft([row('A', { note: 'hi' }), row('B', { fromPeriod: 2 })], 'OSM')
  assert.equal(d.id, 'wp:OSM')
  assert.equal(d.name, WORKING_PLAN_NAME)
  assert.equal(d.color, WORKING_PLAN_COLOR)
  assert.equal(d.status, 'draft')
  assert.equal(d.ownerId, 'OSM')
  assert.equal(d.fromPeriod, 2)
  assert.equal(d.actions.length, 2)
  assert.equal('note' in d.actions[0], false)
})

test('toModellingActions strips notes into unitNotes', () => {
  const { actions, unitNotes } = toModellingActions([row('A', { note: 'keep' }), row('B', { note: '' })])
  assert.deepEqual(unitNotes, { A: 'keep' })
  assert.equal(actions.every(a => !('note' in a)), true)
})
