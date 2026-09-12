import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

function compile(sourcePath, requireShim = () => ({})) {
  const output = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: sourcePath,
  }).outputText
  const moduleShim = { exports: {} }
  new Function('require', 'module', 'exports', output)(requireShim, moduleShim, moduleShim.exports)
  return moduleShim.exports
}

const courseSchedulePath = path.resolve(here, '../../src/utils/courseSchedule.ts')
const courseSchedule = compile(courseSchedulePath)
const scheduleSessionPath = path.resolve(here, '../../src/utils/scheduleSession.ts')
const scheduleSession = compile(
  scheduleSessionPath,
  request => request === './courseSchedule' ? courseSchedule : {},
)

const {
  findLatestAttendanceOpenSlot,
  isScheduleSlotAttendanceOpen,
} = scheduleSession

const s1 = {
  day: 'tuesday', startTime: '08:30', endTime: '09:30',
  classe: '2APIC-4', subject: 'Test',
}
const s2 = {
  day: 'tuesday', startTime: '09:30', endTime: '10:30',
  classe: '2APIC-4', subject: 'Test',
}

assert.equal(
  isScheduleSlotAttendanceOpen(s1, new Date(2026, 8, 1, 8, 29)),
  false,
  'S1 doit rester fermée avant 08:30',
)
assert.equal(
  isScheduleSlotAttendanceOpen(s1, new Date(2026, 8, 1, 8, 30)),
  true,
  'S1 doit s’ouvrir exactement à 08:30',
)
assert.equal(
  isScheduleSlotAttendanceOpen(s1, new Date(2026, 8, 1, 12, 0)),
  true,
  'S1 doit rester disponible après sa fin',
)
assert.equal(
  isScheduleSlotAttendanceOpen(s1, new Date(2026, 8, 2, 8, 30)),
  false,
  'une séance d’un autre jour ne doit pas être ouverte',
)
assert.equal(
  findLatestAttendanceOpenSlot([s1, s2], new Date(2026, 8, 1, 9, 29)),
  s1,
  'avant S2, la dernière séance ouverte doit rester S1',
)
assert.equal(
  findLatestAttendanceOpenSlot([s1, s2], new Date(2026, 8, 1, 10, 45)),
  s2,
  'après S2, la dernière séance ouverte doit être S2',
)

console.log('scheduleSession : appel fermé avant, ouvert pendant et après')
