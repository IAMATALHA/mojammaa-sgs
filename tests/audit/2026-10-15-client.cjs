// Audit 2026-10-15 — ces scénarios décrivaient les défauts ; ils vérifient désormais le comportement CORRIGÉ.
// npm install --prefix /tmp/mojammaa-audit-20261015-react --ignore-scripts react@19.1.0 react-test-renderer@19.1.0
// node --test tests/audit/2026-10-15-client.cjs
const assert = require('node:assert/strict')
const { test } = require('node:test')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const React = require('/tmp/mojammaa-audit-20261015-react/node_modules/react')
const { act, create } = require('/tmp/mojammaa-audit-20261015-react/node_modules/react-test-renderer')
global.IS_REACT_ACT_ENVIRONMENT = true
function load(file, dependencies = {}, globals = {}) {
  const source = fs.readFileSync(path.resolve(__dirname, '../../', file), 'utf8')
  const js = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.React, esModuleInterop: true,
  } }).outputText
  const module = { exports: {} }
  new Function('require', 'module', 'exports', ...Object.keys(globals), js)(name => {
    if (name === 'react') return React
    assert.ok(name in dependencies, `Unmocked dependency: ${name}`)
    return dependencies[name]
  }, module, module.exports, ...Object.values(globals))
  return module.exports
}
async function mount(hook) {
  let value, renderer
  function Probe() { value = hook(); return null }
  await act(async () => { renderer = create(React.createElement(Probe)) })
  return { get value() { return value },
    async update() { await act(async () => renderer.update(React.createElement(Probe))) },
    async stop() { await act(async () => renderer.unmount()) },
  }
}
const period = { academicYear: '2026-2027', semestre: 'S1', monthKey: '2026-10' }

test('A01: a genuine cold-start tap opens the message whatever its age; a replayed intent does not', async () => {
  const stored = new Map(), navigationsByRun = []
  const asyncStorage = { getItem: async k => stored.get(k) ?? null, setItem: async (k, v) => { stored.set(k, v) } }
  for (const age of [30_000, 300_000, 300_000]) {
    const navigations = []
    const response = { notification: { date: Date.now() - age, request: {
      identifier: `synthetic-${age}`, content: { data: { messageId: 'synthetic-message' } },
    } } }
    const { usePushTapNavigation } = load('src/hooks/usePushTapNavigation.ts', {
      '@react-native-async-storage/async-storage': asyncStorage,
      'expo-notifications': {
        addNotificationResponseReceivedListener: () => ({ remove() {} }),
        getLastNotificationResponseAsync: async () => response,
        clearLastNotificationResponseAsync: async () => {},
      },
      '../navigation/navigationRef': { navigationRef: { isReady: () => true, navigate: (...args) => navigations.push(args) } },
    })
    const h = await mount(() => usePushTapNavigation('student', true))
    await act(async () => { await new Promise(r => setTimeout(r, 0)) })
    navigationsByRun.push(navigations.length)
    await h.stop()
  }
  // 1er lancement : tap frais ; 2e : tap réel sur une notification de 5 min ;
  // 3e : même identifiant rejoué par Android au démarrage suivant.
  assert.deepEqual(navigationsByRun, [1, 1, 0])
})

test('A02: parent absence hook keeps late records as « retard »', async () => {
  const { useParentAbsences } = load('src/hooks/useParentAbsences.ts', {
    '../contexts/AuthContext': { useAuth: () => ({ profile: { uid: 'synthetic-parent' } }) },
    '../utils/academicPeriod': { currentAcademicPeriod: () => period },
    '../services/elevesService': { subscribeChildrenOfParent: (_, next) => { next([{ codeMassar: 'synthetic-child' }]); return () => {} } },
    '../services/absencesService': { subscribeAbsenceHistoryForEleves: (_, __, next) => {
      next(['absent', 'retard'].map((statut, i) => ({ id: `synthetic-${i}`, eleveId: 'synthetic-child', date: '2026-10-15', seance: 'S1', statut })))
      return () => {}
    } },
  })
  const h = await mount(useParentAbsences)
  assert.equal(h.value.absences.length, 2)
  assert.equal(h.value.absences.filter(row => row.type === 'retard').length, 1)
  await h.stop()
})

test('A03: teacher presence follows new absences live; a read error shows « unknown »', async () => {
  let onStudents, tick, onRate, onRateError
  const profile = { uid: 'synthetic-teacher', classes: ['TEST'], matiere: 'Maths' }
  const children = [{ codeMassar: 'synthetic-child', classe: 'TEST' }]
  const { useTeacherData } = load('src/hooks/useTeacherData.ts', {
    '../contexts/AuthContext': { useAuth: () => ({ profile }) },
    '../services/elevesService': { subscribeEleves: (_, next) => { onStudents = next; next(children); return () => {} }, groupByClasse: () => ({ TEST: children }) },
    '../services/scheduleService': { subscribeSchedule: (_, next) => { next({ weeklySlots: [] }); return () => {} } },
    '../services/absencesService': { subscribeTeacherPresenceRate: (_, __, ___, next, error) => { onRate = next; onRateError = error; next(100); return () => {} } },
    '../services/firestore': { toDoc: d => d.data() },
    '../config/firebase': { db: {} },
    '../utils/academicPeriod': { currentAcademicPeriod: () => period, currentAndNextAcademicYears: () => ['2026-2027', '2027-2028'], localISODate: () => '2026-10-15' },
    'firebase/firestore': { collection: () => ({}), query: () => ({}), where: () => ({}), getDocs: async () => ({ docs: [] }) },
  }, { setInterval: fn => { tick = fn; return 1 }, clearInterval: () => {} })
  const h = await mount(useTeacherData)
  assert.equal(h.value.kpis.attendance, 100)
  await act(async () => { tick(); onStudents([...children]); onRate(0) })
  assert.equal(h.value.kpis.attendance, 0)
  await act(async () => onRateError(new Error('synthetic')))
  assert.equal(h.value.kpis.attendance, null)
  await h.stop()
})

test('A04: overdue status follows the date after midnight', async () => {
  let today = '2026-10-15', snapshot
  const docs = [{ id: 'synthetic-homework', data: () => ({ titre: 'Synthetic', classeId: 'TEST', dateLimite: '2026-10-15' }) }]
  const children = [{ codeMassar: 'synthetic-child', classe: 'TEST' }]
  const { useParentDevoirs } = load('src/hooks/useParentDevoirs.ts', {
    '../contexts/AuthContext': { useAuth: () => ({ profile: { uid: 'synthetic-parent' } }) },
    '../config/firebase': { db: {} },
    '../utils/academicPeriod': { localISODate: () => today },
    '../utils/eleveLabels': { eleveName: () => 'Synthetic' },
    '../utils/attachments': { safeAttachments: () => [] },
    '../services/homeworkSubmissionsService': { homeworkSubmissionId: (a, b) => `${a}_${b}`, subscribeParentHomeworkSubmissions: (_, __, next) => { next([]); return () => {} } },
    'firebase/firestore': { collection: () => ({}), query: () => ({}), where: () => ({}), onSnapshot: (_, next) => { snapshot = next; next({ docs }); return () => {} } },
  })
  const h = await mount(() => useParentDevoirs(children))
  assert.equal(h.value.devoirs[0].isPast, false)
  today = '2026-10-16'
  await act(async () => snapshot({ docs }))
  assert.equal(h.value.devoirs[0].isPast, true)
  await h.stop()
})

test('A08: retry after a terminal profile listener error reattaches the listener', async () => {
  let nextAuth, profileError, subscriptions = 0, value, renderer
  const auth = { currentUser: { uid: 'synthetic-user' } }
  const noop = () => {}
  const { AuthProvider, useAuth } = load('src/contexts/AuthContext.tsx', {
    '@react-native-async-storage/async-storage': { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
    '../services/attendance-drafts': { startAttendanceSync: () => noop },
    'firebase/auth': { onAuthStateChanged: (_, next) => { nextAuth = next; return noop }, signOut: async () => {} },
    'firebase/firestore': {
      doc: () => ({}),
      onSnapshot: (_, next, error) => { subscriptions++; profileError = error; return noop },
      getDoc: async () => ({ exists: () => true, data: () => ({ role: 'admin' }) }),
    },
    '../config/firebase': { auth, db: {} },
    '../services/NotificationService': {
      registerForPushNotificationsAsync: async () => {}, recordLogin: noop,
      retryPendingPushRelease: async () => {}, startNotificationSync: () => noop,
      startPendingPushReleaseRetry: () => noop, stopPushForLogout: async () => {},
    },
    '../services/loginAudit': { recordLoginDevice: noop },
  })
  function Probe() { value = useAuth(); return null }
  await act(async () => { renderer = create(React.createElement(AuthProvider, null, React.createElement(Probe))) })
  await act(async () => nextAuth(auth.currentUser))
  await act(async () => profileError({ code: 'permission-denied' }))
  assert.equal(value.profileError, true)
  assert.equal(value.profile, null)
  await act(async () => value.refresh())
  assert.equal(value.profileError, false)
  assert.equal(value.role, 'admin')
  assert.equal(subscriptions, 2, 'the failed listener is replaced')
  await act(async () => renderer.unmount())
})
