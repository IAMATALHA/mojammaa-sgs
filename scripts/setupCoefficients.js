/**
 * Configuration des coefficients réglementaires — collège uniquement.
 *
 *   node scripts/setupCoefficients.js            # simulation (aucune écriture)
 *   node scripts/setupCoefficients.js --commit   # écrit settings/coefficients
 *
 * ── Pourquoi par niveau et jamais globalement ──────────────────────────────
 *
 * `makeCoefOf` (functions/schoolStats.js) résout dans cet ordre :
 *     parNiveau[niveau][matiere]  >  matieres[matiere]  >  1
 *
 * On laisse donc `matieres` VIDE. Un coefficient global s'appliquerait aussi
 * au primaire et au préscolaire, dont le régime d'évaluation n'est pas encore
 * établi : leur moyenne deviendrait pondérée par des règles de collège. Tant
 * que ces cycles ne sont pas configurés, ils doivent conserver le repli à 1,
 * c'est-à-dire la moyenne arithmétique qu'ils ont aujourd'hui.
 *
 * ── Contrôle continu et examen régional sont deux mondes ───────────────────
 *
 * En 3AC, le contrôle continu applique un coefficient 1 à TOUTES les matières.
 * Les coefficients différenciés (arabe 3, français 3, maths 3) ne valent que
 * pour l'examen régional, qui est un calcul distinct. Les injecter ici
 * fausserait toutes les moyennes ordinaires de 3AC, c'est pourquoi ils vivent
 * dans un document séparé que `makeCoefOf` ne lit jamais.
 *
 * ── Les clés sont celles de la base, pas les noms d'usage ──────────────────
 *
 * `coefOf` indexe sur le champ `matiere` brut. Or « Maths », « SVT », « EPS »
 * ou « Physique-Chimie » n'existent pas : la base écrit « Mathématiques »,
 * « Sciences de la Vie et de la Terre », « Éducation Physique et Sportive »,
 * « Physique et Chimie ». Un libellé approximatif ne produirait aucune erreur —
 * juste un repli silencieux à 1, c'est-à-dire l'absence de pondération là où on
 * croit en avoir mis une. Le script vérifie donc chaque clé contre la base.
 *
 * Sources : notes ministérielles 180 (arabe), 181 (français), 182 (anglais),
 * 183 (éducation islamique), 184 (informatique), 185 (histoire-géographie),
 * 189 (EPS), 190 (SVT), 192 (mathématiques), 193 (physique-chimie).
 */
const path = require('path')
const fs = require('fs')

const ROOT = path.join(__dirname, '..')
const KEY_PATH = path.join(ROOT, '.secrets', 'firebase-admin.json')
const COMMIT = process.argv.includes('--commit')

const {
  ACADEMIC_YEAR, POLICY_VERSION, COLLEGE_1AC_2AC, COEFFICIENTS_DOC, EXAMEN_REGIONAL_DOC,
} = require('./lib/collegeCoefficients')

function round1(v) {
  return Math.round(v * 10) / 10
}

async function main() {
  if (!fs.existsSync(KEY_PATH)) {
    console.error(`Clé Firebase Admin introuvable : ${KEY_PATH}`)
    process.exit(1)
  }
  const admin = require('firebase-admin')
  admin.initializeApp({ credential: admin.credential.cert(require(KEY_PATH)) })
  const db = admin.firestore()
  const { computeSchoolStats } = require(path.join(ROOT, 'functions', 'schoolStats'))

  console.log(COMMIT ? '=== MODE ÉCRITURE (--commit) ===' : '=== SIMULATION — aucune écriture ===')
  console.log(`année ${ACADEMIC_YEAR} · politique ${POLICY_VERSION}\n`)

  const [elevesSnap, usersSnap, notesSnap, absencesSnap, devoirsSnap] = await Promise.all([
    db.collection('eleves').get(),
    db.collection('users').get(),
    db.collection('notes').where('academicYear', '==', ACADEMIC_YEAR).get(),
    db.collection('absences').get(),
    db.collection('devoirs').get(),
  ])
  const rows = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }))
  const eleves = rows(elevesSnap).filter((r) => r.active !== false)
  const notes = rows(notesSnap)

  // ── 1. Vérification des clés ────────────────────────────────────────────
  const matieresEnBase = new Set(notes.map((r) => String(r.matiere || '')).filter(Boolean))
  const niveauxEnBase = new Set(eleves.map((r) => String(r.niveau || '')).filter(Boolean))

  console.log('CONTRÔLE DES CLÉS')
  let bloquant = 0
  Object.keys(COEFFICIENTS_DOC.parNiveau).forEach((niveau) => {
    const ok = niveauxEnBase.has(niveau)
    if (!ok) bloquant++
    console.log(`  niveau "${niveau}" ${ok ? 'présent en base' : '*** ABSENT DE LA BASE ***'}`)
  })
  Object.keys(COLLEGE_1AC_2AC).forEach((matiere) => {
    const present = matieresEnBase.has(matiere)
    console.log(`  matière "${matiere}"${' '.repeat(Math.max(0, 34 - matiere.length))}`
      + (present ? 'présente' : 'aucune note — clé à confirmer à la 1re saisie'))
  })

  // ── 2. Simulation avant / après ─────────────────────────────────────────
  const cache = {
    eleves,
    users: rows(usersSnap),
    notes,
    absences: rows(absencesSnap),
    devoirs: rows(devoirsSnap),
    homeworkSubmissions: [],
  }

  const cycles = [
    { key: 'college', label: 'Collège' },
    { key: 'primaire', label: 'Primaire' },
    { key: 'prescolaire', label: 'Préscolaire' },
  ]

  console.log('\nSIMULATION — impact par cycle (agrégats seuls, aucune donnée nominative)')
  console.log('  cycle        élèves   moyenne avant → après    réussite avant → après   à suivre')
  console.log('  ' + '-'.repeat(78))

  cycles.forEach(({ key, label }) => {
    const scope = eleves.filter((e) => String(e.cycle || '') === key)
    if (scope.length === 0) return
    const ids = new Set(scope.map((e) => e.id))
    const sub = {
      ...cache,
      eleves: scope,
      notes: notes.filter((n) => ids.has(String(n.eleveId || ''))),
    }
    const avant = computeSchoolStats({ ...sub, coefficients: null })
    const apres = computeSchoolStats({ ...sub, coefficients: COEFFICIENTS_DOC })
    const delta = avant.avgNote != null && apres.avgNote != null
      ? round1(apres.avgNote - avant.avgNote)
      : null
    const flag = delta != null && Math.abs(delta) >= 0.05 ? ` (${delta > 0 ? '+' : ''}${delta})` : ' (inchangé)'
    console.log(
      `  ${label.padEnd(12)} ${String(scope.length).padStart(4)}    `
      + `${String(avant.avgNote ?? '—').padStart(6)} → ${String(apres.avgNote ?? '—').padEnd(6)}${flag.padEnd(12)}`
      + `${String(avant.successRate ?? '—').padStart(4)}% → ${String(apres.successRate ?? '—').padEnd(4)}%      `
      + `${avant.studentsToFollow} → ${apres.studentsToFollow}`,
    )
  })

  // Répartition anonyme des écarts individuels : combien d'élèves bougent, et
  // de combien. Aucun identifiant, aucune note individuelle.
  const avantAll = computeSchoolStats({ ...cache, coefficients: null }, { includeStudentIndex: true })
  const apresAll = computeSchoolStats({ ...cache, coefficients: COEFFICIENTS_DOC }, { includeStudentIndex: true })
  const avantById = new Map((avantAll.studentAveragesById || []).map((r) => [r.eleveId, r.average]))
  const buckets = { '≥ 1,0': 0, '0,5 – 1,0': 0, '0,1 – 0,5': 0, '< 0,1': 0 }
  let franchissements = 0
  ;(apresAll.studentAveragesById || []).forEach((r) => {
    const before = avantById.get(r.eleveId)
    if (before == null) return
    const d = Math.abs(r.average - before)
    if (d >= 1) buckets['≥ 1,0']++
    else if (d >= 0.5) buckets['0,5 – 1,0']++
    else if (d >= 0.1) buckets['0,1 – 0,5']++
    else buckets['< 0,1']++
    if ((before < 10) !== (r.average < 10)) franchissements++
  })
  console.log('\n  écart de moyenne par élève (anonyme) :')
  Object.entries(buckets).forEach(([k, v]) => console.log(`     ${k.padEnd(12)} ${v} élèves`))
  console.log(`     élèves changeant de côté du seuil de 10 : ${franchissements}`)

  console.log('\n  école entière :')
  console.log(`     moyenne      ${avantAll.avgNote} → ${apresAll.avgNote}`)
  console.log(`     réussite     ${avantAll.successRate}% → ${apresAll.successRate}%`)
  console.log(`     à suivre     ${avantAll.studentsToFollow} → ${apresAll.studentsToFollow}`)

  // ── 3. Écriture ─────────────────────────────────────────────────────────
  if (bloquant > 0) {
    console.log(`\n${bloquant} niveau(x) absent(s) de la base — écriture refusée.`)
    process.exit(1)
  }
  if (!COMMIT) {
    console.log('\nSimulation terminée. Relancer avec --commit pour écrire.')
  } else {
    await db.collection('settings').doc('coefficients').set({
      ...COEFFICIENTS_DOC,
      updatedAt: new Date(),
    })
    await db.collection('settings').doc('examenRegional').set({
      ...EXAMEN_REGIONAL_DOC,
      updatedAt: new Date(),
    })
    console.log('\nsettings/coefficients écrit.')
    console.log('settings/examenRegional écrit (non lu par le calcul des moyennes).')
  }

  await admin.app().delete()
}

main().catch((err) => {
  console.error('Échec :', err && err.message ? err.message : err)
  process.exit(1)
})
