import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs'
import ts from 'typescript'

function load(file, deps = {}) {
  const code = ts.transpileModule(fs.readFileSync(new URL('../../src/' + file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const module = { exports: {} }
  new Function('require', 'module', 'exports', code)(id => {
    if (!(id in deps)) throw Error('Unexpected dependency: ' + id)
    return deps[id]
  }, module, module.exports)
  return module.exports
}
const summaryModule = load('utils/parent-home-summary.ts', { './parent-alert-history': load('utils/parent-alert-history.ts') })
const base = { childId: 'synthetic-A', today: '2026-09-22', monthKey: '2026-09', homework: [], submissions: [], absences: [] }
test('homework priorities exclude history, missing deadlines and completed work, but keep zero completions', () => {
  const result = summaryModule.summarizeParentHomeActivity({ ...base,
    homework: [{ id: 'old', dateLimite: '2026-09-21' }, { id: 'today', dateLimite: base.today },
      { id: 'done', dateLimite: base.today }, { id: 'future', dateLimite: '2026-09-23' }, { id: 'missing', dateLimite: '' }],
    submissions: [{ homeworkId: 'done', eleveId: base.childId, status: 'submitted_late' },
      { homeworkId: 'today', eleveId: 'synthetic-B', status: 'graded' }],
  })
  assert.equal(result.pendingHomework, 2)
  assert.equal(result.dueToday, 1)
  assert.equal(result.completedHomework, 1)
  assert.equal(result.totalHomework, 3)
})
test('every homework status has the intended action state', () => {
  for (const status of ['submitted', 'submitted_late', 'graded', 'excused', 'pending', 'not_done', 'not_submitted']) {
    const result = summaryModule.summarizeParentHomeActivity({ ...base,
      homework: [{ id: 'work', dateLimite: base.today }],
      submissions: [{ homeworkId: 'work', eleveId: base.childId, status }],
    })
    assert.equal(result.pendingHomework, ['pending', 'not_done', 'not_submitted'].includes(status) ? 1 : 0, status)
  }
})
test('absences count unique days, scope the child/month, exclude future dates and preserve unexcused sessions', () => {
  const a = (date, extra = {}) => ({ eleveId: base.childId, date, statut: 'absent', ...extra })
  const result = summaryModule.summarizeParentHomeActivity({ ...base, absences: [
    a(base.today), a(base.today, { justified: true }), a('2026-09-21', { justified: true }),
    a('2026-09-20', { statut: 'retard' }), a('2026-08-31'), a('2026-09-23'),
    a('2026-09-19', { eleveId: 'synthetic-B' }),
  ] })
  assert.equal(result.absenceDays, 2)
  assert.equal(result.unjustifiedDays, 1)
})

function setup() {
  const cells = []; let cursor = 0; let effects = []
  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]))
  const react = {
    useState(initial) { const i = cursor++; if (!cells[i]) cells[i] = { value: initial }; return [cells[i].value, next => { cells[i].value = typeof next === 'function' ? next(cells[i].value) : next }] },
    useEffect(fn, deps) { const i = cursor++; if (!same(cells[i]?.deps, deps)) effects.push(() => { cells[i]?.cleanup?.(); cells[i] = { deps, cleanup: fn() } }) },
  }
  const absences = []; const homework = []; const submissions = []
  const subscribe = list => (...args) => {
    const item = { success: args.at(-2), failure: args.at(-1), stopped: false }; list.push(item)
    return () => { item.stopped = true }
  }
  const { useParentHomeActivity } = load('hooks/use-parent-home-activity.ts', {
    react,
    'firebase/firestore': { collection: () => ({}), where: () => ({}), query: () => ({}), onSnapshot: subscribe(homework) },
    '../config/firebase': { db: {} },
    '../services/absencesService': { subscribeAbsencesForEleves: subscribe(absences) },
    '../services/homeworkSubmissionsService': { subscribeParentHomeworkSubmissions: subscribe(submissions) },
    '../utils/academicPeriod': { currentAcademicPeriod: () => ({ academicYear: '2026-2027', monthKey: '2026-09' }) },
    '../utils/parent-home-summary': summaryModule,
  })
  return { absences, homework, submissions,
    render(child = base.childId, uid = 'synthetic-parent', today = base.today) {
      cursor = 0; effects = []; const result = useParentHomeActivity(uid, child, 'synthetic-class', today)
      effects.forEach(effect => effect()); return result
    },
  }
}
test('actual hook waits for both homework streams and distinguishes empty, loading, error and recovery', () => {
  const h = setup(); assert.equal(h.render().homeworkReady, false)
  h.homework[0].success({ docs: [] })
  assert.equal(h.render().homeworkReady, false)
  h.submissions[0].success([]); h.absences[0].success([])
  assert.equal(h.render().homeworkReady, true)
  assert.equal(h.render().attendanceReady, true)
  h.submissions[0].failure(new Error('denied'))
  assert.equal(h.render().homeworkReady, false)
  assert.equal(h.render().homeworkError, true)
  h.render().retry(); h.render()
  assert.equal(h.render().homeworkError, false)
  assert.equal(h.render().homeworkReady, false)
  h.homework[1].success({ docs: [] }); h.submissions[1].success([])
  assert.equal(h.render().homeworkReady, true)
})
test('switching child/account hides stale data immediately and ignores late subscription callbacks', () => {
  const h = setup(); h.render()
  h.absences[0].success([{ eleveId: base.childId, date: base.today, statut: 'absent' }])
  assert.equal(h.render().absenceDays, 1)
  assert.equal(h.render('synthetic-B').attendanceReady, false)
  assert.equal(h.absences[0].stopped, true)
  h.absences[0].success([{ eleveId: base.childId, date: base.today, statut: 'absent' }])
  assert.equal(h.render('synthetic-B').absenceDays, 0)
  h.absences[1].success([])
  assert.equal(h.render('synthetic-B').attendanceReady, true)
  assert.equal(h.render('synthetic-B', '').attendanceReady, false)
  assert.equal(h.absences[1].stopped, true)
})
test('midnight recomputes upcoming homework without retaining yesterday’s urgency', () => {
  const h = setup(); h.render()
  const data = { dateLimite: base.today }
  h.homework[0].success({ docs: [{ id: 'today', data: () => data, get: field => data[field] }] })
  h.submissions[0].success([])
  assert.equal(h.render().dueToday, 1)
  assert.equal(h.render(base.childId, 'synthetic-parent', '2026-09-23').dueToday, 0)
})
