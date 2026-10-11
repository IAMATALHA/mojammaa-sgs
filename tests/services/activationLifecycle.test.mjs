import assert from 'node:assert/strict'
import fs from 'node:fs'
import { test } from 'node:test'
import ts from 'typescript'

// Execute the actual hook/component with controlled promises and native
// boundaries. Synthetic invitations only; no Firebase connection is needed.
const compiled = new Map()
function load(file, dependencies = {}) {
  if (!compiled.has(file)) compiled.set(file, ts.transpileModule(
    fs.readFileSync(new URL(`../../src/${file}`, import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } },
  ).outputText)
  const module = { exports: {} }
  new Function('require', 'module', 'exports', compiled.get(file))(name => {
    if (!(name in dependencies)) throw new Error(`Unexpected import: ${name}`)
    return dependencies[name]
  }, module, module.exports)
  return module.exports
}

function hooks() {
  const cells = []
  let cursor, effects, dirty, render, value
  const same = (a, b) => a && b && a.length === b.length && a.every((item, index) => Object.is(item, b[index]))
  const react = {
    default: { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) },
    useState(initial) {
      const index = cursor++
      cells[index] ??= { value: typeof initial === 'function' ? initial() : initial }
      return [cells[index].value, next => {
        const value = typeof next === 'function' ? next(cells[index].value) : next
        if (!Object.is(value, cells[index].value)) { cells[index].value = value; dirty = true }
      }]
    },
    useMemo(fn, deps) {
      const index = cursor++
      if (!same(cells[index]?.deps, deps)) cells[index] = { value: fn(), deps }
      return cells[index].value
    },
    useRef(value) { return react.useMemo(() => ({ current: value }), []) },
    useCallback(fn, deps) { return react.useMemo(() => fn, deps) },
    useEffect(fn, deps) {
      const index = cursor++
      if (!same(cells[index]?.deps, deps)) effects.push(() => {
        cells[index]?.cleanup?.()
        cells[index] = { deps, cleanup: fn() }
      })
    },
  }
  const h = {
    react,
    get value() { return value },
    render(fn = render) {
      render = fn
      let passes = 0
      do {
        cursor = 0; effects = []; dirty = false
        value = render()
        effects.forEach(effect => effect())
        assert.ok(++passes < 25, 'effects must settle')
      } while (dirty)
    },
    async settle() { await new Promise(setImmediate); h.render() },
    unmount() { cells.forEach(cell => cell.cleanup?.()) },
  }
  return h
}

const deferred = () => {
  let resolve
  const promise = new Promise(done => { resolve = done })
  return { promise, resolve }
}
const t = key => key
const translate = { 'react-i18next': { useTranslation: () => ({ t }) } }
const codeA = 'ABC-DEFG-HJK', codeB = 'XYZ-2345-ABC'
const parentURL = code => `https://mojammaa.com/parents/activer#${code}`
const find = (node, type) => {
  if (!node || typeof node !== 'object') return undefined
  if (Array.isArray(node)) return node.map(child => find(child, type)).find(Boolean)
  return node.type === type ? node : find(node.props?.children, type)
}

function sheet(request) {
  const h = hooks(), alerts = [], closes = []
  const Sheet = load('components/add-child-sheet.tsx', {
    react: h.react, ...translate,
    'react-native': {
      ...Object.fromEntries(['ActivityIndicator', 'Text', 'TextInput', 'TouchableOpacity', 'View'].map(name => [name, name])),
      StyleSheet: { create: value => value }, Alert: { alert: (...args) => alerts.push(args) },
    },
    'lucide-react-native': { UserRoundPlus: 'UserRoundPlus' },
    '../contexts/ThemeContext': { useTheme: () => ({ fonts: {} }) },
    './BottomSheet': { default: 'BottomSheet' },
    '../services/parentAuthService': {
      INVITATION_CODE_LENGTH: 10, invitationCodeFromText: () => null,
      normalizeInvitationCode: value => value.replaceAll('-', ''), linkChildWithCode: () => request.promise,
    },
  }).default
  h.render(() => Sheet({ visible: true, isStaff: false, initialCode: codeA, onClose: () => closes.push('closed') }))
  return {
    ...h, alerts, closes,
    submit() { find(h.value, 'TouchableOpacity').props.onPress(); h.render() },
    async succeed() { request.resolve({ studentName: 'Enfant fictif', classe: '' }); await h.settle() },
  }
}

test('child link request finishing after replacement does not show the old success alert', async () => {
  const h = sheet(deferred())
  h.submit()
  h.unmount() // NavigationRoot replaces this keyed sheet on the next link.
  await h.succeed()
  assert.deepEqual(h.alerts, [])
  assert.deepEqual(h.closes, [])
})

test('old success alert button does not close a replacement child sheet', async () => {
  const h = sheet(deferred())
  h.submit()
  await h.succeed()
  assert.equal(h.alerts.length, 1)
  h.unmount()
  h.alerts[0][2][0].onPress()
  assert.deepEqual(h.closes, [])
})

test('current child sheet still confirms a successful link and closes on Done', async () => {
  const h = sheet(deferred())
  h.submit()
  await h.succeed()
  assert.equal(h.alerts.length, 1)
  assert.equal(h.alerts[0][0], 'addChild.successTitle')
  h.alerts[0][2][0].onPress()
  assert.deepEqual(h.closes, ['closed'])
  h.unmount()
})

test('a delayed dismiss callback for the previous link cannot close the latest child sheet', async () => {
  const h = hooks()
  let listener
  const useActivationLink = load('hooks/use-activation-link.ts', {
    react: h.react, ...translate,
    'react-native': {
      Alert: { alert() { throw new Error('Unexpected account alert') } },
      Linking: {
        getInitialURL: async () => null,
        addEventListener: (_, fn) => { listener = fn; return { remove() {} } },
      },
    },
    '../navigation/navigationRef': { navigationRef: {} },
    '../utils/activation-link': load('utils/activation-link.ts'),
    '../utils/latest-only': load('utils/latest-only.ts'),
  }).useActivationLink
  const options = { signedIn: true, ready: true, logout: async () => {} }
  h.render(() => useActivationLink(options))
  await h.settle()
  listener({ url: parentURL(codeA) }); h.render()
  const oldClose = h.value.dismissChild
  listener({ url: parentURL(codeB) }); h.render()
  oldClose(); h.render()
  assert.equal(h.value.child.code, codeB)
  assert.equal(h.value.childOpen, true)
  h.value.dismissChild(); h.render()
  assert.equal(h.value.childOpen, false, 'the current sheet can still be dismissed')
  h.unmount()
})
