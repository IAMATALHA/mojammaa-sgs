/**
 * Throttling transactionnel du reset de mot de passe brandé (batch sécurité 5,
 * 2026-07-12). Extrait dans son propre module pour être testable à l'émulateur
 * SANS déclencher d'envoi Resend réel (cf. tests/functions/resetThrottle.test.mjs).
 *
 * Deux garde-fous indépendants :
 *   - claimEmailSlot : cooldown atomique PAR EMAIL (anti email-bomb d'une
 *     victime). Réserve le créneau dans une transaction → des appels parallèles
 *     pour le même email ne peuvent pas tous passer.
 *   - claimGlobalSlot : plafond GLOBAL glissant sur les envois réels (borne le
 *     quota Resend / le spam de masse). À n'appeler QU'APRÈS avoir confirmé que
 *     l'email est connu, pour que des sondes d'emails inconnus ne puissent pas
 *     épuiser le budget et bloquer les resets légitimes.
 */
const { FieldValue } = require('firebase-admin/firestore')

const COOLDOWN_COLLECTION = 'passwordResetCooldowns'
// Pas de `__..__` : Firestore réserve les IDs entourés de double underscore
// (INVALID_ARGUMENT à l'écriture). Pas d'`@` → aucune collision possible avec
// un doc de cooldown par-email (les emails en contiennent forcément un).
const GLOBAL_DOC = 'global-counter'

/**
 * Réserve atomiquement le créneau du `email`. Retourne true si l'appelant a le
 * droit d'envoyer (créneau libre, désormais réservé), false s'il est en cooldown.
 */
async function claimEmailSlot(db, email, cooldownMs, now = Date.now()) {
  const ref = db.collection(COOLDOWN_COLLECTION).doc(email)
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    const last = snap.exists ? snap.get('lastSentAt') : null
    const lastMs = last && last.toMillis ? last.toMillis() : (typeof last === 'number' ? last : 0)
    if (now - lastMs < cooldownMs) return false
    tx.set(ref, { lastSentAt: FieldValue.serverTimestamp() }, { merge: true })
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

module.exports = { claimEmailSlot, claimGlobalSlot }
