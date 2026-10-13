import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parentMessageReplyTarget } from '../helpers/parentMessageReply.mjs'
const message = { type: 'direct', fromRole: 'staff', fromId: 'staff1', fromNom: 'Test' }
test('parent reply to staff routes to the shared administration inbox', () => {
  for (const label of ['Administration', 'إدارة المؤسسة']) {
    assert.deepEqual(parentMessageReplyTarget(message, label), { toType: 'administration', toIds: [], toLabel: label })
  }
})
test('parent reply to admin keeps its direct recipient', () => {
  assert.deepEqual(parentMessageReplyTarget({ ...message, fromRole: 'admin' }, 'Administration'), {
    toType: 'user', toIds: ['staff1'], toLabel: 'Test',
  })
})
test('unreplyable messages never produce a recipient', () => {
  for (const m of [null, { ...message, fromId: '' },
    ...['announcement', 'attendance', 'behavior', 'appointment'].map(type => ({ ...message, type })),
    ...['parent', 'professeur', 'chauffeur', ''].map(fromRole => ({ ...message, fromRole }))]) {
    assert.equal(parentMessageReplyTarget(m, 'Administration'), null)
  }
})
