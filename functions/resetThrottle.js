/**
 * Throttling transactionnel du reset de mot de passe brandé (batch sécurité 5,
 * 2026-07-12). Extrait dans son propre module pour être testable à l'émulateur
 * SANS déclencher d'envoi Resend réel (cf. tests/functions/resetThrottle.test.mjs).
 *
 * Deux garde-fous indépendants :
 *   - claimEmailSlot : limites atomiques PAR EMAIL (anti email-bomb d'une
 *     victime) : un délai minimal entre deux envois ET un nombre d'envois par
 *     fenêtre. Réserve le créneau dans une transaction → des appels parallèles
 *     pour le même email ne peuvent pas tous passer.
 *   - claimGlobalSlot : plafond GLOBAL glissant sur les envois réels (borne le
 *     quota Resend / le spam de masse). À n'appeler QU'APRÈS avoir confirmé que
 *     l'email est connu, pour que des sondes d'emails inconnus ne puissent pas
 *     épuiser le budget et bloquer les resets légitimes.
 *
 * Durci 2026-10-13 (audit) : le délai seul laissait 60 e-mails par heure vers
 * une même personne, et deux adresses connues suffisaient à atteindre le
 * plafond global, donc à bloquer les resets de toute l'école. Le plafond par
 * email remonte ce seuil au nombre d'adresses (plafond global / plafond par
 * email). Le document n'est plus nommé par l'adresse en clair.
 */
const { createHash } = require('node:crypto')
const { FieldValue } = require('firebase-admin/firestore')

const COOLDOWN_COLLECTION = 'passwordResetCooldowns'
// Pas de `__..__` : Firestore réserve les IDs entourés de double underscore
// (INVALID_ARGUMENT à l'écriture). Aucune collision possible avec un créneau
// par email, toujours préfixé `e_`.
const GLOBAL_DOC = 'global-counter'

/** Identifiant du créneau d'un email : son empreinte, jamais l'adresse. */
function emailSlotId(email) {
  return `e_${createHash('sha256').update(String(email)).digest('hex').slice(0, 40)}`
}

/**
 * Réserve atomiquement un envoi pour `email`. Retourne true si l'appelant a le
 * droit d'envoyer (créneau désormais réservé), false s'il est encore dans le
 * délai `cooldownMs` ou s'il a atteint `maxInWindow` envois sur `windowMs`.
 */
async function claimEmailSlot(db, email, { cooldownMs, windowMs, maxInWindow }, now = Date.now()) {
  const ref = db.collection(COOLDOWN_COLLECTION).doc(emailSlotId(email))
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    const last = snap.exists ? snap.get('lastSentAt') : null
    const lastMs = last && last.toMillis ? last.toMillis() : (typeof last === 'number' ? last : 0)
    if (now - lastMs < cooldownMs) return false
    let winStart = (snap.exists && snap.get('windowStartAt')) || 0
    let count    = (snap.exists && snap.get('count')) || 0
    if (now - winStart > windowMs) { winStart = now; count = 0 }
    if (count >= maxInWindow) return false
    tx.set(ref, { lastSentAt: FieldValue.serverTimestamp(), windowStartAt: winStart, count: count + 1 })
    return true
  })
}

/**
 * Incrémente le compteur global dans une fenêtre glissante. Retourne true si
 * sous le plafond (et compte l'envoi), false si le plafond est atteint.
 */
async function claimGlobalSlot(db, windowMs, maxInWindow, now = Date.now()) {
  const ref = db.collection(COOLDOWN_COLLECTION).doc(GLOBAL_DOC)
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    let winStart = (snap.exists && snap.get('windowStartAt')) || 0
    let count    = (snap.exists && snap.get('count')) || 0
    if (now - winStart > windowMs) { winStart = now; count = 0 }
    if (count >= maxInWindow) return false
    tx.set(ref, { windowStartAt: winStart, count: count + 1 }, { merge: true })
    return true
  })
}

module.exports = { claimEmailSlot, claimGlobalSlot, emailSlotId, COOLDOWN_COLLECTION }
