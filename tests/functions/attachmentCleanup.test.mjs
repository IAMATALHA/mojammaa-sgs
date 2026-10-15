// C08 : fichiers d'un devoir/d'une ressource supprimé(e). Base simulée, aucun appel réel.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { storagePath, orphanedAttachments, deleteOrphanedAttachments } = require('../../functions/attachmentCleanup.js')

const BUCKET = 'mojammaa-sgs.firebasestorage.app'
const url = path => `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(path)}?alt=media&token=t`
const fakeDb = siblings => ({ collection: () => ({ where: () => ({ get: async () => ({
  docs: siblings.map(([id, attachments]) => ({ id, get: () => attachments })),
}) }) }) })

test('storagePath decodes the object path of a download URL', () => {
  assert.deepEqual(storagePath(url('ressources/t1/1_a.pdf')), { bucket: BUCKET, path: 'ressources/t1/1_a.pdf' })
  assert.equal(storagePath('https://evil.example/x'), null)
})

test('only files in the author folder and cited nowhere else are deleted', async () => {
  const data = { teacherId: 't1', attachments: [
    { url: url('ressources/t1/1_own.pdf') },
    { url: url('ressources/t1/2_shared.pdf') },
    { url: url('ressources/t2/3_colleague.pdf') },
    { url: url('devoirs/t1/4_other_folder.pdf') },
    { url: url('ressources/t1/sub/5_nested.pdf') },
    { url: 'https://youtube.com/watch?v=x' },
  ] }
  const db = fakeDb([['self', data.attachments], ['other-class', [{ url: url('ressources/t1/2_shared.pdf') }]]])
  const files = await orphanedAttachments(db, { collection: 'ressources', folder: 'ressources', data, docId: 'self' })
  assert.deepEqual(files.map(f => f.path), ['ressources/t1/1_own.pdf'])
})

test('deletion stays in the project bucket and tolerates missing files', async () => {
  const deleted = []
  const storage = { bucket: name => ({ name: name || BUCKET, file: path => ({ delete: async opts => { deleted.push([name || BUCKET, path, opts.ignoreNotFound]) } }) }) }
  const data = { teacherId: 't1', attachments: [
    { url: url('ressources/t1/1_own.pdf') },
    { url: `https://firebasestorage.googleapis.com/v0/b/other-bucket/o/${encodeURIComponent('ressources/t1/x.pdf')}` },
  ] }
  assert.equal(await deleteOrphanedAttachments(fakeDb([]), storage, { collection: 'ressources', folder: 'ressources', data, docId: 'self' }), 1)
  assert.deepEqual(deleted, [[BUCKET, 'ressources/t1/1_own.pdf', true]])
})
