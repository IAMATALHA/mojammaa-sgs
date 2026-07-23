/**
 * Génère des notes v2 STRUCTURÉES complètes pour le collège (données demo).
 *
 *   node scripts/seedCollegeEvaluations.js            # dry-run (aucune écriture)
 *   node scripts/seedCollegeEvaluations.js --commit   # écrit les notes v2
 *
 * Pour chaque élève de collège, chaque semestre (S1, S2) et chacune des 10
 * matières, produit une note à 100 % : tous les contrôles écrits attendus par
 * la matière/niveau + l'activité intégrée quand la formule l'exige. Les valeurs
 * sont aléatoires mais avec une tendance par (élève, matière) — hausse, stable
 * ou baisse — pour que le suivi de progression C1→C2→C3 ait quelque chose à
 * montrer plutôt que du bruit pur.
 *
 * DONNÉES DEMO uniquement. Écrit via Admin SDK (contourne les règles), mais
 * produit des documents v2 bien formés que l'app et le calcul serveur savent
 * relire. Le résumé (note finale, complétude) est précalculé pour que le
 * trigger onNoteWritten n'ait rien à réécrire.
 */
const path = require('path')
const fs = require('fs')

const ROOT = path.join(__dirname, '..')
const KEY_PATH = path.join(ROOT, '.secrets', 'firebase-admin.json')
const COMMIT = process.argv.includes('--commit')
const ACADEMIC_YEAR = '2025-2026'

const { calculateCollegeEvaluation } = require(path.join(ROOT, 'functions', 'collegeEvaluation'))
const POLICY = require(path.join(ROOT, 'functions', 'lib', 'collegeEvaluationPolicy.json'))

/** Clé courte du docId par matière (relevée en base ; choisie pour les 3 absentes). */
const SUBJECT_KEY = {
  'Arabe': 'arabe',
  'Français': 'francais',
  'Mathématiques': 'maths',
  'Histoire Géographie': 'histgeo',
  'Physique et Chimie': 'physique',
  'Sciences de la Vie et de la Terre': 'svt',
  'Anglais': 'anglais',
  'Éducation Islamique': 'islamique',
  'Éducation Physique et Sportive': 'eps',
  'Informatique': 'informatique',
}

const MONTH_KEY = { S1: `${ACADEMIC_YEAR.slice(0, 4)}-11`, S2: `${Number(ACADEMIC_YEAR.slice(0, 4)) + 1}-04` }

function clampNote(v) {
  return Math.max(4, Math.min(19, Math.round(v * 2) / 2))
}

/** Générateur déterministe par graine → mêmes notes si on relance (idempotent). */
function makeRng(seed) {
  let s = 0
  for (const ch of seed) s = (s * 31 + ch.charCodeAt(0)) >>> 0
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return s / 0x7fffffff
  }
}

/**
 * Aptitude propre à l'élève, stable d'une matière à l'autre — un élève faible
 * l'est globalement, ce qui rend le dossier 360° cohérent. Distribution
 * réaliste : ~65 % solides, ~25 % fragiles, ~10 % en difficulté.
 */
function studentAbility(eleveId) {
  const r = makeRng(`ability|${eleveId}`)()
  if (r < 0.1) return 6 + makeRng(`lo|${eleveId}`)() * 3 // 6-9  en difficulté
  if (r < 0.35) return 9 + makeRng(`mid|${eleveId}`)() * 3 // 9-12 fragiles
  return 12 + makeRng(`hi|${eleveId}`)() * 4 // 12-16 solides
}

/**
 * Contrôles autour de l'aptitude de l'élève, décalés par matière, avec une
 * tendance douce. Les élèves faibles penchent plus souvent vers la baisse pour
 * produire de vrais signaux de décrochage — le reste des séquences est stable.
 */
function controlValues(count, ability, rng) {
  const base = ability + (rng() - 0.5) * 3 // ±1,5 selon la matière
  const downwardBias = ability < 10 ? -1.2 : 0
  const trend = (rng() - 0.5) * 2 + downwardBias // faibles → tendance baissière
  return Array.from({ length: count }, (_, i) => {
    const step = count > 1 ? (i / (count - 1)) * trend : 0
    const noise = (rng() - 0.5) * 1.5
    return clampNote(base + step + noise)
  })
}

function subjectByCanonical(canonical) {
  for (const [key, entry] of Object.entries(POLICY.subjects)) {
    if (entry.canonical === canonical) return { key, ...entry }
  }
  return null
}

function buildEvaluations(subject, level, ability, rng) {
  const slots = subject.controlsByLevel[level] || []
  const values = controlValues(slots.length, ability, rng)
  const evaluations = slots.map((slot, i) => ({
    slot: slot.slot,
    category: 'control',
    kind: slot.kind,
    ordinal: i + 1,
    label: slot.label,
    note: values[i],
    bareme: 20,
  }))
  const aiWeight = Number(subject.integratedWeightByLevel?.[level] || 0)
  if (aiWeight > 0) {
    evaluations.push({
      slot: 'integrated_activities',
      category: 'integrated',
      kind: 'integrated_activity',
      ordinal: 1,
      label: 'Activités intégrées',
      note: clampNote(9 + rng() * 8),
      bareme: 20,
    })
  }
  return evaluations
}

async function main() {
  if (!fs.existsSync(KEY_PATH)) {
    console.error(`Clé Firebase Admin introuvable : ${KEY_PATH}`)
    process.exit(1)
  }
  const admin = require('firebase-admin')
  admin.initializeApp({ credential: admin.credential.cert(require(KEY_PATH)) })
  const db = admin.firestore()

  console.log(COMMIT ? '=== MODE ÉCRITURE (--commit) ===' : '=== DRY-RUN — aucune écriture ===')

  const elevesSnap = await db.collection('eleves').get()
  const college = elevesSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((e) => e.active !== false && e.cycle === 'college')

  const canonicals = Object.keys(SUBJECT_KEY)
  const semestres = ['S1', 'S2']
  const docs = []
  const sampleShown = []

  college.forEach((eleve) => {
    const level = ['1AC', '2AC', '3AC'].find((n) => String(eleve.niveau).toUpperCase().includes(n)) || '1AC'
    const ability = studentAbility(eleve.id)
    canonicals.forEach((canonical) => {
      const subject = subjectByCanonical(canonical)
      if (!subject) return
      semestres.forEach((sem) => {
        const rng = makeRng(`${eleve.id}|${canonical}|${sem}`)
        const evaluations = buildEvaluations(subject, level, ability, rng)
        const data = {
          schemaVersion: 2,
          cycle: 'college',
          niveau: eleve.niveau,
          classe: eleve.classe,
          matiere: canonical,
          bareme: 20,
          evaluations,
        }
        const evaluated = calculateCollegeEvaluation(data)
        const docId = `${eleve.id}_${ACADEMIC_YEAR}_${sem}_${SUBJECT_KEY[canonical]}`
        const doc = {
          eleveId: eleve.id,
          eleveNom: eleve.nom || '',
          elevePrenom: eleve.prenom || '',
          codeMassar: eleve.codeMassar || eleve.id,
          classe: eleve.classe,
          cycle: 'college',
          niveau: eleve.niveau,
          academicYear: ACADEMIC_YEAR,
          semestre: sem,
          monthKey: MONTH_KEY[sem],
          matiere: canonical,
          matiereLabel: canonical,
          subjectKey: SUBJECT_KEY[canonical],
          schemaVersion: 2,
          bareme: 20,
          evaluations,
          gradeSource: 'structured',
          evaluationPolicyVersion: evaluated.policyVersion,
          note: evaluated.note,
          controlesCount: evaluated.controlsEntered,
          controlesExpected: evaluated.controlsExpected,
          calculation: {
            status: evaluated.note == null ? 'empty' : evaluated.complete ? 'complete' : 'provisional',
            completed: evaluated.componentsEntered,
            expected: evaluated.componentsExpected,
            completionRate: evaluated.completionRate,
          },
          demo: true,
          importedBy: 'seed:collegeEvaluations',
        }
        docs.push({ docId, doc, evaluated })
        if (sampleShown.length < 3 && sem === 'S1' && ['Mathématiques', 'Anglais', 'Français'].includes(canonical)) {
          sampleShown.push({ docId, canonical, evaluations, note: evaluated.note, rate: evaluated.completionRate, complete: evaluated.complete })
        }
      })
    })
  })

  console.log(`\nÉlèves collège : ${college.length}`)
  console.log(`Documents v2 à écrire : ${docs.length}  (${canonicals.length} matières × ${semestres.length} semestres × ${college.length} élèves)`)
  const incomplete = docs.filter((d) => !d.evaluated.complete)
  console.log(`Complétude : ${docs.length - incomplete.length} à 100 %, ${incomplete.length} en dessous`)

  console.log('\nExemples (S1) :')
  sampleShown.forEach((s) => {
    console.log(`  ${s.canonical} → note ${s.note}/20, ${s.rate}%, complet=${s.complete}`)
    s.evaluations.forEach((e) => console.log(`     ${e.category === 'integrated' ? '[AI]' : '[C' + e.ordinal + ']'} ${e.label.padEnd(24)} ${e.note}/20`))
  })

  if (!COMMIT) {
    console.log('\nDry-run terminé. Relancer avec --commit pour écrire.')
    await admin.app().delete()
    return
  }

  let written = 0
  for (let i = 0; i < docs.length; i += 400) {
    const batch = db.batch()
    docs.slice(i, i + 400).forEach(({ docId, doc }) => batch.set(db.collection('notes').doc(docId), doc))
    await batch.commit()
    written += Math.min(400, docs.length - i)
    console.log(`  écrit ${written}/${docs.length}`)
  }
  console.log('\nNotes v2 écrites. Recalcul des agrégats via recomputeSchoolStats recommandé.')
  await admin.app().delete()
}

main().catch((err) => {
  console.error('Échec :', err && err.message ? err.message : err)
  process.exit(1)
})
