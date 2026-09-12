import assert from 'node:assert/strict'
import fs from 'node:fs'
import { test } from 'node:test'
import ts from 'typescript'

const source = fs.readFileSync(new URL('../../src/utils/teacher-class-subjects.ts', import.meta.url), 'utf8')
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText
const mod = { exports: {} }
new Function('exports', output)(mod.exports)
const { teacherClassSubjects } = mod.exports

test('real classes retained; stale schedule classes never become query targets', () => {
  const assigned = ['1APIC-1', '2APIC-1', '3APIC-3']
  const result = teacherClassSubjects(assigned, [
    { classe: '1AC-4', subject: 'Maths' },
    { classe: '1AC-3', subject: 'Maths' },
  ])
  assert.deepEqual([...result.keys()], assigned)
  assert.equal(result.has('1AC-4'), false)
  assert.equal(result.has('1AC-3'), false)
})

test('authorized schedule subjects are retained without duplicates', () => {
  const result = teacherClassSubjects(['1APIC-1', '1APIC-1'], [
    { classe: '1APIC-1', subject: 'Maths' },
    { classe: '1APIC-1', subject: 'Maths' },
    { classe: '1APIC-1' },
  ])
  assert.equal(result.size, 1)
  assert.deepEqual([...result.get('1APIC-1')], ['Maths'])
})

test('missing schedule does not hide assigned classes', () => {
  assert.deepEqual([...teacherClassSubjects(['2APIC-1']).keys()], ['2APIC-1'])
})

test('schedule alone never grants a class', () => {
  assert.equal(teacherClassSubjects([], [{ classe: '1AC-4' }]).size, 0)
})
