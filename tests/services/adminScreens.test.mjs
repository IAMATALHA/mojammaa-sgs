import assert from 'node:assert/strict'
import fs from 'node:fs'
import { test } from 'node:test'
import ts from 'typescript'

// Exercise the real screen handlers with synthetic records and controlled
// promises. No Firebase connection, native share sheet or school data.
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
const identity = load('utils/parentIdentity.ts')
const countries = load('utils/phoneCountries.ts', { './parentIdentity': identity })
const access = load('utils/admin-access.ts', { './parentIdentity': identity })
const t = (key, values = {}) => `${key}${values.count === undefined ? '' : `:${values.count}`}`
const theme = new Proxy({ fonts: {}, shadows: {} }, { get: (object, key) => object[key] ?? '#123456' })
const textOf = node => node == null || typeof node === 'boolean' ? ''
  : Array.isArray(node) ? node.map(textOf).join(' ')
    : typeof node === 'object' ? textOf(node.props?.children) : String(node)
function nodes(node, predicate) {
  if (!node || typeof node !== 'object') return []
  if (Array.isArray(node)) return node.flatMap(child => nodes(child, predicate))
  return [...(predicate(node) ? [node] : []), ...nodes(node.props?.children, predicate)]
}
const deferred = () => {
  let resolve
  const promise = new Promise(done => { resolve = done })
  return { promise, resolve }
}
function setup(file, { students = [], service = {}, props = {}, native = {}, extra = {} } = {}) {
  const cells = []
  let cursor = 0, effects = [], dirty = false, tree
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
  const host = Object.fromEntries(['ActivityIndicator', 'Pressable', 'ScrollView', 'Text', 'View', 'RefreshControl'].map(name => [name, name]))
  const Component = load(file, {
    react,
    'react-native': { ...host, StyleSheet: { create: value => value }, Linking: { openURL: async () => {} }, Share: { sharedAction: 'sharedAction', dismissedAction: 'dismissedAction', share: async () => ({ action: 'sharedAction' }) }, ...native },
    'react-i18next': { useTranslation: () => ({ t, i18n: { language: 'fr' } }) },
    'lucide-react-native': new Proxy({}, { get: (_, key) => key }),
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) },
    '../../components/ScreenLayout': { default: 'ScreenLayout' },
    '../BottomSheet': { default: 'BottomSheet' },
    '../PhoneNumberField': { default: 'PhoneNumberField' },
    '../../contexts/ThemeContext': { useTheme: () => theme },
    '../../services/elevesService': { listEleves: async () => [...students] },
    '../../services/adminAccessService': { AdminActionError: class extends Error {}, ...service },
    '../../utils/admin-access': access,
    '../../utils/parentIdentity': identity,
    '../../utils/phoneCountries': countries,
    '../../utils/format': { hexWithAlpha: color => color },
    ...extra,
  }).default
  const h = {
    render(nextProps) {
      if (nextProps) props = nextProps
      let passes = 0
      do {
        dirty = false; cursor = 0; effects = []
        tree = Component(props)
        effects.forEach(effect => effect())
        assert.ok(++passes < 25, 'effects must settle')
      } while (dirty)
      return tree
    },
    async settle() { await new Promise(setImmediate); return h.render() },
    find(predicate) { return nodes(tree, predicate) },
    button(label) { return h.find(node => node.type === 'Pressable' && textOf(node).trim() === label.trim())[0] },
    async press(label) {
      const button = h.button(label)
      assert.ok(button, `Missing button: ${label}`)
      assert.ok(!button.props.disabled, `Disabled button: ${label}`)
      button.props.onPress()
      return h.settle()
    },
    text() { return textOf(tree) },
  }
  h.render()
  return h
}
const parentScreen = 'screens/admin/AdminParentCodesScreen.tsx'
const accountSheet = 'components/admin/account-access-sheet.tsx'
const student = (id = 'legacy-document', extra = {}) => ({ id, codeMassar: `MASSAR-${id}`, nom: 'Fictif', prenom: 'Élève', classe: '2APIC-1', parentTel: '0612345678', ...extra })
const codeFor = (id, code = 'ABC-DEFG-HJK') => ({ studentId: id, studentName: 'Élève fictif', classe: '2APIC-1', code })
async function selectClass(h) { await h.settle(); await h.press('2APIC-1'); await h.press('adminCodes.selectAll') }

test('parent invitations send Firestore document IDs and keep the matching contact phone', async () => {
  const calls = []
  const h = setup(parentScreen, { students: [student()], service: { createParentInvitations: async ids => { calls.push(ids); return [codeFor('legacy-document')] } } })
  await selectClass(h); await h.press('adminCodes.generate:1')
  assert.deepEqual(calls, [['legacy-document']])
  assert.ok(h.button(' adminCodes.whatsapp'))
})

test('parent generate button stays above the Android navigation bar and the iPhone home bar', async () => {
  const flat = style => (Array.isArray(style) ? style : [style]).filter(Boolean).reduce((all, part) => ({ ...all, ...part }), {})
  const generateButton = h => flat(h.button(' adminCodes.generate:1').props.style({ pressed: false }))
  const bare = setup(parentScreen, { students: [student()] })
  await selectClass(bare)
  assert.equal(generateButton(bare).bottom, 24, 'without system bar: unchanged position')
  // Android à 3 boutons en bord à bord : barre de 48 dp par-dessus le contenu.
  const insets = { 'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 48, left: 0 }) } }
  const navBar = setup(parentScreen, { students: [student()], extra: insets })
  await selectClass(navBar)
  assert.ok(generateButton(navBar).bottom >= 48 + 12, 'the whole button must sit above the navigation bar')
})

test('parent batches display their real size and retain selections beyond 100', async () => {
  const students = Array.from({ length: 101 }, (_, index) => student(`s-${index}`, { codeMassar: `s-${index}` }))
  const h = setup(parentScreen, { students, service: { createParentInvitations: async ids => ids.map(id => codeFor(id)) } })
  await selectClass(h)
  await h.press(' adminCodes.generate:100')
  assert.ok(h.button(' adminCodes.generate:1'), 'the last student must remain selected')
})

test('parent generation rejects duplicate presses before React commits busy state', async () => {
  const pending = deferred(); let calls = 0
  const h = setup(parentScreen, { students: [student()], service: { createParentInvitations: () => { calls++; return pending.promise } } })
  await selectClass(h)
  const button = h.button(' adminCodes.generate:1')
  button.props.onPress(); button.props.onPress()
  assert.equal(calls, 1)
  pending.resolve([codeFor('legacy-document')]); await h.settle()
})

test('dismissed native share does not mark a parent code as prepared', async () => {
  const h = setup(parentScreen, { students: [student()], service: { createParentInvitations: async () => [codeFor('legacy-document')] }, native: {
    Share: { sharedAction: 'sharedAction', share: async () => ({ action: 'dismissedAction' }) },
  } })
  await selectClass(h); await h.press(' adminCodes.generate:1'); await h.press(' adminCodes.share')
  assert.doesNotMatch(h.text(), /adminCodes.prepared/)
})

test('regenerating a code removes the old prepared status', async () => {
  let version = 0
  const h = setup(parentScreen, { students: [student()], service: { createParentInvitations: async () => [codeFor('legacy-document', `CODE-${++version}`)] } })
  await selectClass(h); await h.press(' adminCodes.generate:1'); await h.press(' adminCodes.share')
  assert.match(h.text(), /adminCodes.prepared/)
  await h.press('adminCodes.selectAll'); await h.press(' adminCodes.generate:1')
  assert.doesNotMatch(h.text(), /adminCodes.prepared/)
})

test('failed generation retains the selection and can be retried', async () => {
  let attempts = 0
  const h = setup(parentScreen, { students: [student()], service: {
    createParentInvitations: async () => { if (++attempts === 1) throw new Error('offline'); return [codeFor('legacy-document')] },
  } })
  await selectClass(h); await h.press('adminCodes.generate:1')
  assert.match(h.text(), /adminCodes.generateError/)
  await h.press('adminCodes.generate:1')
  assert.match(h.text(), /adminCodes.generated:1/)
  assert.doesNotMatch(h.text(), /adminCodes.generateError/)
})

test('refresh removes newly linked students from selection and generated codes', async () => {
  const students = [student()]
  const h = setup(parentScreen, { students, service: { createParentInvitations: async () => [codeFor('legacy-document')] } })
  await selectClass(h); await h.press('adminCodes.generate:1'); await h.press('adminCodes.selectAll')
  students[0] = student('legacy-document', { parentUid: 'synthetic-parent' })
  const scroll = h.find(node => node.type === 'ScrollView' && node.props.refreshControl)[0]
  scroll.props.refreshControl.props.onRefresh(); await h.settle()
  assert.doesNotMatch(h.text(), /adminCodes.generate:|adminCodes.generated:/)
  assert.equal(h.find(node => node.props.accessibilityRole === 'checkbox')[0].props.disabled, true)
})

test('WhatsApp failure is visible and does not mark a parent code as prepared', async () => {
  const h = setup(parentScreen, { students: [student()], service: { createParentInvitations: async () => [codeFor('legacy-document')] }, native: {
    Linking: { openURL: async () => { throw new Error('unavailable') } },
  } })
  await selectClass(h); await h.press('adminCodes.generate:1'); await h.press('adminCodes.whatsapp')
  assert.match(h.text(), /common.shareError/)
  assert.doesNotMatch(h.text(), /adminCodes.prepared/)
})

test('parent WhatsApp invitations use a complete international number and reject malformed contacts', async () => {
  for (const [phone, expected] of [['612345678', '212612345678'], ['٠٦١٢٣٤٥٦٧٨', '212612345678'], ['inconnu', null]]) {
    const opened = []
    const h = setup(parentScreen, {
      students: [student('legacy-document', { parentTel: phone })],
      service: { createParentInvitations: async () => [codeFor('legacy-document')] },
      native: { Linking: { openURL: async url => { opened.push(url) } } },
    })
    await selectClass(h); await h.press('adminCodes.generate:1'); await h.press('adminCodes.whatsapp')
    if (expected) {
      assert.equal(opened.length, 1)
      assert.equal(new URL(opened[0]).pathname, `/${expected}`)
      assert.match(h.text(), /adminCodes.prepared/)
    } else {
      assert.deepEqual(opened, [], 'never open an unvalidated contact URL with a personal invitation')
      assert.match(h.text(), /common.shareError/)
      assert.doesNotMatch(h.text(), /adminCodes.prepared/)
      assert.ok(h.button('adminCodes.share'), 'manual recipient selection is still available')
    }
  }
})

const teacher = { uid: 'synthetic-teacher', role: 'professeur', prenom: 'Prof', nom: 'Fictif', telephone: '0600000000' }
const row = (status = 'revoked') => ({ uid: teacher.uid,
  account: { exists: true, disabled: false, everSignedIn: true, loginPhone: '+212611111111', hasRealEmail: true },
  invitation: { id: 'old-invitation', status, phoneE164: '+212622222222', createdAtMs: 1, expiresAtMs: 2 },
})
const sheetProps = (accessRow = row()) => ({ visible: true, account: teacher, row: accessRow, onClose() {}, onChanged() {} })

test('teacher recovery prefers the current login phone over an obsolete invitation', () => {
  for (const status of ['revoked', 'used', 'expired']) {
    const h = setup(accountSheet, { props: sheetProps(row(status)) })
    const field = h.find(node => node.type === 'PhoneNumberField')[0]
    assert.equal(countries.phoneFieldValidity(field.props.value).e164, '+212611111111')
  }
})

test('teacher phone initializes when access arrives late without overwriting a typed draft', () => {
  const initial = { ...sheetProps(), row: undefined }
  const h = setup(accountSheet, { props: initial })
  h.render(sheetProps())
  let field = h.find(node => node.type === 'PhoneNumberField')[0]
  assert.equal(countries.phoneFieldValidity(field.props.value).e164, '+212611111111')
  field.props.onChange(countries.phoneFieldFromE164('+212633333333'))
  h.render({ ...sheetProps(), row: row('pending') })
  field = h.find(node => node.type === 'PhoneNumberField')[0]
  assert.equal(countries.phoneFieldValidity(field.props.value).e164, '+212633333333')
})

test('saving a login phone hides the invitation invalidated by that operation', async () => {
  const created = { invitationId: 'new-invitation', code: 'NEW-CODE-XYZ', url: 'https://example.invalid/#code', expiresAtMs: 1000, phoneE164: '+212622222222', mode: 'link' }
  const h = setup(accountSheet, { props: sheetProps(row('pending')), service: {
    createTeacherInvitation: async () => created,
    setTeacherLoginPhone: async () => ({ phone: '+212622222222' }),
  } })
  await h.press(' adminAccess.replace')
  assert.match(h.text(), /NEW-CODE-XYZ/)
  await h.press(' adminAccess.identityChecked')
  await h.press(' adminAccess.saveLoginPhone')
  assert.doesNotMatch(h.text(), /NEW-CODE-XYZ/)
})

test('revocation targets the newly created invitation while the list is still stale', async () => {
  const revoked = []
  const h = setup(accountSheet, { props: sheetProps(row('pending')), service: {
    createTeacherInvitation: async () => ({ invitationId: 'new-invitation', code: 'NEW-CODE-XYZ', expiresAtMs: 1000 }),
    revokeTeacherInvitation: async id => { revoked.push(id) },
  } })
  await h.press('adminAccess.replace'); await h.press('adminAccess.revoke')
  assert.deepEqual(revoked, ['new-invitation'])
  assert.doesNotMatch(h.text(), /NEW-CODE-XYZ/)
})

test('teacher mutations wait for access data; missing data is an error with retry', () => {
  const props = { ...sheetProps(), row: undefined, loading: true }
  const h = setup(accountSheet, { props })
  assert.ok(h.find(node => node.type === 'ActivityIndicator').length)
  assert.equal(h.button('adminAccess.create'), undefined)
  h.render({ ...props, loading: false })
  assert.match(h.text(), /adminAccess.loadError/)
  assert.ok(h.button('common.retry'))
  assert.equal(h.button('adminAccess.create'), undefined)
})

test('account recovery handles a failed share without losing the reset link', async () => {
  let fail = true
  const h = setup(accountSheet, { props: sheetProps(), service: {
    createTeacherRecoveryLink: async () => ({ resetUrl: 'https://example.invalid/reset', phone: '+212611111111', phoneIsLogin: true, expiresInMinutes: 60 }),
  }, native: { Share: { share: async () => { if (fail) throw new Error('unavailable'); return { action: 'sharedAction' } } } } })
  await h.press('adminAccess.identityChecked'); await h.press('adminAccess.generateReset'); await h.press('adminAccess.share')
  assert.match(h.text(), /common.shareError/)
  fail = false
  await h.press('adminAccess.share')
  assert.doesNotMatch(h.text(), /common.shareError/)
})

test('a failed first behavior load offers retry and does not display zero totals', async () => {
  const h = setup('screens/admin/AdminBehaviorScreen.tsx', { extra: {
    'firebase/firestore': { collection: () => ({}), getDocs: async () => { throw new Error('offline') } },
    '../../config/firebase': { db: {} }, '../../services/firestore': { toDocs: snap => snap },
    '../../utils/behavior-overview': load('utils/behavior-overview.ts'),
    '../../utils/academicPeriod': { localISODate: () => '2026-10-09' },
  } })
  await h.settle()
  assert.match(h.text(), /adminBehavior.loadError/)
  assert.doesNotMatch(h.text(), /adminBehavior.merits/)
  assert.ok(h.button('common.retry'))
})
