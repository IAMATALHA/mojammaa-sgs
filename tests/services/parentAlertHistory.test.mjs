import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs'
import ts from 'typescript'

function load(file, deps = {}) {
  const code = ts.transpileModule(fs.readFileSync(new URL('../../src/' + file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React },
  }).outputText
  const module = { exports: {} }
  new Function('require', 'module', 'exports', code)(id => {
    if (!(id in deps)) throw Error('Unexpected dependency: ' + id)
    return deps[id]
  }, module, module.exports)
  return module.exports
}
const historyModule = load('utils/parent-alert-history.ts')
const { createParentAlertHistory, parentAlertStorageKey, parentAlertToken } = historyModule
const { summarizeParentHomeActivity } = load('utils/parent-home-summary.ts', { './parent-alert-history': historyModule })
const tokenA = parentAlertToken(['homework', 'synthetic-A'])
const tokenB = parentAlertToken(['absence', 'synthetic-B'])
const scope = parentAlertStorageKey('synthetic-parent', 'synthetic-child')
const flush = () => new Promise(resolve => setImmediate(resolve))
function storage() {
  const values = new Map()
  return { values, getItem: async key => values.get(key) ?? null, setItem: async (key, value) => { values.set(key, value) } }
}

test('consultation survives a fresh store; accounts and children have separate histories', async () => {
  const disk = storage(); const store = createParentAlertHistory(disk)
  await store.mark(scope, [tokenA])
  assert.deepEqual(await createParentAlertHistory(disk).read(scope), [tokenA])
  assert.deepEqual(await store.read(parentAlertStorageKey('synthetic-other-parent', 'synthetic-child')), [])
  assert.deepEqual(await store.read(parentAlertStorageKey('synthetic-parent', 'synthetic-other-child')), [])
  assert.equal([...disk.values.keys(), ...disk.values.values()].some(value => value.includes('synthetic')), false)
})

test('rapid consultations merge; a returning screen waits for a pending write', async () => {
  const disk = storage(); let release
  const save = disk.setItem
  disk.setItem = async (...args) => { await new Promise(resolve => { release = resolve }); return save(...args) }
  const store = createParentAlertHistory(disk)
  const first = store.mark(scope, [tokenA]); await flush()
  const second = store.mark(scope, [tokenB])
  const returning = store.read(scope)
  release(); await first; await flush(); release(); await second
  assert.deepEqual(await returning, [tokenA, tokenB])
})

test('failed writes can recover and malformed saved preferences do not crash loading', async () => {
  const disk = storage(); const save = disk.setItem
  disk.setItem = async () => { throw Error('synthetic full disk') }
  const store = createParentAlertHistory(disk)
  await assert.rejects(store.mark(scope, [tokenA]))
  disk.setItem = save
  await store.mark(scope, [tokenB]); assert.deepEqual(await store.read(scope), [tokenB])
  disk.values.set(scope, '{broken'); assert.deepEqual(await store.read(scope), [])
  disk.values.set(scope, JSON.stringify([null, 3, 'unexpected', tokenA]))
  assert.deepEqual(await store.read(scope), [tokenA])
})

test('new records at identical counts, edited homework and due-today urgency renew the alert', () => {
  const base = { childId: 'synthetic-child', today: '2026-09-23', monthKey: '2026-09', submissions: [],
    homework: [{ id: 'work-A', dateLimite: '2026-09-24', revision: 'revision-A' }],
    absences: [{ id: 'absence-A', date: '2026-09-23', eleveId: 'synthetic-child', statut: 'absent' }],
  }
  const first = summarizeParentHomeActivity(base)
  const replacement = summarizeParentHomeActivity({ ...base, homework: [{ ...base.homework[0], id: 'work-B' }], absences: [{ ...base.absences[0], id: 'absence-B' }] })
  assert.equal(first.pendingHomework, replacement.pendingHomework)
  assert.equal(first.unjustifiedDays, replacement.unjustifiedDays)
  assert.notDeepEqual(first.homeworkAlerts, replacement.homeworkAlerts)
  assert.notDeepEqual(first.absenceAlerts, replacement.absenceAlerts)
  assert.notDeepEqual(first.homeworkAlerts, summarizeParentHomeActivity({ ...base, today: '2026-09-24' }).homeworkAlerts)
  assert.notDeepEqual(first.homeworkAlerts, summarizeParentHomeActivity({ ...base, homework: [{ ...base.homework[0], revision: 'revision-B' }] }).homeworkAlerts)
})

function harness(disk) {
  const cells = []; let cursor = 0; let effects = []
  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]))
  const react = {
    useState(initial) { const i = cursor++; if (!cells[i]) cells[i] = { value: initial }; return [cells[i].value, next => { cells[i].value = typeof next === 'function' ? next(cells[i].value) : next }] },
    useEffect(fn, deps) { const i = cursor++; if (!same(cells[i]?.deps, deps)) effects.push(() => { cells[i]?.cleanup?.(); cells[i] = { deps, cleanup: fn() } }) },
  }
  const { useViewedParentAlerts } = load('hooks/use-viewed-parent-alerts.ts', {
    react, '@react-native-async-storage/async-storage': { default: disk }, '../utils/parent-alert-history': historyModule,
  })
  return {
    react, useViewedParentAlerts,
    render(parent = 'synthetic-parent', child = 'synthetic-child') {
      cursor = 0; effects = []; const result = useViewedParentAlerts(parent, child); effects.forEach(fn => fn()); return result
    },
    renderComponent(Component, props) {
      cursor = 0; effects = []; const result = Component(props); effects.forEach(fn => fn()); return result
    },
  }
}

test('actual hook hides immediately, hydrates on restart, and distinguishes removal from new information', async () => {
  const disk = storage(); const h = harness(disk)
  assert.equal(h.render().ready, false); await flush()
  assert.equal(h.render().ready, true)
  h.render().markViewed([tokenA, tokenB])
  assert.equal(h.render().isViewed([tokenA, tokenB]), true)
  assert.equal(h.render().isViewed([tokenA]), true)
  assert.equal(h.render().isViewed([tokenA, parentAlertToken('new')]), false)
  await flush()
  const restarted = harness(disk); assert.equal(restarted.render().ready, false); await flush()
  assert.equal(restarted.render().isViewed([tokenA]), true)
  assert.equal(restarted.render('synthetic-parent', 'synthetic-other-child').ready, false); await flush()
  assert.equal(restarted.render('synthetic-parent', 'synthetic-other-child').isViewed([tokenA]), false)
})

test('late hydration cannot overwrite another account and storage failure keeps in-session dismissal', async () => {
  const disk = storage(); const pending = []
  disk.getItem = key => new Promise(resolve => pending.push({ key, resolve }))
  const h = harness(disk)
  h.render(); await flush()
  h.render('synthetic-other-parent'); await flush()
  pending[1].resolve(null); await flush()
  pending[0].resolve(JSON.stringify([tokenA])); await flush()
  assert.equal(h.render('synthetic-other-parent').isViewed([tokenA]), false)
  disk.getItem = async () => { throw Error('synthetic storage failure') }
  h.render('synthetic-other-parent').markViewed([tokenA]); await flush()
  assert.equal(h.render('synthetic-other-parent').isViewed([tokenA]), true)
})

test('actual alert press navigates, hides only that alert, then hides the section without claiming resolution', async () => {
  const h = harness(storage()); const opened = []
  const createElement = (type, props, ...children) => ({ type, props: { ...props, children } })
  const Component = load('components/dashboard/parent-home-overview.tsx', {
    react: { default: { createElement } },
    'react-native': { ActivityIndicator: 'spinner', Pressable: 'button', Text: 'text', View: 'view', StyleSheet: { create: value => value, hairlineWidth: 1 }, useWindowDimensions: () => ({ width: 390, fontScale: 1 }) },
    'lucide-react-native': Object.fromEntries(['BookOpen', 'CalendarX', 'CheckCircle', 'ChevronLeft', 'ChevronRight', 'GraduationCap', 'Clock3'].map(key => [key, key])),
    '../../utils/parent-home-copy': load('utils/parent-home-copy.ts'),
    '../../utils/parentStatistics': { formatParentAverage: () => '7.5 / 10' },
    '../../utils/format': { hexWithAlpha: value => value },
    '../../hooks/use-viewed-parent-alerts': { useViewedParentAlerts: h.useViewedParentAlerts },
    '../../utils/parent-alert-history': historyModule,
  }).default
  const props = {
    parentId: 'synthetic-parent', child: { id: 'synthetic-child', firstName: 'Demo', lastName: '', classe: 'Demo' }, language: 'fr', period: '2026-2027 S1',
    theme: { fonts: {}, shadows: {} }, academic: { loading: false, error: null, report: null, competenceReport: null },
    activity: { homeworkReady: true, attendanceReady: true, pendingHomework: 1, dueToday: 1, unjustifiedDays: 1, absenceDays: 1, totalHomework: 1, completedHomework: 0, homeworkAlerts: [tokenA], absenceAlerts: [tokenB] },
    onHomework: () => opened.push('homework'), onAbsences: () => opened.push('absence'), onResults: () => opened.push('results'),
  }
  const flatten = node => Array.isArray(node) ? node.flatMap(flatten) : node && typeof node === 'object' ? [node, ...flatten(node.props.children)] : []
  const render = () => flatten(h.renderComponent(Component, props))
  render(); await flush()
  let nodes = render()
  nodes.find(n => n.props.accessibilityLabel?.startsWith('Devoirs pour aujourd’hui')).props.onPress()
  nodes = render()
  assert.deepEqual(opened, ['homework'])
  assert.equal(nodes.some(n => n.props.accessibilityLabel?.startsWith('Devoirs pour aujourd’hui')), false)
  nodes.find(n => n.props.accessibilityLabel?.startsWith('Absences à vérifier')).props.onPress()
  nodes = render()
  assert.deepEqual(opened, ['homework', 'absence'])
  assert.equal(nodes.some(n => n.props.children.includes('À votre attention')), false)
  assert.equal(nodes.some(n => n.props.children.includes('Aucune échéance urgente détectée')), false)
  assert.equal(props.activity.pendingHomework, 1)
  props.activity.homeworkAlerts = [parentAlertToken('new-homework')]
  assert.equal(render().some(n => n.props.accessibilityLabel?.startsWith('Devoirs pour aujourd’hui')), true)
})
