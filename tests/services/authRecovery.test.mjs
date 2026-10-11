import assert from 'node:assert/strict'
import fs from 'node:fs'
import { test } from 'node:test'
import ts from 'typescript'

// Real screen handlers, synthetic credentials and controlled native/Firebase
// boundaries, following the lightweight harness used by adminScreens.test.mjs.
function load(file, deps = {}) {
  const source = fs.readFileSync(new URL(`../../src/${file}`, import.meta.url), 'utf8')
  const output = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React,
  } }).outputText
  const module = { exports: {} }
  new Function('require', 'module', 'exports', output)(name => {
    if (!(name in deps)) throw new Error(`Unexpected import: ${name}`)
    return deps[name]
  }, module, module.exports)
  return module.exports
}
const identity = load('utils/parentIdentity.ts')
const countries = load('utils/phoneCountries.ts', { './parentIdentity': identity })
const latestOnly = load('utils/latest-only.ts')
const noNetwork = () => { throw new Error('Unexpected network request') }
const config = { auth: {}, functions: {} }
const firebase = { 'firebase/auth': { signInWithEmailAndPassword: noNetwork }, 'firebase/functions': { httpsCallable: noNetwork }, '../config/firebase': config }
const parentService = load('services/parentAuthService.ts', firebase)
const teacherService = load('services/teacherAccessService.ts', { ...firebase, './parentAuthService': parentService })
const preferences = load('utils/loginPreferences.ts', { '@react-native-async-storage/async-storage': { default: { multiSet: async () => {} } } })
const deferred = () => {
  let resolve
  const promise = new Promise(done => { resolve = done })
  return { promise, resolve }
}
const textOf = node => node == null || typeof node === 'boolean' ? ''
  : Array.isArray(node) ? node.map(textOf).join(' ')
    : typeof node === 'object' ? textOf(node.props?.children) : String(node)
function nodes(node, predicate) {
  if (!node || typeof node !== 'object') return []
  if (Array.isArray(node)) return node.flatMap(child => nodes(child, predicate))
  return [...(predicate(node) ? [node] : []), ...nodes(node.props?.children, predicate)]
}
function screen(file, { redeem = noNetwork, signIn = noNetwork, readPreferences = async () => [], teacher = {} } = {}) {
  const cells = [], alerts = [], remembered = [], navigations = []
  let cursor = 0, effects = [], dirty = false, tree, focused = true
  const same = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]))
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
    useCallback(fn, deps) { return react.useMemo(() => fn, deps) },
    useRef(value) { return react.useMemo(() => ({ current: value }), []) },
    useEffect(fn, deps) {
      const index = cursor++
      if (!same(cells[index]?.deps, deps)) effects.push(() => {
        cells[index]?.cleanup?.()
        cells[index] = { deps, cleanup: fn() }
      })
    },
  }
  const transition = { duration() { return this }, delay() { return this } }
  const hosts = Object.fromEntries(['ActivityIndicator', 'KeyboardAvoidingView', 'Pressable', 'ScrollView', 'Text', 'TextInput', 'View', 'TouchableOpacity', 'Image'].map(name => [name, name]))
  const Component = load(file, {
    react,
    'react-native': { ...hosts, StyleSheet: { create: value => value }, Platform: { OS: 'android' }, I18nManager: { isRTL: false },
      useWindowDimensions: () => ({ width: 400 }), Alert: { alert: (...args) => alerts.push(args) }, Linking: { openURL: noNetwork } },
    '@react-navigation/native': {
      useNavigation: () => ({ popToTop: () => navigations.push('Login'), navigate() {} }),
      useRoute: () => ({ params: { code: 'ABC-DEFG-HJK' } }),
      useFocusEffect: callback => react.useEffect(() => focused ? callback() : undefined, [focused, callback]),
    },
    'react-i18next': { useTranslation: () => ({ t: (key, values) => values ? `${key}:${JSON.stringify(values)}` : key }) },
    'lucide-react-native': new Proxy({}, { get: (_, key) => key }),
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    '../../contexts/ThemeContext': { useTheme: () => ({ fonts: {}, shadows: {} }) },
    '../../components/PhoneNumberField': { default: 'PhoneNumberField' },
    '../../components/PasswordField': { default: 'PasswordField' },
    '../../components/LanguagePicker': { default: 'LanguagePicker' },
    '../../services/parentAuthService': parentService,
    '../../services/teacherAccessService': { ...teacherService, ...teacher },
    '../../utils/parentIdentity': identity,
    '../../utils/phoneCountries': countries,
    '../../utils/latest-only': latestOnly,
    '../../utils/loginPreferences': { ...preferences, rememberLoginMode: (...args) => remembered.push(args) },
    '../../config/firebase': config,
    'firebase/auth': { signInWithEmailAndPassword: signIn },
    'firebase/functions': { httpsCallable: (_functions, name) => { assert.equal(name, 'redeemParentInvitation'); return redeem } },
    '@react-native-async-storage/async-storage': { default: { multiGet: readPreferences, setItem: async () => {} } },
    'expo-haptics': { selectionAsync: async () => {} },
    'react-native-reanimated': { default: { View: 'AnimatedView' }, FadeInUp: transition, FadeInDown: transition },
    moti: { MotiView: 'MotiView' },
    '../../../assets/logo.png': {},
  }).default
  const h = {
    alerts, remembered, navigations,
    render() {
      let passes = 0
      do {
        dirty = false; cursor = 0; effects = []
        tree = Component()
        effects.forEach(effect => effect())
        assert.ok(++passes < 25, 'effects must settle')
      } while (dirty)
    },
    async settle() { await new Promise(setImmediate); h.render() },
    async focus(value) { focused = value; h.render(); await h.settle() },
    find(predicate) { return nodes(tree, predicate) },
    input(label) { return h.find(node => node.props.accessibilityLabel === label || node.props.label === label)[0] },
    change(label, value) { h.input(label).props.onChangeText(value); h.render() },
    press(label) {
      const button = h.find(node => ['Pressable', 'TouchableOpacity'].includes(node.type) && textOf(node).trim() === label)[0]
      assert.ok(button, `Missing button: ${label}`)
      button.props.onPress(); h.render()
    },
    selectedMode() { return textOf(h.find(node => node.props.accessibilityRole === 'tab' && node.props.accessibilityState.selected)[0]).trim() },
  }
  h.render()
  return h
}
const parentScreen = 'screens/auth/ParentActivationScreen.tsx'
const loginScreen = 'screens/auth/LoginScreen.tsx'
async function activateParent(h, { phone = '+212612345678', email = '' } = {}) {
  h.change('parentActivation.firstName', 'Parent')
  h.change('parentActivation.lastName', 'Fictif')
  h.change('parentActivation.password', 'Synthetic-password!')
  h.change('teacherActivation.confirmPassword', 'Synthetic-password!')
  if (phone) { h.input('parentActivation.phone').props.onChange(countries.phoneFieldFromE164(phone)); h.render() }
  if (email) { h.press('parentActivation.addEmail'); h.change('parentActivation.email', email) }
  h.press('parentActivation.submit')
  if (phone) h.alerts.at(-1)[2].find(button => button.text === 'parentActivation.confirmPhoneOk').onPress()
  await h.settle()
}

test('created parent with rejected phone recovers via the approved email after sign-in failure', async () => {
  const h = screen(parentScreen, {
    redeem: async () => ({ data: { loginEmail: 'parent@example.test', loginPhone: null } }),
    signIn: async () => { throw new Error('offline') },
  })
  await activateParent(h, { email: 'parent@example.test' })
  assert.deepEqual(h.remembered, [['email']])
  assert.match(h.alerts.at(-1)[1], /parent@example\.test/)
  assert.doesNotMatch(h.alerts.at(-1)[1], /612345678/)
  h.alerts.at(-1)[2][0].onPress()
  assert.deepEqual(h.navigations, ['Login'])
})

test('phone-only parent recovery displays the real phone, never the internal Auth email', async () => {
  const h = screen(parentScreen, {
    redeem: async () => ({ data: { loginEmail: 'internal@parents.mojammaa.invalid', loginPhone: '+33612345678' } }),
    signIn: async () => { throw new Error('offline') },
  })
  await activateParent(h, { phone: '+33612345678' })
  assert.deepEqual(h.remembered, [['phone', 'FR']])
  assert.match(h.alerts.at(-1)[1], /33/)
  assert.doesNotMatch(h.alerts.at(-1)[1], /parents\.mojammaa\.invalid/)
})

test('email-only parent recovery does not require a phone', async () => {
  const h = screen(parentScreen, {
    redeem: async () => ({ data: { loginEmail: 'parent@example.test', loginPhone: null } }),
    signIn: async () => { throw new Error('offline') },
  })
  await activateParent(h, { phone: '', email: 'parent@example.test' })
  assert.deepEqual(h.remembered, [['email']])
  assert.match(h.alerts.at(-1)[1], /parent@example\.test/)
})

test('successful parent activation keeps its phone and email-only success messages', async () => {
  for (const loginPhone of ['+212612345678', null]) {
    const h = screen(parentScreen, {
      redeem: async () => ({ data: { loginEmail: 'parent@example.test', loginPhone } }), signIn: async () => {},
    })
    await activateParent(h, { email: 'parent@example.test' })
    assert.match(h.alerts.at(-1)[1], loginPhone ? /successPhoneBody/ : /successEmailOnlyBody/)
    assert.equal(h.remembered.length, 1)
  }
})

test('returning to Login refreshes the usable mode and country saved during activation', async () => {
  let saved = [[preferences.LOGIN_MODE_KEY, 'email']]
  const h = screen(loginScreen, { readPreferences: async () => saved })
  await h.settle()
  assert.equal(h.selectedMode(), 'login.modeEmail')
  await h.focus(false)
  saved = [[preferences.LOGIN_MODE_KEY, 'phone'], [preferences.LOGIN_COUNTRY_KEY, 'FR']]
  await h.focus(true)
  assert.equal(h.selectedMode(), 'login.modePhone')
  assert.equal(h.find(node => node.type === 'PhoneNumberField')[0].props.value.iso, 'FR')
})

test('delayed preferences never override a mode the user just selected', async () => {
  const pending = deferred()
  const h = screen(loginScreen, { readPreferences: () => pending.promise })
  h.press('login.modeEmail')
  pending.resolve([[preferences.LOGIN_MODE_KEY, 'phone']])
  await h.settle()
  assert.equal(h.selectedMode(), 'login.modeEmail')
})

test('a preference read finishing after Login loses focus cannot mutate its mode', async () => {
  const pending = deferred()
  const h = screen(loginScreen, { readPreferences: () => pending.promise })
  await h.focus(false)
  pending.resolve([[preferences.LOGIN_MODE_KEY, 'email']])
  await h.settle()
  assert.equal(h.selectedMode(), 'login.modePhone')
})

test('delayed preferences keep a phone and country already entered by the user', async () => {
  const pending = deferred()
  const h = screen(loginScreen, { readPreferences: () => pending.promise })
  h.find(node => node.type === 'PhoneNumberField')[0].props.onChange(countries.phoneFieldFromE164('+33612345678'))
  h.render()
  pending.resolve([[preferences.LOGIN_MODE_KEY, 'email'], [preferences.LOGIN_COUNTRY_KEY, 'MA']])
  await h.settle()
  assert.equal(h.selectedMode(), 'login.modePhone')
  const phone = h.find(node => node.type === 'PhoneNumberField')[0].props.value
  assert.equal(countries.phoneFieldValidity(phone).e164, '+33612345678')
})
