import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs'
import ts from 'typescript'

const source = fs.readFileSync(new URL('../../src/utils/attachments.ts', import.meta.url), 'utf8')
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
const module = { exports: {} }
new Function('require', 'module', 'exports', output)(() => ({}), module, module.exports)
const { safeAttachments } = module.exports

const file = { url: 'https://firebasestorage.googleapis.com/v0/b/mojammaa-sgs.firebasestorage.app/o/devoirs%2Fx?alt=media&token=t', name: 'consigne.pdf', mime: 'application/pdf', size: 1024 }

test('valid attachments are kept unchanged', () => {
  assert.deepEqual(safeAttachments([file]), [file])
  const { size, ...noSize } = file
  assert.deepEqual(safeAttachments([noSize]), [noSize])
})

test('malformed entries are dropped instead of crashing the screen', () => {
  for (const bad of [null, 42, 'x', { ...file, mime: 42 }, { ...file, mime: undefined }, { ...file, name: { x: 1 } },
    { ...file, name: ['a'] }, { ...file, url: null }]) {
    assert.deepEqual(safeAttachments([bad, file]), [file])
  }
  // Ce que faisaient les écrans avec un mime numérique : TypeError.
  assert.throws(() => [{ ...file, mime: 42 }].filter(a => a.mime?.startsWith('image/')), TypeError)
  assert.doesNotThrow(() => safeAttachments([{ ...file, mime: 42 }]).filter(a => a.mime.startsWith('image/')))
})

test('an invalid size is ignored, the attachment kept', () => {
  for (const size of ['4 Mo', -1, Infinity, NaN, null]) assert.deepEqual(safeAttachments([{ ...file, size }]), [{ ...file, size: undefined }].map(({ size: _, ...rest }) => rest))
})

test('non-array values give an empty list', () => {
  for (const raw of [undefined, null, 'x', 42, { 0: file }]) assert.deepEqual(safeAttachments(raw), [])
})

test('only files from the app bucket are shown or opened (audit 2026-09-28, F7)', () => {
  for (const url of [
    'https://example.invalid/untrusted.jpg',                                  // cas de l'audit
    'https://firebasestorage.googleapis.com/v0/b/other.appspot.com/o/x',       // autre bucket
    'https://firebasestorage.googleapis.com@evil.example/v0/b/mojammaa-sgs.firebasestorage.app/o/x',
    'http://firebasestorage.googleapis.com/v0/b/mojammaa-sgs.firebasestorage.app/o/x',
    'javascript:alert(1)',
    '',
  ]) assert.deepEqual(safeAttachments([{ ...file, url }, file]), [file], url)
})
