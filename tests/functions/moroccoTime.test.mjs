import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { moroccoDate, moroccoParts } = require('../../functions/lib/moroccoTime.js')
const { validateLesson } = require('../../functions/attendanceSubmission.js')
const { slotTime } = require('../../functions/appointments.js')
const { lessonKey } = require('../../functions/lib/attendanceProtocol.js')

const clock = iso => { const p = moroccoParts(new Date(iso)); return `${moroccoDate(new Date(iso))} ${p.hour}:${p.minute}` }

test('historic rules before the decree, GMT from 20/09/2026 02:00 local', () => {
  assert.equal(clock('2026-02-25T12:00:00Z'), '2026-02-25 12:00') // Ramadan : GMT
  assert.equal(clock('2026-06-01T12:00:00Z'), '2026-06-01 13:00') // GMT+1
  assert.equal(clock('2026-09-20T00:59:00Z'), '2026-09-20 01:59')
  assert.equal(clock('2026-09-20T01:00:00Z'), '2026-09-20 01:00') // retour à GMT
  assert.equal(clock('2026-10-05T10:00:00Z'), '2026-10-05 10:00')
})

test('late evening stays on the same local day after the decree', () => {
  assert.equal(moroccoDate(new Date('2026-09-27T23:30:00Z')), '2026-09-27')
})

test('a call cannot open before the lesson starts (GMT)', () => {
  const lesson = { day: 'friday', classe: '1APIC-1', startTime: '09:15', endTime: '10:15', durationMin: 60 }
  const run = iso => validateLesson('teacher', { date: '2026-10-02', lessonKey: lessonKey(lesson) },
    { role: 'professeur', classes: ['1APIC-1'] }, { weeklySlots: [lesson] }, new Date(iso))
  assert.throws(() => run('2026-10-02T08:30:00Z'), { code: 'failed-precondition' })
  assert.equal(run('2026-10-02T09:20:00Z').slot.startTime, '09:15')
})

test('appointment slots map local time to the right instant', () => {
  assert.equal(slotTime('2026-10-05', '10:00'), Date.parse('2026-10-05T10:00:00Z'))
  assert.equal(slotTime('2026-06-01', '10:00'), Date.parse('2026-06-01T09:00:00Z'))
})
