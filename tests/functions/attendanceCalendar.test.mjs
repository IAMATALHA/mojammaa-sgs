import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import ts from 'typescript'
const require = createRequire(import.meta.url)
const { validateLesson } = require('../../functions/attendanceSubmission.js')
const { lessonKey, sessionCode } = require('../../functions/lib/attendanceProtocol.js')
const source = fs.readFileSync(new URL('../../src/utils/scheduleSession.ts', import.meta.url), 'utf8')
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
const front = {}
new Function('require', 'exports', output)(() => ({}), front)
const user = { role: 'professeur', classes: ['1APIC-1'] }
const slot = startTime => ({ day: 'friday', classe: '1APIC-1', startTime, endTime: startTime === '08:15' ? '09:15' : '10:15', durationMin: 60 })
const now = new Date('2026-09-11T10:00:00Z')
test('new official periods resolve identically on server and mobile', () => {
  for (const [time, expected] of [['08:15', 'S1'], ['09:15', 'S2'], ['10:30', 'S3'], ['11:30', 'S4'], ['13:00', 'S5'], ['14:00', 'S6'], ['08:30', 'S1'], ['09:30', 'S2']]) {
    assert.equal(sessionCode(slot(time)), expected)
    assert.equal(front.resolveScheduleSessionCode(slot(time)), expected)
    assert.equal(front.scheduleLessonKey(slot(time)), lessonKey(slot(time)))
  }
})
test('authorized calls at 08:15 and 09:15 load after the start', () => {
  for (const time of ['08:15', '09:15']) {
    const lesson = slot(time)
    assert.equal(validateLesson('teacher', { date: '2026-09-11', lessonKey: lessonKey(lesson) }, user, { weeklySlots: [lesson] }, now).seance, sessionCode(lesson))
  }
})
test('missing schedules and unassigned old AC classes remain refused', () => {
  for (const lesson of [slot('08:15'), { ...slot('08:15'), classe: '1AC-4' }]) {
    assert.throws(() => validateLesson('teacher', { date: '2026-09-11', lessonKey: lessonKey(lesson) }, user,
      lesson.classe === '1AC-4' ? { weeklySlots: [lesson] } : null, now), { code: 'permission-denied' })
  }
})
test('early call remains refused and explicit session retains priority', () => {
  const lesson = slot('08:15')
  assert.throws(() => validateLesson('teacher', { date: '2026-09-11', lessonKey: lessonKey(lesson) }, user, { weeklySlots: [lesson] }, new Date('2026-09-11T07:14:00Z')), { code: 'failed-precondition' })
  assert.equal(sessionCode({ ...lesson, seance: 's3' }), 'S3')
  assert.equal(sessionCode(slot('07:01')), null)
})
