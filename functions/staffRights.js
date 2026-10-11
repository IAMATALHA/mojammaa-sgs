/**
 * Droits du personnel administratif (rôle `staff`).
 *
 * Copie des clés de mojammaa-admin/functions/src/staffRights.ts, qui fait foi :
 * tests/functions/staffRights.test.mjs compare les deux listes et vérifie que
 * les règles Firestore (`can('…')`) n'emploient que ces clés.
 *
 * Un compte `staff` n'a aucun droit par défaut : chaque droit est une case de
 * `users/{uid}.droits`, écrite par le serveur uniquement.
 */
const STAFF_ROLE = 'staff'

const STAFF_RIGHTS = [
  'eleves.voir',
  'eleves.modifier',
  'absences.voir',
  'absences.saisir',
  'comportements.voir',
  'comportements.saisir',
  'sortie',
  'priere',
  'suivis',
  'notes.voir',
  'edt.voir',
  'messages.boite',
  'messages.envoyer',
  'calendrier.modifier',
  'rendezvous',
  'enseignants.modifier',
  'codes.parents',
  'codes.professeurs',
  'comptes.gerer',
]

/**
 * Droits qu'un admin n'a pas d'office (ils touchent aux accès) : il doit les
 * porter lui aussi. Aucune règle Firestore ne les emploie.
 */
const EXPLICIT_RIGHTS = ['comptes.gerer', 'codes.professeurs']

/**
 * Même décision que `can()` dans firestore.rules : l'admin a les droits
 * ordinaires, un compte staff seulement ceux de sa fiche, tout autre rôle
 * aucun — un champ `droits` sur la fiche d'un professeur ou d'un parent ne
 * vaut rien. `user` : données de `users/{uid}` (ou rien si la fiche manque).
 */
function hasRight(user, right) {
  if (!user || !STAFF_RIGHTS.includes(right)) return false
  const held = Array.isArray(user.droits) && user.droits.includes(right)
  if (user.role === 'admin') return held || !EXPLICIT_RIGHTS.includes(right)
  return user.role === STAFF_ROLE && held
}

/**
 * Comptes du personnel qui portent ce droit (les admins ne sont pas listés :
 * l'appelant les ajoute s'il les veut). La requête lit le champ `droits`, puis
 * `hasRight` écarte toute fiche qui ne serait pas un compte staff.
 */
async function staffUidsWithRight(db, right) {
  const snap = await db.collection('users').where('droits', 'array-contains', right).get()
  return snap.docs.filter(doc => doc.get('role') === STAFF_ROLE && hasRight(doc.data(), right)).map(doc => doc.id)
}

module.exports = { STAFF_ROLE, STAFF_RIGHTS, EXPLICIT_RIGHTS, hasRight, staffUidsWithRight }
