/**
 * Génération de mots de passe temporaires — cryptographiquement sûre.
 *
 * ⚠️ Ne JAMAIS revenir à un schéma prévisible (`email + '1234'`, `Password123!`,
 * `Math.random()`…). Un mot de passe devinable = compte parent/prof ouvert à
 * quiconque connaît l'email. Batch sécurité 4 (2026-07-11).
 *
 * `crypto.randomBytes` est un CSPRNG (contrairement à Math.random, prévisible).
 * On mappe chaque octet sur un alphabet sans caractères ambigus (0/O, 1/l/I)
 * pour rester lisible si un mot de passe doit être communiqué à la main.
 */
const crypto = require('crypto')

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'

/**
 * Mot de passe temporaire de `length` caractères + un '!' (satisfait la
 * politique "1 caractère spécial" des providers). Défaut : 16 (~92 bits).
 */
function randomPassword(length = 16) {
  let pwd = ''
  // crypto.randomInt = tirage uniforme sans biais modulo (rejection sampling
  // interne), source CSPRNG. Un caractère par position.
  for (let i = 0; i < length; i++) {
    pwd += ALPHABET[crypto.randomInt(ALPHABET.length)]
  }
  return pwd + '!'
}

module.exports = { randomPassword }
