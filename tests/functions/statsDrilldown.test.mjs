/**
 * Sécurité des drill-downs statistiques — les seuls endpoints nominatifs.
 *
 * Trois familles d'assertions :
 *   1. autorisation : admin passe, professeur / parent / anonyme sont refusés
 *   2. confidentialité : la projection réseau ne peut pas laisser fuiter un
 *      champ non listé, quel que soit le contenu du document source
 *   3. bornage : la pagination ne peut pas être détournée pour tout aspirer
 *
 *   node tests/functions/statsDrilldown.test.mjs
 */
import assert from 'node:assert/strict'
import drill from '../../functions/statsDrilldown.js'

const {
  requireAdmin, boundedLimit, projectStudent, bandOf, sortStudents, paginate,
  encodeCursor, decodeCursor, progressionMatchesScope,
  STUDENT_SEGMENTS, MAX_LIMIT, DEFAULT_LIMIT,
} = drill

/** Faux Firestore : seule `users/{uid}.role` compte pour le gate. */
function fakeDb(rolesByUid) {
  return {
    collection() {
      return {
        doc(uid) {
          return {
            async get() {
              const role = rolesByUid[uid]
              return {
                exists: role !== undefined,
                get(field) { return field === 'role' ? role : undefined },
              }
            },
          }
        },
      }
    },
  }
}

const db = fakeDb({
  adminUid: 'admin',
  teacherUid: 'professeur',
  parentUid: 'parent',
  ghostUid: undefined,
})

async function expectRejection(promise, expectedCode, message) {
  try {
    await promise
    assert.fail(`${message} — l'appel aurait dû être refusé`)
  } catch (err) {
    assert.equal(err.code, expectedCode, `${message} — code attendu ${expectedCode}, reçu ${err.code}`)
  }
}

// ── 1. Autorisation ────────────────────────────────────────────────────────
{
  const uid = await requireAdmin(db, { auth: { uid: 'adminUid' } })
  assert.equal(uid, 'adminUid', 'un admin passe le gate')

  await expectRejection(
    requireAdmin(db, { auth: { uid: 'teacherUid' } }),
    'permission-denied',
    'professeur',
  )
  await expectRejection(
    requireAdmin(db, { auth: { uid: 'parentUid' } }),
    'permission-denied',
    'parent',
  )
  await expectRejection(
    requireAdmin(db, {}),
    'unauthenticated',
    'session anonyme',
  )
  await expectRejection(
    requireAdmin(db, { auth: { uid: 'ghostUid' } }),
    'permission-denied',
    'uid sans document users',
  )
}

// ── 2. Confidentialité de la projection ────────────────────────────────────
{
  // Document volontairement pollué : tout ce qui n'est pas en liste blanche
  // doit disparaître, y compris des champs qu'on n'a pas anticipés.
  const doc = {
    id: 'A171010188',
    data: () => ({
      codeMassar: 'A171010188',
      nom: 'Nom', prenom: 'Prenom',
      nomLatin: 'NomLatin', prenomLatin: 'PrenomLatin',
      nomComplet: 'CHAINE MASSAR BRUTE',
      classe: '1APIC-3', niveau: '1APIC',
      dateNaissance: '2010-05-04',
      parentUid: 'uid-du-parent',
      telephone: '+212600000000',
      email: 'parent@example.com',
      secretInterne: 'ne doit jamais sortir',
    }),
  }

  const projected = projectStudent(doc, 12.5)
  assert.deepEqual(
    Object.keys(projected).sort(),
    // `bareme` est déduit du cycle/classe, pas lu sur la fiche : il dit dans
    // quelle échelle afficher `average`, il n'ajoute aucune donnée nominative.
    ['average', 'bareme', 'classe', 'id', 'niveau', 'nom', 'prenom'].sort(),
    'la projection est une liste blanche stricte',
  )
  assert.equal(projected.bareme, 20, '1APIC est du collège → /20')
  assert.equal(
    projectStudent({ id: 'x', data: () => ({ cycle: 'primaire', classe: 'CE2-A' }) }, 7).bareme,
    10,
    'primaire → /10 même sans motif AEP dans le nom de classe',
  )

  const serialized = JSON.stringify(projected)
  for (const leak of [
    'dateNaissance', '2010-05-04',
    'parentUid', 'uid-du-parent',
    '+212600000000', 'parent@example.com',
    'CHAINE MASSAR BRUTE', 'secretInterne',
  ]) {
    assert.ok(!serialized.includes(leak), `aucune fuite de « ${leak} »`)
  }

  // Les translittérations latines sont préférées quand elles existent.
  assert.equal(projected.nom, 'NomLatin')
  assert.equal(projected.prenom, 'PrenomLatin')

  // L'id EST le code Massar : il circule (identifiant technique) mais c'est le
  // SEUL champ qui le porte, et l'UI ne doit jamais l'afficher.
  assert.equal(projected.id, 'A171010188')
}

// ── 3. Bornage et pagination ───────────────────────────────────────────────
{
  assert.equal(boundedLimit(undefined), DEFAULT_LIMIT, 'limite par défaut')
  assert.equal(boundedLimit(10), 10)
  assert.equal(boundedLimit(100000), MAX_LIMIT, 'un client ne peut pas tout aspirer')
  assert.equal(boundedLimit(-5), DEFAULT_LIMIT, 'valeur absurde → défaut')
  assert.equal(boundedLimit('abc'), DEFAULT_LIMIT, 'valeur non numérique → défaut')

  assert.equal(decodeCursor(encodeCursor(42)), 42, 'curseur aller-retour')
  assert.equal(decodeCursor('curseur-bidon'), 0, 'curseur invalide → début, jamais un crash')
  assert.equal(decodeCursor(undefined), 0)

  const rows = Array.from({ length: 7 }, (_, i) => ({ n: i }))
  const first = paginate(rows, null, 3)
  assert.equal(first.page.length, 3)
  assert.ok(first.nextCursor, 'curseur suivant fourni tant qu’il reste des lignes')
  const second = paginate(rows, first.nextCursor, 3)
  assert.deepEqual(second.page.map(r => r.n), [3, 4, 5], 'pas de saut ni de doublon')
  const third = paginate(rows, second.nextCursor, 3)
  assert.deepEqual(third.page.map(r => r.n), [6])
  assert.equal(third.nextCursor, null, 'fin de liste')
}

// ── 4. Partitionnement des bandes (cohérent avec successRate) ──────────────
{
  assert.equal(bandOf(null), null, 'un élève non noté n’appartient à aucune bande')
  assert.equal(bandOf(7.9), '<8')
  assert.equal(bandOf(8), '8-10')
  assert.equal(bandOf(9.9), '8-10')
  // La frontière 10 est celle de successRate : au-dessus = réussite.
  assert.equal(bandOf(10), '10-14')
  assert.equal(bandOf(13.9), '10-14')
  assert.equal(bandOf(14), '14+')
  assert.equal(bandOf(20), '14+')
}

// ── 4b. Une transition ne peut pas sortir du périmètre appliqué ────────────
{
  const selection = { matiere: 'Mathématiques', semestre: 'S1' }
  assert.equal(
    progressionMatchesScope(selection, 'Maths', 'S1'),
    true,
    'un alias canonique de la même matière reste valide',
  )
  assert.equal(
    progressionMatchesScope(selection, 'Français', 'S1'),
    false,
    'une autre matière est refusée',
  )
  assert.equal(
    progressionMatchesScope(selection, 'Mathématiques', 'S2'),
    false,
    'un autre semestre est refusé',
  )
  assert.equal(
    progressionMatchesScope(selection, '', 'S1'),
    false,
    'une progression nominative exige un scope matière explicite',
  )
  assert.equal(
    progressionMatchesScope({ ...selection, semestre: 'S2' }, 'Mathématiques', null),
    true,
    'la vue annuelle autorise chaque semestre, sans les mélanger',
  )
}

// ── 5. Tri déterministe ────────────────────────────────────────────────────
{
  const make = (id, classe, nom, priority, score) => ({
    student: { id, classe, nom, prenom: 'P' }, priority, score,
  })
  const rows = [
    make('c', '1B', 'Zed', 'low', 1),
    make('a', '1A', 'Alpha', 'high', 6),
    make('b', '1A', 'Beta', 'medium', 3),
  ]
  const followUp = sortStudents([...rows], 'followup')
  assert.deepEqual(
    followUp.map(r => r.student.id), ['a', 'b', 'c'],
    'file de suivi triée par priorité puis score',
  )
  const all = sortStudents([...rows], 'all')
  assert.deepEqual(
    all.map(r => r.student.id), ['a', 'b', 'c'],
    'liste générale triée par classe puis nom',
  )
  // Deux appels sur la même entrée donnent le même ordre : sinon la pagination
  // par index sauterait ou dupliquerait des lignes entre deux pages.
  assert.deepEqual(
    sortStudents([...rows], 'all').map(r => r.student.id),
    all.map(r => r.student.id),
    'tri stable entre deux appels',
  )

  assert.ok(STUDENT_SEGMENTS.has('progression'), 'la cohorte progression est un segment reconnu')
  const progression = [
    { ...make('p1', '1A', 'A', undefined, 0), progression: { delta: 1, outcome: 'improved' } },
    { ...make('p3', '1A', 'C', undefined, 0), progression: { delta: 3, outcome: 'improved' } },
    { ...make('p2', '1A', 'B', undefined, 0), progression: { delta: 2, outcome: 'improved' } },
  ]
  assert.deepEqual(
    sortStudents(progression, 'progression').map(row => row.student.id),
    ['p3', 'p2', 'p1'],
    'les progrès les plus marqués apparaissent en premier',
  )
}


// ── 6. Devoirs : compteur et liste sortent du meme tableau ─────────────────
{
  // `getStatsHomework` pagine le tableau deja reduit par resolveScope. On
  // verifie ici la propriete qui rend l'invariant vrai : total = longueur du
  // tableau source, quelle que soit la page demandee.
  const devoirs = Array.from({ length: 23 }, (_, i) => ({
    id: `d${String(i).padStart(2, '0')}`,
    dateLimite: `2026-03-${String((i % 28) + 1).padStart(2, '0')}`,
  }))
  const sorted = [...devoirs].sort(
    (a, b) => a.dateLimite.localeCompare(b.dateLimite) || a.id.localeCompare(b.id),
  )

  let seen = []
  let cursor = null
  for (let guard = 0; guard < 10; guard++) {
    const { page, nextCursor } = paginate(sorted, cursor, 10)
    seen = seen.concat(page.map(r => r.id))
    if (!nextCursor) break
    cursor = nextCursor
  }
  assert.equal(seen.length, devoirs.length, 'la pagination couvre exactement le total')
  assert.equal(new Set(seen).size, devoirs.length, 'aucun doublon entre les pages')
  assert.deepEqual(seen, sorted.map(r => r.id), 'ordre preserve d\'une page a l\'autre')
}

console.log('statsDrilldown : gate admin, projection en liste blanche, bornage, partition, tri déterministe, pagination devoirs')
