// Seconde revue après df7332c : la réussite confirme désormais les CORRECTIFS.
// Aucun Firebase réel. Même React 19.1 que l'app, renderer installé hors projet.
const assert = require('node:assert/strict')
const { test } = require('node:test')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const React = require('/tmp/mojammaa-audit-20261015-react/node_modules/react')
const { act, create } = require('/tmp/mojammaa-audit-20261015-react/node_modules/react-test-renderer')
global.IS_REACT_ACT_ENVIRONMENT = true

function load(file, dependencies, globals = {}) {
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
const noop = () => {}
const theme = new Proxy({}, { get: () => '#123456' })
const native = Object.fromEntries(['View', 'Text', 'ScrollView', 'Pressable', 'Image', 'ActivityIndicator'].map(name => [name, name]))
native.StyleSheet = { create: value => value }
native.Alert = { alert: noop }
native.Linking = { openURL: async () => {} }

test('R04: every role gets the parent homework form in the parent stack, never the teacher tracking', async () => {
  const counts = {}
  for (const role of ['student', 'teacher', 'admin', 'staff', 'driver']) {
    const homework = { id: 'synthetic-homework', titre: 'Synthetic', classeId: 'TEST', teacherId: 'other-teacher', eleveId: 'synthetic-child', attachments: [] }
    const Screen = load('src/screens/shared/DevoirDetailScreen.tsx', {
      'react-native': native,
      'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
      '@react-navigation/native': {
        useNavigation: () => ({ goBack: noop }),
        useRoute: () => ({ name: 'StudentDevoirView', params: { devoir: homework } }),
      },
      'lucide-react-native': Object.fromEntries(['BookOpen', 'ChevronLeft', 'Clock', 'Users', 'FileText', 'Paperclip', 'ExternalLink'].map(name => [name, name])),
      'react-i18next': { useTranslation: () => ({ t: key => key }) },
      '../../contexts/ThemeContext': { useTheme: () => theme },
      '../../contexts/AuthContext': { useAuth: () => ({ role, profile: { uid: 'synthetic-parent' } }) },
      '../../utils/arabicText': { dirStyle: () => ({}) },
      '../../utils/academicPeriod': { localISODate: () => '2026-10-15' },
      '../../components/homework/HomeworkParentSubmission': 'ParentSubmission',
      '../../components/homework/HomeworkTeacherTracking': 'TeacherTracking',
      'firebase/firestore': { doc: () => ({}), onSnapshot: (_, next) => { next({ exists: () => true, id: homework.id, data: () => homework }); return noop } },
      '../../config/firebase': { db: {} },
      '../teacher/TeacherDevoirsScreen': { CreateDevoirModal: () => null },
      '../../services/homework-management': {},
      '../../utils/attachments': { safeAttachments: () => [] },
    }).default
    let renderer
    await act(async () => { renderer = create(React.createElement(Screen)) })
    counts[role] = renderer.root.findAllByType('ParentSubmission').length
    assert.equal(renderer.root.findAllByType('TeacherTracking').length, 0)
    await act(async () => renderer.unmount())
  }
  assert.deepEqual(counts, { student: 1, teacher: 1, admin: 1, staff: 1, driver: 1 })
})

test('R05: a reported font error starts the app with system fonts', async () => {
  let releaseMinimum, fontsFailed = true
  const App = load('App.tsx', {
    'expo-status-bar': { StatusBar: 'StatusBar' },
    'react-native-safe-area-context': { SafeAreaProvider: 'SafeAreaProvider' },
    'react-native-gesture-handler': { GestureHandlerRootView: 'GestureHandlerRootView' },
    'moti': { AnimatePresence: 'AnimatePresence' },
    '@expo-google-fonts/inter': { useFonts: () => fontsFailed ? [false, new Error('Synthetic font load failure')] : [true, null] },
    '@expo-google-fonts/poppins': {}, '@expo-google-fonts/cairo': {}, '@expo-google-fonts/great-vibes': {},
    './src/contexts/AuthContext': { AuthProvider: 'AuthProvider' },
    './src/contexts/driver-workspace-context': { WorkspaceProvider: 'WorkspaceProvider' },
    './src/contexts/ThemeContext': { ThemeProvider: 'ThemeProvider' },
    './src/navigation/NavigationRoot': 'NavigationRoot',
    './src/i18n': { initI18n: async () => {} },
    './src/components/AnimatedSplash': 'AnimatedSplash',
    './src/components/app-error-boundary': 'ErrorBoundary',
  }, { setTimeout: fn => { releaseMinimum = fn; return 1 }, clearTimeout: noop, console: { ...console, warn: noop } }).default
  let renderer
  await act(async () => { renderer = create(React.createElement(App)) })
  await act(async () => releaseMinimum())
  assert.equal(renderer.root.findAllByType('AnimatedSplash').length, 0)
  assert.equal(renderer.root.findAllByType('NavigationRoot').length, 1)
  assert.equal(renderer.root.findAllByType('ErrorBoundary').length, 1)
  // Contrôle positif : un chargement réussi libère aussi l'application.
  fontsFailed = false
  await act(async () => renderer.update(React.createElement(App)))
  assert.equal(renderer.root.findAllByType('NavigationRoot').length, 1)
  assert.equal(renderer.root.findAllByType('AnimatedSplash').length, 0)
  await act(async () => renderer.unmount())
})

test('R06: a late profile refresh of account A is ignored after account B has signed in', async () => {
  let nextAuth, finishRefresh, firstListenerError, value, renderer, subscriptions = 0
  const auth = { currentUser: { uid: 'account-a' } }
  const roles = { 'account-a': 'admin', 'account-b': 'parent' }
  const snapshot = uid => ({ exists: () => true, metadata: { fromCache: false }, data: () => ({ role: roles[uid] }) })
  const { AuthProvider, useAuth } = load('src/contexts/AuthContext.tsx', {
    '@react-native-async-storage/async-storage': { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
    '../services/attendance-drafts': { startAttendanceSync: () => noop },
    'firebase/auth': { onAuthStateChanged: (_, next) => { nextAuth = next; return noop }, signOut: async () => {} },
    'firebase/firestore': {
      doc: (_, __, uid) => ({ uid }),
      onSnapshot: (ref, next, error) => {
        subscriptions++
        if (subscriptions === 1) firstListenerError = error
        else next(snapshot(ref.uid))
        return noop
      },
      getDoc: ref => new Promise(resolve => { finishRefresh = () => resolve(snapshot(ref.uid)) }),
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
  await act(async () => firstListenerError({ code: 'permission-denied' }))
  assert.equal(value.profile, null)
  assert.equal(value.profileError, true)
  // « Réessayer » : le nouveau listener réussit avant la lecture ponctuelle.
  let pending
  await act(async () => { pending = value.refresh() })
  assert.equal(value.role, 'admin')
  await act(async () => { auth.currentUser = null; nextAuth(null) })
  await act(async () => { auth.currentUser = { uid: 'account-b' }; nextAuth(auth.currentUser) })
  assert.equal(value.user.uid, 'account-b')
  assert.equal(value.profile.uid, 'account-b')
  assert.equal(value.role, 'student')
  await act(async () => { finishRefresh(); await pending })
  assert.equal(value.user.uid, 'account-b')
  assert.equal(value.profile.uid, 'account-b')
  assert.equal(value.role, 'student')
  await act(async () => renderer.unmount())
})

test('R07: class average and rank follow the live class aggregate', async () => {
  let nextNotes, nextStats, value, renderer, statsListeners = 0
  const note = grade => [{ note: grade, matiere: 'Maths', semestre: 'S1', bareme: 20 }]
  const { useParentNotes } = load('src/hooks/useParentNotes.ts', {
    '../services/notesService': {
      subscribeNotesForEleve: (_, __, next) => { nextNotes = next; next(note(10)); return noop },
      subscribeClassStats: (_, __, ___, next) => {
        statsListeners++; nextStats = next
        next({ bareme: 20, subjectAvgs: { Maths: 14 }, studentAvgs: [18, 10] })
        return noop
      },
    },
    '../services/coefficientsService': {
      subscribeCoefficients: next => { next({}); return noop }, makeCoefOf: () => () => 1,
    },
    '../utils/academicPeriod': { currentAcademicPeriod: () => ({ academicYear: '2026-2027', semestre: 'S1' }) },
    '../utils/gradeScale': load('src/utils/gradeScale.ts', {}),
  })
  function Probe() { value = useParentNotes('synthetic-child', 'TEST', 'semester'); return null }
  await act(async () => { renderer = create(React.createElement(Probe)) })
  assert.equal(value.report.generalAvg, 10)
  assert.equal(value.report.rank, '2 / 2')
  // Le serveur dispose désormais du nouvel agrégat ; un autre élève a 20.
  await act(async () => nextNotes(note(19)))
  await act(async () => nextStats({ bareme: 20, subjectAvgs: { Maths: 19.5 }, studentAvgs: [20, 19] }))
  await act(async () => renderer.update(React.createElement(Probe)))
  assert.equal(statsListeners, 1)
  assert.equal(value.report.generalAvg, 19)
  assert.equal(value.report.classGeneralAvg, 19.5)
  assert.equal(value.report.rank, '2 / 2')
  await act(async () => renderer.unmount())
})
