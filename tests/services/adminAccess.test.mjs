import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
import { test } from 'node:test'

// Fonctions pures de l'administration mobile : messages (identiques au site),
// liens WhatsApp, état d'accès des professeurs, mérites de toute l'école.
function load(path, deps = {}) {
  const source = fs.readFileSync(new URL(`../../src/${path}`, import.meta.url), 'utf8')
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const module = { exports: {} }
  new Function('require', 'module', 'exports', output)(name => {
    if (name in deps) return deps[name]
    throw new Error(`module inattendu : ${name}`)
  }, module, module.exports)
  return module.exports
}
const identity = load('utils/parentIdentity.ts')
const access = load('utils/admin-access.ts', { './parentIdentity': identity })
const behavior = load('utils/behavior-overview.ts')

test('numéro WhatsApp : indicatif sans « + », numéros marocains complétés', () => {
  assert.equal(access.whatsAppPhone('+212 6 12 34 56 78'), '212612345678')
  assert.equal(access.whatsAppPhone('0612345678'), '212612345678')
  assert.equal(access.whatsAppPhone('0033612345678'), '33612345678')
  assert.equal(access.whatsAppUrl('+212612345678', 'Code : ABC & co'), 'https://wa.me/212612345678?text=Code%20%3A%20ABC%20%26%20co')
})

// Format validé par Youssef le 10 oct. 2026 : arabe d'abord, puis français,
// brefs, code seul sur sa ligne ; « l'établissement », jamais « l'école ».
const arabicFirst = message => {
  assert.match(message, /^السلام عليكم ورحمة الله،\n/)
  assert.ok(message.indexOf('السلام') < message.indexOf('Bonjour'), 'arabic paragraph before the french one')
  assert.doesNotMatch(message, /école|المدرسة/i)
}

test('invitation professeur : arabe puis français, code seul sur sa ligne, dates dans chaque langue', () => {
  const message = access.teacherInvitationMessage('Karima', { code: 'ABC-DEFG-HJK', url: 'https://mojammaa.com/activer#ABC-DEFG-HJK', mode: 'activation' }, { ar: '16 أكتوبر', fr: '16 octobre' })
  arabicFirst(message)
  assert.match(message, /^\*ABC-DEFG-HJK\*$/m, 'the code is alone on its line')
  assert.match(message, /حساب الأستاذ\(ة\) Karima، صالح لمرة واحدة إلى غاية 16 أكتوبر:/)
  assert.match(message, /^Bonjour Karima, .*valable jusqu’au 16 octobre\)/m)
  assert.match(message, /«أول مرة؟ تفعيل حسابي»، أدخلوا الرمز ورقم هاتفكم، ثم اختاروا كلمة المرور/)
  assert.match(message, /« Première connexion \? Activer mon compte », saisissez ce code et votre numéro, puis choisissez votre mot de passe/)
  assert.match(message, /^Sans application : https:\/\/mojammaa\.com\/activer#ABC-DEFG-HJK$/m)
  const link = access.teacherInvitationMessage('Omar', { code: 'XYZ-WXYZ-UVW', url: 'u', mode: 'link' }, { ar: 'غداً', fr: 'demain' })
  arabicFirst(link)
  assert.match(link, /كلمة المرور لا تتغير/)
  assert.match(link, /Votre mot de passe ne change pas/)
  assert.doesNotMatch(link, /choisissez votre mot de passe|اختاروا كلمة المرور/)
})

test('lien de réinitialisation : arabe puis français, connexion par téléphone seulement si c’est l’identifiant', () => {
  const byPhone = access.resetLinkMessage('Fatima', { resetUrl: 'https://mojammaa.com/reset-password?oobCode=x', phone: '+212612345678', phoneIsLogin: true, expiresInMinutes: 60 })
  arabicFirst(byPhone)
  assert.match(byPhone, /^https:\/\/mojammaa\.com\/reset-password\?oobCode=x$/m, 'the link is alone on its line')
  assert.match(byPhone, /صالح لمرة واحدة ولمدة ساعة:/)
  assert.match(byPhone, /ثم سجّلوا الدخول برقم هاتفكم وكلمة المرور الجديدة\./)
  assert.match(byPhone, /valable 1 heure\)\. Connectez-vous ensuite avec votre numéro et ce nouveau mot de passe\./)
  const contactOnly = access.resetLinkMessage('Fatima', { resetUrl: 'u', phone: '+212612345678', phoneIsLogin: false, expiresInMinutes: 30 })
  arabicFirst(contactOnly)
  assert.doesNotMatch(contactOnly, /سجّلوا الدخول برقم هاتفكم|Connectez-vous ensuite/)
  assert.match(contactOnly, /ولمدة 30 دقيقة:/)
  assert.match(contactOnly, /valable 30 minutes\)/)
})

test('code parent : arabe puis français, code seul sur sa ligne, liens Android et iPhone', () => {
  const message = access.parentCodeMessage({ studentId: 'M1', studentName: 'Yasmine Alaoui', classe: '2APIC-1', code: 'MNP-QRST-UVW' })
  arabicFirst(message)
  assert.match(message, /هذا رمز تفعيل حساب ولي أمر التلميذ\(ة\) Yasmine Alaoui \(2APIC-1\):/)
  assert.match(message, /^\*MNP-QRST-UVW\*$/m, 'the code is alone on its line')
  assert.match(message, /«أول مرة؟ تفعيل حسابي»/)
  assert.match(message, /compte parent de Yasmine Alaoui \(2APIC-1\)\./)
  assert.match(message, /touchez « Première connexion \? Activer mon compte »/)
  assert.doesNotMatch(message, /Activer un compte parent/)
  assert.match(message, /^Android : https:\/\/play\.google\.com\/store\/apps\/details\?id=com\.youssefatalha\.mojammaasgs$/m)
  assert.match(message, /^iPhone \/ ordinateur : https:\/\/mojammaa\.com\/parents\/activer#MNP-QRST-UVW$/m)
})

test('état d’accès d’un professeur : compte et invitation distincts, même règle que le site', () => {
  const account = (extra = {}) => ({ exists: true, disabled: false, everSignedIn: false, loginPhone: null, hasRealEmail: true, ...extra })
  const invitation = status => ({ id: 'i', status, mode: 'activation', phoneE164: '+212600000000', addsTeacherRole: false, codeLast4: 'ABCD', createdAtMs: 0, expiresAtMs: 0, usedAtMs: null, revokedAtMs: null, revokeReason: null })
  assert.equal(access.teacherAccessBadge(undefined), 'unknown')
  assert.equal(access.teacherAccessBadge({ uid: 'a', account: account(), invitation: null }), 'to-invite')
  assert.equal(access.teacherAccessBadge({ uid: 'a', account: account({ everSignedIn: true }), invitation: null }), 'active-email')
  assert.equal(access.teacherAccessBadge({ uid: 'a', account: account(), invitation: invitation('pending') }), 'pending')
  assert.equal(access.teacherAccessBadge({ uid: 'a', account: account({ loginPhone: '+212600000000' }), invitation: invitation('used') }), 'phone')
  assert.equal(access.teacherAccessBadge({ uid: 'a', account: account(), invitation: invitation('expired') }), 'expired')
  assert.equal(access.teacherAccessBadge({ uid: 'a', account: account(), invitation: invitation('revoked') }), 'revoked')
  assert.equal(access.teacherAccessBadge({ uid: 'a', account: account({ disabled: true }), invitation: invitation('pending') }), 'disabled')
  // Numéro posé par l'administration (« Enregistrer le numéro ») : le serveur
  // révoque l'invitation en attente, mais le professeur se connecte bien.
  const withPhone = account({ loginPhone: '+212600000000' })
  assert.equal(access.teacherAccessBadge({ uid: 'a', account: withPhone, invitation: invitation('revoked') }), 'phone')
  assert.equal(access.teacherAccessBadge({ uid: 'a', account: withPhone, invitation: invitation('expired') }), 'phone')
  assert.equal(access.teacherAccessBadge({ uid: 'a', account: withPhone, invitation: invitation('pending') }), 'pending', 'an invitation in progress stays visible')
})

const entry = (id, eleveId, classe, date, kind, extra = {}) => ({
  id, eleveId, eleveNom: eleveId, elevePrenom: 'P', classe, date, kind, reason: kind === 'merite' ? 'participation' : 'talking',
  teacherId: 't', teacherNom: 'Prof', ...extra,
})
const entries = [
  entry('1', 'A', '2APIC-1', '2026-10-02', 'merite'),
  entry('2', 'A', '2APIC-1', '2026-10-05', 'avertissement'),
  entry('3', 'B', '2APIC-1', '2026-10-06', 'avertissement'),
  entry('4', 'B', '2APIC-1', '2026-10-07', 'avertissement', { cancelledAt: { seconds: 1 } }),
  entry('5', 'C', '10AEP', '2026-09-20', 'merite'),
  entry('6', 'D', '3APIC-2', '2026-06-01', 'merite'),
  entry('7', 'E', '2APIC-1', '2026-10-30', 'merite'),
]

test('mérites de l’école : annulations visibles mais hors totaux, périodes mois / année / tout', () => {
  const month = behavior.summarizeBehavior(entries, 'month', '2026-10-09')
  assert.deepEqual(month.totals, { merites: 1, avertissements: 2, students: 2, cancelled: 1 })
  assert.deepEqual(month.recent.map(item => item.id), ['4', '3', '2', '1'], 'journal du plus récent au plus ancien, entrée future exclue')
  const year = behavior.summarizeBehavior(entries, 'year', '2026-10-09')
  assert.equal(year.totals.merites, 2)
  assert.deepEqual(year.byClass.map(room => [room.classe, room.merites, room.avertissements, room.students]), [['2APIC-1', 1, 2, 2], ['10AEP', 1, 0, 1]])
  const all = behavior.summarizeBehavior(entries, 'all', '2026-10-09')
  assert.deepEqual(all.byClass.map(room => room.classe), ['2APIC-1', '3APIC-2', '10AEP'], 'tri naturel des classes')
  assert.equal(behavior.scopeStart('year', '2026-08-15'), '2025-09-01')
})

test('détail d’une classe : élèves à suivre d’abord', () => {
  const room = behavior.summarizeBehavior(entries, 'year', '2026-10-09', '2APIC-1')
  assert.deepEqual(room.byStudent.map(student => [student.eleveId, student.merites, student.avertissements]), [['A', 1, 1], ['B', 0, 1]])
  assert.equal(room.byStudent[1].lastDate, '2026-10-06', 'l’entrée annulée ne compte pas comme dernière entrée')
})
