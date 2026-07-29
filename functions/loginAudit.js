/**
 * Journal des connexions — IP observée serveur + appareil déclaré client.
 *
 * Pourquoi une callable et pas une blocking function `beforeUserSignedIn` :
 * celle-ci exigerait d'upgrader le projet en Identity Platform (changement de
 * facturation) et surtout, si elle échoue ou dépasse son délai, PLUS PERSONNE
 * ne peut se connecter. Pour un journal de confort, mettre un point de panne
 * sur le chemin de login d'une école est un mauvais échange. Et son
 * `event.userAgent` ne donne de toute façon pas le modèle sous React Native
 * (`okhttp/…` côté Android).
 *
 * Ce que ça garantit, et ce que ça ne garantit pas :
 *   - l'IP est LUE PAR LE SERVEUR dans `x-forwarded-for` (posé par le load
 *     balancer Google, non falsifiable par le client) → fiable ;
 *   - l'appareil est DÉCLARÉ par le client → un client modifié peut mentir ou
 *     ne jamais appeler la fonction. C'est un journal d'usage, pas une preuve
 *     opposable. Une connexion absente du journal n'est donc pas une preuve
 *     d'absence de connexion.
 *
 * L'écriture passe par l'Admin SDK : les règles gardent `auditLog` en
 * `write: false`, le journal reste non falsifiable depuis un compte surveillé.
 */
const { FieldValue, Timestamp } = require('firebase-admin/firestore')

const COLLECTION = 'auditLog'

// L'IP est une donnée personnelle (loi 09-08 / CNDP) : on ne la garde pas
// indéfiniment. Le champ `expiresAt` permet de brancher une TTL policy
// Firestore sans migration (cf. README de la fonction).
const RETENTION_DAYS = 180

// Un utilisateur ne se connecte pas deux fois dans la même minute. Ancrer l'ID
// du document sur la minute dédoublonne les re-rendus du client ET plafonne
// mécaniquement ce qu'un appelant peut écrire (1 doc/min/compte), sans avoir à
// maintenir un compteur séparé.
const BUCKET_MS = 60_000

const PLATFORMS = new Set(['ios', 'android', 'web'])

/** Borne une chaîne venant du client : type, taille, espaces parasites. */
function boundedText(value, max = 60) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.slice(0, max)
}

/** Chaîne `x-forwarded-for` découpée et nettoyée, dans l'ordre reçu. */
function forwardedChain(rawRequest) {
  const header = rawRequest && rawRequest.headers && rawRequest.headers['x-forwarded-for']
  return (Array.isArray(header) ? header.join(',') : header || '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, 8) // borne : la chaîne vient en partie du client
    .map((p) => p.slice(0, 45)) // 45 = longueur max d'une IPv6 textuelle
}

/**
 * IP réelle de l'appelant.
 *
 * Google documente pour les Cloud Functions : « X-Forwarded-For: clientIp,
 * proxy1Ip, proxy2Ip — le premier IP de cette liste est généralement celui du
 * client » → on prend la PREMIÈRE entrée.
 *
 * Nuance importante, et c'est pourquoi `ipChain` est stocké à côté : la
 * position de tête est celle qu'un client peut forger s'il envoie son propre
 * en-tête et que l'infra se contente d'ajouter à la suite. Garder la chaîne
 * entière permet (a) de vérifier empiriquement le format réel après
 * déploiement — se connecter depuis une IP connue et comparer — et (b) de
 * détecter après coup une entrée forgée (chaîne anormalement longue). Sans la
 * chaîne, une valeur fausse serait indétectable.
 */
function clientIpFrom(rawRequest) {
  if (!rawRequest) return null
  const chain = forwardedChain(rawRequest)
  if (chain.length) return chain[0]
  return boundedText(rawRequest.ip, 45)
}

/**
 * Normalise l'appareil déclaré par le client.
 *
 * Sous Android, `Platform.constants` donne la marque et le modèle réels
 * (`samsung` / `SM-A546B`). Sous iOS, Apple ne les expose pas : on n'a que
 * l'idiome (`phone` / `pad`) et la version d'OS. Le champ `label` pré-calcule
 * la forme lisible pour que les lecteurs n'aient pas à rejouer cette asymétrie.
 */
function describeDevice(raw) {
  const input = raw && typeof raw === 'object' ? raw : {}

  const platform = PLATFORMS.has(input.platform) ? input.platform : 'unknown'
  const osVersion = boundedText(input.osVersion, 20)
  const brand = boundedText(input.brand, 40)
  const model = boundedText(input.model, 60)
  const idiom = boundedText(input.idiom, 20)
  const appVersion = boundedText(input.appVersion, 20)

  const os = osVersion ? `${platform} ${osVersion}` : platform
  const hardware = [brand, model].filter(Boolean).join(' ') || idiom || null

  return {
    platform,
    osVersion,
    brand,
    model,
    idiom,
    appVersion,
    label: hardware ? `${hardware} — ${os}` : os,
  }
}

/** ID stable par compte et par minute (cf. BUCKET_MS). */
function loginEntryId(uid, now = Date.now()) {
  return `login_${uid}_${Math.floor(now / BUCKET_MS)}`
}

/**
 * Entrée prête à écrire. `at` est un timestamp SERVEUR : l'horodatage ne
 * dépend pas de l'horloge du téléphone, qu'un utilisateur peut régler.
 */
function buildLoginEntry({ uid, email, role, ip, ipChain, device, now = Date.now() }) {
  return {
    action: 'login',
    actorUid: uid,
    actorEmail: email || null,
    actorRole: role || null,
    ip: ip || null,
    // Chaîne brute : sert à vérifier le format réel et à repérer une entrée
    // forgée (cf. clientIpFrom). Redondant avec `ip` par construction.
    ipChain: Array.isArray(ipChain) && ipChain.length > 1 ? ipChain : null,
    device,
    at: FieldValue.serverTimestamp(),
    expiresAt: Timestamp.fromMillis(now + RETENTION_DAYS * 86_400_000),
  }
}

module.exports = {
  COLLECTION,
  RETENTION_DAYS,
  BUCKET_MS,
  boundedText,
  forwardedChain,
  clientIpFrom,
  describeDevice,
  loginEntryId,
  buildLoginEntry,
}
