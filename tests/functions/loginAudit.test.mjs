/**
 * Journal des connexions (IP + appareil).
 *
 * Ce que ces tests protègent, dans l'ordre d'importance :
 *   1. l'IP retenue — c'est la seule donnée du journal qui soit constatée
 *      serveur ; si la position dans `x-forwarded-for` change, tout le journal
 *      ment silencieusement, sans erreur ni log ;
 *   2. le bornage de ce qui vient du client — `describeDevice` reçoit un objet
 *      arbitraire depuis le téléphone et écrit dans le journal d'audit ;
 *   3. le plafond d'écriture par compte, porté par l'ID de document.
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  forwardedChain, clientIpFrom, describeDevice, loginEntryId, buildLoginEntry, BUCKET_MS,
} = require('../../functions/loginAudit.js')

// ── IP : position dans x-forwarded-for ────────────────────────────────────
// Google documente « clientIp, proxy1Ip, proxy2Ip » → la tête est le client.
assert.equal(clientIpFrom({ headers: { 'x-forwarded-for': '102.98.15.57' } }), '102.98.15.57')
assert.equal(
  clientIpFrom({ headers: { 'x-forwarded-for': '102.98.15.57, 35.191.8.2, 130.211.0.9' } }),
  '102.98.15.57',
)

// En-tête répété : Node peut livrer un tableau, la chaîne doit rester ordonnée.
assert.equal(
  clientIpFrom({ headers: { 'x-forwarded-for': ['102.98.15.57', '35.191.8.2'] } }),
  '102.98.15.57',
)

// Repli sur l'IP résolue par Express quand l'en-tête est absent.
assert.equal(clientIpFrom({ headers: {}, ip: '81.192.3.4' }), '81.192.3.4')
assert.equal(clientIpFrom(null), null)

// IPv6 : ne doit pas être tronquée (45 caractères de marge).
const v6 = '2001:0db8:85a3:0000:0000:8a2e:0370:7334'
assert.equal(clientIpFrom({ headers: { 'x-forwarded-for': v6 } }), v6)

// ── Chaîne : bornée, car partiellement fournie par le client ──────────────
const flood = Array.from({ length: 40 }, (_, i) => `10.0.0.${i}`).join(', ')
assert.equal(forwardedChain({ headers: { 'x-forwarded-for': flood } }).length, 8)
assert.deepEqual(forwardedChain({ headers: {} }), [])
// Une entrée surdimensionnée ne peut pas gonfler le document d'audit.
assert.equal(
  forwardedChain({ headers: { 'x-forwarded-for': 'x'.repeat(500) } })[0].length,
  45,
)

// ── Appareil : tout vient du client, donc rien n'est pris tel quel ────────
const android = describeDevice({
  platform: 'android', osVersion: '14', brand: 'samsung', model: 'SM-A546B', appVersion: '1.0.15',
})
assert.equal(android.label, 'samsung SM-A546B — android 14')
assert.equal(android.appVersion, '1.0.15')

// iOS : la marque est connue avec certitude (tout iOS est un Apple), mais
// Apple n'expose pas le modèle → on retombe sur l'idiome, sans inventer.
const ios = describeDevice({ platform: 'ios', osVersion: '18.2', brand: 'Apple', idiom: 'phone' })
assert.equal(ios.label, 'Apple phone — ios 18.2')
assert.equal(ios.brand, 'Apple')
assert.equal(ios.model, null)

// Sous-marque Android : `brand` est la marque commerciale, `manufacturer` le
// constructeur. Les confondre ferait disparaître l'une des deux.
const redmi = describeDevice({
  platform: 'android', osVersion: '13', brand: 'Redmi', manufacturer: 'Xiaomi', model: '22120RN86G',
})
assert.equal(redmi.brand, 'Redmi')
assert.equal(redmi.manufacturer, 'Xiaomi')
assert.equal(redmi.label, 'Redmi 22120RN86G — android 13')

// Le modèle prime sur l'idiome quand les deux sont là : pas de « phone » en trop.
assert.equal(
  describeDevice({ platform: 'ios', osVersion: '18.2', brand: 'Apple', model: 'iPhone 7 Plus', idiom: 'phone' }).label,
  'Apple iPhone 7 Plus — ios 18.2',
)

// Plateforme non reconnue → 'unknown', jamais la valeur brute du client.
assert.equal(describeDevice({ platform: 'windows-phone' }).platform, 'unknown')
assert.equal(describeDevice({ platform: '../../etc/passwd' }).platform, 'unknown')

// Types non-chaîne : ignorés plutôt qu'écrits tels quels dans le journal.
const hostile = describeDevice({
  platform: 'ios', model: { $ne: null }, brand: 42, manufacturer: true, osVersion: [],
})
assert.equal(hostile.model, null)
assert.equal(hostile.brand, null)
assert.equal(hostile.manufacturer, null)
assert.equal(hostile.osVersion, null)
assert.equal(hostile.label, 'ios')

// Chaînes surdimensionnées : bornées, pas rejetées (on garde l'info utile).
assert.equal(describeDevice({ platform: 'android', model: 'M'.repeat(500) }).model.length, 60)
assert.equal(describeDevice({ platform: 'android', brand: 'B'.repeat(500) }).brand.length, 40)
assert.equal(describeDevice({ platform: 'android', manufacturer: 'M'.repeat(500) }).manufacturer.length, 40)

// Entrée vide / absente : ne jette pas.
assert.equal(describeDevice(undefined).platform, 'unknown')
assert.equal(describeDevice(null).label, 'unknown')

// ── ID de document : plafonne les écritures à 1/minute/compte ─────────────
const t0 = 1_753_800_000_000
assert.equal(loginEntryId('uid1', t0), loginEntryId('uid1', t0 + BUCKET_MS - 1))
assert.notEqual(loginEntryId('uid1', t0), loginEntryId('uid1', t0 + BUCKET_MS))
// Deux comptes différents ne doivent jamais s'écraser mutuellement.
assert.notEqual(loginEntryId('uid1', t0), loginEntryId('uid2', t0))

// ── Entrée écrite ─────────────────────────────────────────────────────────
const entry = buildLoginEntry({
  uid: 'uid1', email: 'a@b.ma', role: 'parent', ip: '102.98.15.57',
  ipChain: ['102.98.15.57', '35.191.8.2'], device: android, now: t0,
})
assert.equal(entry.action, 'login')
assert.equal(entry.actorUid, 'uid1')
assert.equal(entry.ip, '102.98.15.57')
// L'horodatage est un sentinelle serveur, pas l'horloge du téléphone : c'est
// ce qui rend le journal indépendant de la date réglée sur l'appareil.
// `instanceof FieldValue` ne marche pas ici — la racine et functions/ ont deux
// copies de firebase-admin, donc deux identités de classe distinctes.
assert.equal(entry.at.constructor.name, 'ServerTimestampTransform')
assert.notEqual(typeof entry.at, 'number', "at ne doit jamais être une date client")
// Rétention : l'IP est une donnée personnelle, l'entrée porte sa date de péremption.
assert.ok(entry.expiresAt.toMillis() > t0)

// Chaîne à un seul élément = aucune information de plus que `ip` → non stockée.
assert.equal(buildLoginEntry({ uid: 'u', ipChain: ['1.2.3.4'], device: ios, now: t0 }).ipChain, null)

// Champs absents : null explicite, jamais `undefined` (Firestore le rejette).
const bare = buildLoginEntry({ uid: 'u', device: ios, now: t0 })
for (const k of ['actorEmail', 'actorRole', 'ip', 'ipChain']) {
  assert.equal(bare[k], null, `${k} doit être null, pas undefined`)
}

console.log('✅ loginAudit — IP, appareil, plafond et rétention')
