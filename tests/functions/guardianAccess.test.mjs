import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { affectedGuardianUids, rebuildGuardianAccess } = require('../../functions/guardianAccess')

function fakeFirestore(children) {
  const writes = []
  return {
    writes,
    collection(name) {
      if (name === 'eleves') {
        return {
          where(field, op, uid) {
            assert.equal(field, 'parentUid')
            assert.equal(op, '==')
            return {
              async get() {
                return {
                  docs: children
                    .filter(child => child.parentUid === uid)
                    .map(child => ({
                      id: child.id,
                      get(key) { return child[key] },
                    })),
                }
              },
            }
          },
        }
      }
      assert.equal(name, 'guardianAccess')
      return {
        doc(uid) {
          return {
            async set(data) { writes.push({ type: 'set', uid, data }) },
            async delete() { writes.push({ type: 'delete', uid }) },
          }
        },
      }
    },
  }
}

const FieldValue = { serverTimestamp: () => 'SERVER_TIME' }

assert.deepEqual(
  affectedGuardianUids(
    { parentUid: 'old', classe: '1A' },
    { parentUid: 'new', classe: '2B' },
  ),
  ['old', 'new'],
)
assert.deepEqual(
  affectedGuardianUids(
    { parentUid: 'same', classe: '1A' },
    { parentUid: 'same', classe: '1A' },
  ),
  [],
)
assert.deepEqual(
  affectedGuardianUids(
    { parentUid: 'same', classe: '1A', active: true },
    { parentUid: 'same', classe: '1A', active: false },
  ),
  ['same'],
)

const activeDb = fakeFirestore([
  { id: 'e2', parentUid: 'guardian', classe: '2B' },
  { id: 'e1', parentUid: 'guardian', classe: '1A' },
  { id: 'e3', parentUid: 'guardian', classe: '1A' },
  { id: 'old', parentUid: 'guardian', classe: 'OLD', active: false },
  { id: 'other', parentUid: 'elsewhere', classe: '3C' },
])
const active = await rebuildGuardianAccess(activeDb, 'guardian', FieldValue)
assert.deepEqual(active, { active: true, childCount: 4, classCount: 2 })
assert.deepEqual(activeDb.writes, [{
  type: 'set',
  uid: 'guardian',
  data: {
    uid: 'guardian',
    childIds: ['e1', 'e2', 'e3', 'old'],
    classes: ['1A', '2B'],
    updatedAt: 'SERVER_TIME',
  },
}])

const emptyDb = fakeFirestore([])
const inactive = await rebuildGuardianAccess(emptyDb, 'guardian', FieldValue)
assert.deepEqual(inactive, { active: false, childCount: 0, classCount: 0 })
assert.deepEqual(emptyDb.writes, [{ type: 'delete', uid: 'guardian' }])

console.log('guardianAccess: 5 tests OK')
