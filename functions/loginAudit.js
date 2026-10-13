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
 *   - l'IP est LUE PAR LE SERVEUR dans `x-forwarded-for` : la DERNIÈRE
 *     entrée, celle que Google ajoute lui-même (cf. clientIpFrom) → fiable ;
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
// indéfiniment. Une TTL policy Firestore de production cible
// `auditLog.expiresAt`; chaque entrée porte donc sa propre échéance.
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

/**
 * Chaîne `x-forwarded-for` découpée et nettoyée, dans l'ordre reçu. Bornée
 * par la FIN : ce sont les dernières entrées qui viennent de Google, un
 * client qui en envoie des dizaines ne peut pas en chasser la vraie.
 */
function forwardedChain(rawRequest) {
  const header = rawRequest && rawRequest.headers && rawRequest.headers['x-forwarded-for']
  return (Array.isArray(header) ? header.join(',') : header || '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(-8) // borne : la chaîne vient en partie du client
    .map((p) => p.slice(0, 45)) // 45 = longueur max d'une IPv6 textuelle
}

/**
 * IP réelle de l'appelant : la DERNIÈRE entrée de la chaîne.
 *
 * Chaque relais ajoute à la fin l'adresse de celui qui s'est connecté à lui.
 * La dernière entrée est donc l'adresse qui a réellement joint Google ; tout
 * ce qui la précède a été envoyé par l'appelant lui-même et peut être
 * inventé. L'ancienne version prenait la PREMIÈRE entrée : un client qui
 * envoyait son propre en-tête choisissait l'adresse journalisée.
 *
 * Mesuré le 2026-10-13 sur les 339 connexions du journal : toutes portent UNE
 * seule entrée, publique (Google n'ajoute aucun relais à lui après le
 * client). Pour ces connexions, première et dernière entrée sont la même :
 * le journal existant reste juste.
 *
 * `ipChain` reste stocké à côté dès qu'il y a plus d'une entrée : une chaîne
 * longue signale un en-tête envoyé par l'appelant.
 */
function clientIpFrom(rawRequest) {
  if (!rawRequest) return null
  const chain = forwardedChain(rawRequest)
  if (chain.length) return chain[chain.length - 1]
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
  // Distinct de `brand` : sur beaucoup d'appareils Android la marque commerciale
  // n'est pas le constructeur (brand `Redmi` / manufacturer `Xiaomi`,
  // brand `Poco` / manufacturer `Xiaomi`). Garder les deux evite de trancher
  // a tort laquelle est « la marque ».
  const manufacturer = boundedText(input.manufacturer, 40)
  const model = boundedText(input.model, 60)
  const idiom = boundedText(input.idiom, 20)
  const appVersion = boundedText(input.appVersion, 20)

  const os = osVersion ? `${platform} ${osVersion}` : platform

  // Libelle lisible pre-calcule, pour que les lecteurs n'aient pas a rejouer
  // l'asymetrie entre plateformes. A defaut de modele (cas iOS), l'idiome
  // (`phone` / `pad`) evite un libelle reduit a la seule marque.
  const parts = [brand, model].filter(Boolean)
  if (!model && idiom) parts.push(idiom)
  const hardware = parts.join(' ') || null

  return {
    platform,
    osVersion,
    brand,
    manufacturer,
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
    // Chaîne brute, seulement s'il y a plus d'une entrée : sert à repérer un
    // en-tête envoyé par l'appelant (cf. clientIpFrom).
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
