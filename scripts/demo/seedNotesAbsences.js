/**
 * Génère notes (S1/S2) + absences pour les élèves déjà en base (voir
 * seedRealNamesDemo.js) — pour que la démo montre des bulletins et des
 * registres de présence remplis, pas juste des fiches élèves vides.
 *
 * Lit les élèves DEPUIS Firestore (ne re-tire pas au hasard leur classe :
 * la répartition déjà écrite par seedRealNamesDemo.js reste la vérité).
 *
 * Usage :
 *   node scripts/demo/seedNotesAbsences.js            → dry-run
 *   node scripts/demo/seedNotesAbsences.js --commit   → écrit dans Firestore
 */
const path  = require('path')
const fs    = require('fs')
const admin = require('firebase-admin')

const COMMIT = process.argv.includes('--commit')

function periodForISO(iso) {
  const [year, month] = iso.split('-').map(Number)
  const schoolYearStart = month >= 9 ? year : year - 1
  return {
    academicYear: `${schoolYearStart}-${schoolYearStart + 1}`,
    semestre: month >= 9 || month <= 1 ? 'S1' : 'S2',
    monthKey: `${year}-${String(month).padStart(2, '0')}`,
  }
}

const CURRENT_PERIOD = periodForISO(new Date().toISOString().slice(0, 10))

const SUBJECTS = {
  primaire: [
    { key: 'arabe', label: 'Arabe' }, { key: 'francais', label: 'Français' }, { key: 'maths', label: 'Maths' },
    { key: 'eveil', label: 'Éveil scientifique' }, { key: 'islamique', label: 'Éducation Islamique' },
    { key: 'histgeo', label: 'Histoire-Géo' }, { key: 'anglais', label: 'Anglais' },
  ],
  college: [
    { key: 'maths', label: 'Mathématiques' }, { key: 'francais', label: 'Français' }, { key: 'arabe', label: 'Arabe' },
    { key: 'anglais', label: 'Anglais' }, { key: 'pc', label: 'Physique-Chimie' }, { key: 'svt', label: 'SVT' },
    { key: 'histgeo', label: 'Histoire-Géo' }, { key: 'islamique', label: 'Éducation Islamique' },
  ],
}
const BAREME = { prescolaire: null, primaire: 10, college: 20 }

function cycleOf(classe) {
  if (/^(PS|GS)/.test(classe)) return 'prescolaire'
  if (/AEP/.test(classe)) return 'primaire'
  return 'college'
}

// PRNG déterministe (seedable) — mêmes notes à chaque relance dry-run,
// évite de générer des données différentes entre dry-run et --commit.
function rng(seed) {
  let h = 1779033703 ^ seed.length
  for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19) }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    h ^= h >>> 16
    return (h >>> 0) / 4294967296
  }
}
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const round2 = v => Math.round(v * 100) / 100

function recentSchoolDates(n) {
  const out = []
  let d = new Date()
  while (out.length < n) {
    const dow = d.getDay()
    if (dow !== 0 && dow !== 6) out.push(d.toISOString().slice(0, 10))
    d = new Date(d.getTime() - 86400000)
  }
  return out
}

function buildNotes(students) {
  const notes = []
  // Base par classe exprimée en proportion (0..1) du barème — certaines
  // classes un peu plus fortes/faibles que d'autres, indépendant du barème.
  const classBase = new Map()
  for (const st of students) if (!classBase.has(st.classe)) classBase.set(st.classe, 0.5 + rng('cbase:' + st.classe)() * 0.25)

  for (const st of students) {
    if (st.cycle === 'prescolaire') continue
    const subjects = SUBJECTS[st.cycle]
    const bareme = BAREME[st.cycle]
    const studentOffset = (rng('snote:' + st.codeMassar)() - 0.5) * 0.35
    for (const sem of ['S1', 'S2']) {
      for (const subj of subjects) {
        const subjOffset = (rng(`so:${st.codeMassar}:${subj.key}:${sem}`)() - 0.5) * 0.2
        const proportion = clamp(classBase.get(st.classe) + studentOffset + subjOffset, 0.15, 0.98)
        const note = round2(proportion * bareme)
        notes.push({
          id: `${st.codeMassar}_${CURRENT_PERIOD.academicYear}_${sem}_${subj.key}`,
          eleveId: st.codeMassar, eleveNom: st.nom, elevePrenom: st.prenom, codeMassar: st.codeMassar,
          classe: st.classe, cycle: st.cycle, academicYear: CURRENT_PERIOD.academicYear, semestre: sem,
          matiere: subj.key, matiereLabel: subj.label, note, bareme,
        })
      }
    }
  }
  return notes
}

function buildAbsences(students) {
  const rows = []
  const seance = '08:30 - 09:30'
  const dates = recentSchoolDates(10)
  const pool = students.filter(s => s.cycle !== 'prescolaire')
  for (const st of pool) {
    const r = rng('att:' + st.codeMassar)
    for (const date of dates) {
      const v = r()
      if (v < 0.85) continue // présent → pas de doc (registre par exception)
      const statut = v < 0.95 ? 'absent' : 'retard'
      rows.push({ st, date, seance, statut })
    }
  }
  return rows
}

async function fetchStudents(db) {
  const snap = await db.collection('eleves').get()
  return snap.docs.map(d => {
    const data = d.data()
    return { codeMassar: d.id, nom: data.nom, prenom: data.prenom, classe: data.classe, cycle: cycleOf(data.classe) }
  })
}

async function commitDocs(db, docs) {
  let batch = db.batch(), ops = 0
  for (const { ref, data } of docs) {
    batch.set(ref, data)
    if (++ops === 450) { await batch.commit(); batch = db.batch(); ops = 0 }
  }
  if (ops > 0) await batch.commit()
}

async function main() {
  const keyPath = path.join(__dirname, '..', '..', '.secrets', 'firebase-admin.json')
  if (!fs.existsSync(keyPath)) { console.error('❌ Clé Firebase Admin introuvable'); process.exit(1) }
  admin.initializeApp({ credential: admin.credential.cert(require(keyPath)) })
  const db = admin.firestore()
  const TS = admin.firestore.FieldValue.serverTimestamp

  const students = await fetchStudents(db)
  if (students.length === 0) { console.error('❌ Aucun élève en base — lance seedRealNamesDemo.js --commit d\'abord.'); process.exit(1) }
  console.log(`📄 ${students.length} élève(s) trouvé(s) en base.`)

  const notes = buildNotes(students)
  const absRows = buildAbsences(students)
  console.log(`   → ${notes.length} note(s) à générer (S1+S2)`)
  console.log(`   → ${absRows.length} absence/retard à générer (10 derniers jours ouvrés)`)

  if (!COMMIT) {
    console.log('\n💡 Dry-run. Relance avec --commit pour écrire dans Firestore.')
    console.log('\nAperçu notes (5) :')
    notes.slice(0, 5).forEach(n => console.log(`   • ${n.codeMassar}  ${n.matiereLabel} ${n.semestre}  ${n.note}/${n.bareme}  (${n.classe})`))
    console.log('\nAperçu absences (5) :')
    absRows.slice(0, 5).forEach(a => console.log(`   • ${a.st.codeMassar}  ${a.date}  ${a.statut}  (${a.st.classe})`))
    process.exit(0)
  }

  const noteDocs = notes.map(n => ({ ref: db.collection('notes').doc(n.id), data: {
    eleveId: n.eleveId, eleveNom: n.eleveNom, elevePrenom: n.elevePrenom, codeMassar: n.codeMassar,
    classe: n.classe, cycle: n.cycle, academicYear: n.academicYear, semestre: n.semestre, matiere: n.matiere, matiereLabel: n.matiereLabel,
    note: n.note, bareme: n.bareme, demo: true, importedBy: 'demo-seed', importedAt: TS(),
  } }))
  await commitDocs(db, noteDocs)
  console.log(`✅ notes           ${noteDocs.length}`)

  const absDocs = absRows.map(a => {
    const [s1, s2] = a.seance.split(' - ')
    const id = `${a.st.codeMassar}_${a.date}_${s1.replace(':', '')}_${s2.replace(':', '')}`
    return { ref: db.collection('absences').doc(id), data: {
      eleveId: a.st.codeMassar, eleveNom: a.st.nom, elevePrenom: a.st.prenom, classe: a.st.classe,
      date: a.date, seance: a.seance, statut: a.statut, ...periodForISO(a.date), demo: true, createdAt: TS(),
    } }
  })
  await commitDocs(db, absDocs)
  console.log(`✅ absences        ${absDocs.length}`)

  process.exit(0)
}

main().catch(e => { console.error('❌', e); process.exit(1) })
