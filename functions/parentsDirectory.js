'use strict'

/**
 * Annuaire des parents, pré-agrégé pour le sélecteur de destinataires.
 *
 * POURQUOI : `getRecipientsList` (app admin) lisait la collection `users`
 * ENTIÈRE plus la collection `eleves` ENTIÈRE à chaque ouverture du sélecteur —
 * de l'ordre de 1 300 documents à 600 élèves, soit plusieurs secondes d'attente
 * et autant de lectures facturées. Le contenu ne change pourtant qu'aux
 * inscriptions et aux changements de classe.
 *
 * Ce module calcule le document `directoryAdmin/parents`. Il est volontairement
 * SANS dépendance Firebase pour rester testable et pour que la forme du
 * document soit vérifiable indépendamment de son écriture.
 *
 * Confidentialité : ce document associe des noms de parents, leurs e-mails et
 * les noms + classes de leurs enfants. Il ne vit donc PAS dans `directory/`,
 * lisible par les professeurs et les tuteurs, mais dans `directoryAdmin/`,
 * réservé aux administrateurs (firestore.rules).
 */

/** Un document `eleves` sans champ `active` est un ancien doc, donc actif. */
function isActiveEleve(eleve) {
  return !eleve || eleve.active !== false
}

function asString(value) {
  return typeof value === 'string' ? value.trim() : ''
}

/** Libellé d'un enfant tel qu'affiché sous son parent dans le sélecteur. */
function childLabel(eleve) {
  return `${asString(eleve.prenom)} ${asString(eleve.nom)} · ${asString(eleve.classe)}`.trim()
}

function byName(a, b) {
  return `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`, 'fr')
}

/**
 * Construit le contenu de `directoryAdmin/parents`.
 *
 * @param users  [{ id, role, nom, prenom, email }]
 * @param eleves [{ id, parentUid, nom, prenom, classe, active }]
 * @returns { parents: [{ uid, nom, prenom, email, children: string[] }], classes: string[] }
 *
 * Reproduit exactement la projection que le client construisait lui-même :
 * mêmes libellés d'enfants, même tri par « nom prénom » en français, mêmes
 * classes déduites des seuls élèves actifs.
 */
function buildParentsDirectory(users, eleves) {
  const childrenByParent = new Map()
  const classSet = new Set()

  for (const eleve of eleves || []) {
    if (!isActiveEleve(eleve)) continue
    const classe = asString(eleve.classe)
    if (classe) classSet.add(classe)
    const parentUid = asString(eleve.parentUid)
    if (!parentUid) continue
    if (!childrenByParent.has(parentUid)) childrenByParent.set(parentUid, [])
    childrenByParent.get(parentUid).push(childLabel(eleve))
  }
  // Tri des enfants : sans lui, l'ordre dépendrait de celui de la collection et
  // le libellé d'un parent changerait sans raison d'un rafraîchissement à l'autre.
  childrenByParent.forEach((list) => list.sort((a, b) => a.localeCompare(b, 'fr')))

  const parents = (users || [])
    .filter((user) => user && user.role === 'parent')
    .map((user) => ({
      uid: asString(user.id),
      nom: asString(user.nom),
      prenom: asString(user.prenom),
      email: asString(user.email),
      children: childrenByParent.get(asString(user.id)) || [],
    }))
    .sort(byName)

  return { parents, classes: [...classSet].sort() }
}

/**
 * Taille approximative du document, en octets.
 *
 * Firestore plafonne un document à 1 Mio. À 600 élèves et ~500 parents on
 * attend ~100 Ko, mais le seuil doit être surveillé plutôt que supposé : passé
 * la limite, l'écriture échouerait et le sélecteur retomberait silencieusement
 * sur son chemin de repli, c'est-à-dire sur la lenteur qu'on vient de retirer.
 */
function approximateSize(payload) {
  return Buffer.byteLength(JSON.stringify(payload), 'utf8')
}

/** Seuil d'alerte : 70 % du plafond Firestore, pour réagir avant l'échec. */
const SIZE_WARNING_BYTES = Math.floor(1024 * 1024 * 0.7)

module.exports = {
  buildParentsDirectory,
  approximateSize,
  SIZE_WARNING_BYTES,
  isActiveEleve,
  childLabel,
}
