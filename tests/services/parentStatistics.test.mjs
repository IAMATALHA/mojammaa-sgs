import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs'
import ts from 'typescript'

function load(file, dependencies = {}) {
  const code = ts.transpileModule(fs.readFileSync(new URL('../../src/' + file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const module = { exports: {} }
  new Function('require', 'module', 'exports', code)(id => {
    if (!(id in dependencies)) throw Error('Unexpected dependency: ' + id)
    return dependencies[id]
  }, module, module.exports)
  return module.exports
}
const { formatParentAverage, behaviorInPeriod } = load('utils/parentStatistics.ts')
test('missing grades are not zero; primary and secondary scales are preserved', () => {
  assert.equal(formatParentAverage(null), '—')
  assert.equal(formatParentAverage({ generalAvg: NaN, bareme: 20 }), '—')
  assert.equal(formatParentAverage({ generalAvg: 11, bareme: 10 }), '—')
  assert.equal(formatParentAverage({ generalAvg: 0, bareme: 10 }), '0.0 / 10')
  assert.equal(formatParentAverage({ generalAvg: 7.5, bareme: 10 }), '7.5 / 10')
  assert.equal(formatParentAverage({ generalAvg: 15, bareme: 20 }), '15.0 / 20')
})
test('behavior filters child, cancellation, semester and school year boundaries', () => {
  const entry = (date, extra = {}) => ({ eleveId: 'synthetic-A', date, ...extra })
  const rows = [entry('2025-08-31'), entry('2025-09-01'), entry('2026-01-31'), entry('2026-02-01'), entry('2026-08-31'), entry('2026-09-01'), entry('2025-10-01', { cancelledAt: {} }), entry('2025-10-01', { eleveId: 'synthetic-B' })]
  const period = { academicYear: '2025-2026', semestre: 'S1' }
  assert.deepEqual(behaviorInPeriod(rows, 'synthetic-A', period, 'semester'), rows.slice(1, 3))
  assert.deepEqual(behaviorInPeriod(rows, 'synthetic-A', { ...period, semestre: 'S2' }, 'semester'), rows.slice(3, 5))
  assert.deepEqual(behaviorInPeriod(rows, 'synthetic-A', period, 'academicYear'), rows.slice(1, 5))
})

// Deterministic effect harness: exercise the actual hook with controlled subscriptions.
function setup() {
  const cells = []; let cursor = 0; let effects = []
  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]))
  const react = {
    useState(initial) { const i = cursor++; if (!cells[i]) cells[i] = { value: typeof initial === 'function' ? initial() : initial }; return [cells[i].value, next => { cells[i].value = typeof next === 'function' ? next(cells[i].value) : next }] },
    useMemo(fn, deps) { const i = cursor++; if (!same(cells[i]?.deps, deps)) cells[i] = { value: fn(), deps }; return cells[i].value },
    useEffect(fn, deps) { const i = cursor++; if (!same(cells[i]?.deps, deps)) effects.push(() => { cells[i]?.cleanup?.(); cells[i] = { deps, cleanup: fn() } }) },
  }
  const subscriptions = []; const aggregates = []; let coefficients
  const { useParentNotes } = load('hooks/useParentNotes.ts', {
    react,
    '../services/notesService': {
      subscribeNotesForEleve(id, period, success, failure) { subscriptions.push({ id, period, success, failure }); return () => {} },
      getClassStats(classe) { return new Promise(resolve => aggregates.push({ classe, resolve })) },
    },
    '../services/coefficientsService': { subscribeCoefficients(success, failure) { coefficients = { success, failure }; return () => {} }, makeCoefOf: () => subject => subject === 'Maths' ? 3 : 1 },
    '../utils/academicPeriod': { currentAcademicPeriod: () => ({ academicYear: '2025-2026', semestre: 'S1', monthKey: '2025-10' }) },
    '../utils/gradeScale': load('utils/gradeScale.ts'),
  })
  return {
    render(id = 'synthetic-A', classe = '3AEP-A', scope = 'semester') { cursor = 0; effects = []; const result = useParentNotes(id, classe, scope, '3AEP'); effects.forEach(fn => fn()); return result },
    subscriptions, aggregates, coefficients: () => coefficients,
  }
}
const notes = [
  { matiere: 'Maths', note: 8, bareme: 10, cycle: 'primaire', semestre: 'S1' },
  { matiere: 'Français', note: 12, bareme: 20, cycle: 'primaire', semestre: 'S1' },
]
test('actual report waits for coefficients and computes weighted mixed-scale average', () => {
  const h = setup(); assert.equal(h.render().loading, true)
  h.subscriptions[0].success(notes)
  assert.equal(h.render().report, null)
  h.coefficients().success({})
  const result = h.render()
  assert.equal(result.loading, false)
  assert.equal(result.report.bareme, 10)
  assert.equal(result.report.generalAvg, 7.5)
  h.coefficients().failure(new Error('unavailable'))
  assert.equal(h.render().report, null)
  assert.ok(h.render().error)
})
test('child/period switches hide stale notes and late responses cannot overwrite current results', async () => {
  const h = setup(); h.render(); h.coefficients().success({}); h.subscriptions[0].success(notes)
  assert.ok(h.render().report)
  assert.equal(h.render('synthetic-B', '4AEP-B').report, null)
  h.subscriptions[0].success(notes)
  assert.equal(h.render('synthetic-B', '4AEP-B').report, null)
  h.subscriptions[1].success([])
  assert.equal(h.render('synthetic-B', '4AEP-B').loading, false)
  h.aggregates[0].resolve({ bareme: 20, subjectAvgs: {}, studentAvgs: [] }); await Promise.resolve()
  h.subscriptions[1].success(notes)
  assert.equal(h.render('synthetic-B', '4AEP-B').report.bareme, 10)
  assert.equal(h.render('synthetic-B', '4AEP-B', 'academicYear').report, null)
  h.subscriptions[2].failure(new Error('permission-denied'))
  assert.equal(h.render('synthetic-B', '4AEP-B', 'academicYear').report, null)
  assert.ok(h.render('synthetic-B', '4AEP-B', 'academicYear').error)
  assert.equal(h.render('').report, null)
})
test('class comparison uses the same weights and incomplete aggregates stay hidden', async () => {
  const h = setup(); h.render(); h.coefficients().success({}); h.subscriptions[0].success(notes)
  h.aggregates[0].resolve({ bareme: 10, subjectAvgs: { Maths: 6, Français: 8 }, studentAvgs: [] }); await Promise.resolve()
  const report = h.render().report
  assert.equal(report.generalAvg, 7.5)
  assert.equal(report.classGeneralAvg, 6.5)
  assert.equal(report.hasClassComparison, true)
  h.render('synthetic-B', '4AEP-B'); h.subscriptions[1].success(notes)
  h.aggregates[1].resolve({ bareme: 10, subjectAvgs: { Maths: 6 }, studentAvgs: [] }); await Promise.resolve()
  assert.equal(h.render('synthetic-B', '4AEP-B').report.hasClassComparison, false)
})
test('parent home and navigation contain no deferred modules', () => {
  for (const file of ['screens/student/ParentDashboardScreen.tsx', 'navigation/StudentStack.tsx']) {
    const source = fs.readFileSync(new URL('../../src/' + file, import.meta.url), 'utf8')
    assert.doesNotMatch(source, /ActionCenter|StudentPickup|StudentAppointments|PICKUP_QUICK_ACTION/)
  }
})
