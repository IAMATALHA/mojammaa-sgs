/**
 * Ajoute 71 élèves réels supplémentaires (exports Massar d'un autre
 * établissement — utilisés ici uniquement pour la richesse des noms dans la
 * démo Mojammaa Al Maarifa) répartis sur les classes déjà existantes
 * (PAS de nouvelles classes "2APIC-11"/"2APIC-12" — ces fichiers n'ont pas
 * de rapport avec Mojammaa, seuls les noms/codes Massar sont réutilisés).
 *
 * Génère aussi, pour TOUS les élèves déjà en base (anciens + nouveaux) :
 *   - comportements (mérites + avertissements) — taxonomie réelle de l'app
 *   - notes + absences pour les nouveaux élèves uniquement (les anciens en
 *     ont déjà via seedNotesAbsences.js)
 *
 * Usage :
 *   node scripts/demo/addMoreRealStudents.js            → dry-run
 *   node scripts/demo/addMoreRealStudents.js --commit   → écrit dans Firestore
 */
const path = require('path')
const fs   = require('fs')
const XLSX = require('xlsx')
const admin = require('firebase-admin')

const COMMIT = process.argv.includes('--commit')
const DOWNLOADS = path.join(require('os').homedir(), 'Downloads')

const SOURCE_FILES = [
  path.join(DOWNLOADS, 'export_notesCC_2APIC-12_0019-2.xlsx'),
  path.join(DOWNLOADS, 'export_notesCC_2APIC-11_0019.xlsx'),
]

const ALL_CLASSES = [
  'PS-1', 'GS-1',
  '1AEP-1', '2AEP-1', '3AEP-1', '4AEP-1', '5AEP-1', '6AEP-1',
  '1APIC-1', '1APIC-2', '1APIC-3', '1APIC-4',
  '2APIC-1', '2APIC-2', '2APIC-3', '2APIC-4',
  '3APIC-1', '3APIC-2', '3APIC-3', '3APIC-4',
]

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

// Taxonomie réelle de l'app (src/utils/behaviorTaxonomy.ts) — reason = clé stable.
const MERITE_REASONS = ['participation', 'helpingOthers', 'outstandingWork', 'remarkableEffort', 'research']
const AVERT_REASONS = ['disrespect', 'fighting', 'homeworkNotDone', 'forgotMaterials', 'rulesNotFollowed']
const MERITE_COMMENTS = {
  participation: 'Participe activement et pose de bonnes questions en classe.',
  helpingOthers: "Aide spontanément ses camarades en difficulté.",
  outstandingWork: 'Travail rendu particulièrement soigné et complet.',
  remarkableEffort: 'Progrès net depuis le début du semestre, effort constant.',
  research: 'Fait des recherches personnelles au-delà du cours.',
}
const AVERT_COMMENTS = {
  disrespect: "Manque de respect envers un camarade pendant le cours.",
  fighting: 'Altercation avec un camarade pendant la récréation.',
  homeworkNotDone: 'Devoir non rendu à la date prévue, deuxième rappel.',
  forgotMaterials: 'Matériel scolaire oublié à plusieurs reprises.',
  rulesNotFollowed: 'Consignes de classe non respectées.',
}

const SUPERADMIN_UID = 'emD31Tpp70fNzfxbd2NEznHS94w2'
const SUPERADMIN_NOM = 'Atalha'
const SUPERADMIN_PRENOM = 'Youssef'

function ddmmyyyyToIso(v) {
  const m = String(v || '').match(/^(\d{2})-(\d{2})-(\d{4})$/)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : ''
}
function splitName(full) {
  const parts = String(full).trim().split(/\s+/)
  return { nom: parts[0] || '', prenom: parts.slice(1).join(' ') || parts[0] || '' }
}
function extractStudents() {
  const seen = new Set()
  const students = []
  for (const file of SOURCE_FILES) {
    if (!fs.existsSync(file)) { console.error(`❌ Introuvable : ${file}`); process.exit(1) }
    const wb = XLSX.readFile(file)
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 })
    for (const row of rows.slice(17)) {
      const codeMassar = row[2], nomComplet = row[3], birth = row[5]
      if (!codeMassar || !nomComplet || typeof nomComplet !== 'string') continue
      if (seen.has(codeMassar)) continue
      seen.add(codeMassar)
      const { nom, prenom } = splitName(nomComplet)
      students.push({ codeMassar, nom, prenom, nomComplet, dateNaissance: ddmmyyyyToIso(birth) })
    }
  }
  return students
}
function shuffle(arr, rnd = Math.random) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1));[a[i], a[j]] = [a[j], a[i]] }
  return a
}
function niveauOf(classe) { return classe.split('-')[0] }
function cycleOf(classe) {
  if (/^(PS|GS)/.test(classe)) return 'prescolaire'
  if (/AEP/.test(classe)) return 'primaire'
  return 'college'
}

// PRNG déterministe (mêmes résultats dry-run / --commit)
function rng(seed) {
  let h = 1779033703 ^ seed.length
  for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19) }
  return function () { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296 }
}
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const round2 = v => Math.round(v * 100) / 100

function recentSchoolDates(n) {
  const out = []
  let d = new Date()
  while (out.length < n) { const dow = d.getDay(); if (dow !== 0 && dow !== 6) out.push(d.toISOString().slice(0, 10)); d = new Date(d.getTime() - 86400000) }
  return out
}

function buildNotesFor(students) {
  const notes = []
  const classBase = new Map()
  for (const st of students) if (!classBase.has(st.classe)) classBase.set(st.classe, 0.5 + rng('cbase2:' + st.classe)() * 0.25)
  for (const st of students) {
    if (st.cycle === 'prescolaire') continue
    const subjects = SUBJECTS[st.cycle]
    const bareme = BAREME[st.cycle]
    const studentOffset = (rng('snote2:' + st.codeMassar)() - 0.5) * 0.35
    for (const sem of ['S1', 'S2']) {
      for (const subj of subjects) {
        const subjOffset = (rng(`so2:${st.codeMassar}:${subj.key}:${sem}`)() - 0.5) * 0.2
        const proportion = clamp(classBase.get(st.classe) + studentOffset + subjOffset, 0.15, 0.98)
        const note = round2(proportion * bareme)
        notes.push({
          id: `${st.codeMassar}_${sem}_${subj.key}`,
          eleveId: st.codeMassar, eleveNom: st.nom, elevePrenom: st.prenom, codeMassar: st.codeMassar,
          classe: st.classe, cycle: st.cycle, semestre: sem, matiere: subj.key, matiereLabel: subj.label, note, bareme,
        })
      }
    }
  }
  return notes
}
function buildAbsencesFor(students) {
  const rows = []
  const seance = '08:30 - 09:30'
  const dates = recentSchoolDates(10)
  for (const st of students.filter(s => s.cycle !== 'prescolaire')) {
    const r = rng('att2:' + st.codeMassar)
    for (const date of dates) {
      const v = r()
      if (v < 0.85) continue
      rows.push({ st, date, seance, statut: v < 0.95 ? 'absent' : 'retard' })
    }
  }
  return rows
}
function buildComportementsFor(students) {
  const rows = []
  const dates = recentSchoolDates(14)
  const pool = students.filter(s => s.cycle !== 'prescolaire')
  for (const st of pool) {
    const r = rng('comp2:' + st.codeMassar)
    const n = r() < 0.55 ? 1 : (r() < 0.85 ? 0 : 2) // la plupart ont 0 ou 1 entrée, quelques-uns 2
    for (let i = 0; i < n; i++) {
      const isMerite = r() < 0.62 // légèrement positif — cohérent avec un contexte de démo école
      const reasons = isMerite ? MERITE_REASONS : AVERT_REASONS
      const reason = reasons[Math.floor(r() * reasons.length)]
      const comment = (isMerite ? MERITE_COMMENTS : AVERT_COMMENTS)[reason]
      const date = dates[Math.floor(r() * dates.length)]
      rows.push({ st, kind: isMerite ? 'merite' : 'avertissement', reason, comment, date })
    }
  }
  return rows
}

async function main() {
  const newStudents = extractStudents()
  console.log(`📄 ${newStudents.length} nouvel(le)s élève(s) réel(le)s extrait(e)s de ${SOURCE_FILES.length} fichier(s).`)

  const keyPath = path.join(__dirname, '..', '..', '.secrets', 'firebase-admin.json')
  if (!fs.existsSync(keyPath)) { console.error('❌ Clé Firebase Admin introuvable'); process.exit(1) }
  admin.initializeApp({ credential: admin.credential.cert(require(keyPath)) })
  const db = admin.firestore()
  const TS = admin.firestore.FieldValue.serverTimestamp

  const existingSnap = await db.collection('eleves').get()
  const existingStudents = existingSnap.docs.map(d => {
    const data = d.data()
    return { codeMassar: d.id, nom: data.nom, prenom: data.prenom, classe: data.classe, cycle: cycleOf(data.classe) }
  })
  console.log(`📚 ${existingStudents.length} élève(s) déjà en base.`)

  // Répartition équilibrée : on complète les classes en tenant compte du total déjà là.
  const countByClass = new Map(ALL_CLASSES.map(c => [c, 0]))
  existingStudents.forEach(s => { if (countByClass.has(s.classe)) countByClass.set(s.classe, countByClass.get(s.classe) + 1) })
  const sortedClasses = [...ALL_CLASSES].sort((a, b) => countByClass.get(a) - countByClass.get(b))
  const shuffled = shuffle(newStudents, rng('placement2'))
  const placed = shuffled.map((s, i) => {
    // Répartit vers les classes les moins peuplées d'abord (round-robin pondéré).
    const classe = sortedClasses[i % sortedClasses.length]
    countByClass.set(classe, countByClass.get(classe) + 1)
    return { ...s, classe, cycle: cycleOf(classe) }
  })

  const perClassNew = new Map()
  placed.forEach(s => perClassNew.set(s.classe, (perClassNew.get(s.classe) || 0) + 1))
  console.log(`\n📚 Répartition des nouveaux élèves :`)
  for (const c of ALL_CLASSES) if (perClassNew.get(c)) console.log(`   ${c.padEnd(10)} +${perClassNew.get(c)} (total ${countByClass.get(c)})`)

  const notes = buildNotesFor(placed)
  const absRows = buildAbsencesFor(placed)
  const allStudentsForComportements = [...existingStudents, ...placed]
  const compRows = buildComportementsFor(allStudentsForComportements)
  const meriteCount = compRows.filter(c => c.kind === 'merite').length

  console.log(`\n   → ${notes.length} note(s) (nouveaux élèves)`)
  console.log(`   → ${absRows.length} absence/retard (nouveaux élèves)`)
  console.log(`   → ${compRows.length} comportement(s) sur ${allStudentsForComportements.length} élèves (${meriteCount} mérites, ${compRows.length - meriteCount} avertissements)`)

  if (!COMMIT) {
    console.log('\n💡 Dry-run. Relance avec --commit pour écrire dans Firestore.')
    console.log('\nAperçu élèves (5) :')
    placed.slice(0, 5).forEach(s => console.log(`   • ${s.codeMassar}  ${s.nomComplet}  → ${s.classe}`))
    console.log('\nAperçu comportements (5) :')
    compRows.slice(0, 5).forEach(c => console.log(`   • ${c.st.codeMassar}  [${c.kind}] ${c.reason}  (${c.date})`))
    process.exit(0)
  }

  let batch = db.batch(), ops = 0
  const flush = async () => { if (ops > 0) { await batch.commit(); batch = db.batch(); ops = 0 } }
  const add = (ref, data) => { batch.set(ref, data); if (++ops === 450) return flush(); return Promise.resolve() }

  for (const s of placed) {
    await add(db.collection('eleves').doc(s.codeMassar), {
      codeMassar: s.codeMassar, nom: s.nom, prenom: s.prenom, nomComplet: s.nomComplet,
      classe: s.classe, classes: [s.classe], niveau: niveauOf(s.classe),
      dateNaissance: s.dateNaissance, updatedAt: TS(),
    })
  }
  await flush()
  console.log(`✅ eleves          +${placed.length}`)

  for (const n of notes) {
    await add(db.collection('notes').doc(n.id), {
      eleveId: n.eleveId, eleveNom: n.eleveNom, elevePrenom: n.elevePrenom, codeMassar: n.codeMassar,
      classe: n.classe, cycle: n.cycle, semestre: n.semestre, matiere: n.matiere, matiereLabel: n.matiereLabel,
      note: n.note, bareme: n.bareme, demo: true, importedBy: 'demo-seed', importedAt: TS(),
    })
  }
  await flush()
  console.log(`✅ notes           +${notes.length}`)

  for (const a of absRows) {
    const [s1, s2] = a.seance.split(' - ')
    const id = `${a.st.codeMassar}_${a.date}_${s1.replace(':', '')}_${s2.replace(':', '')}`
    await add(db.collection('absences').doc(id), {
      eleveId: a.st.codeMassar, eleveNom: a.st.nom, elevePrenom: a.st.prenom, classe: a.st.classe,
      date: a.date, seance: a.seance, statut: a.statut, demo: true, createdAt: TS(),
    })
  }
  await flush()
  console.log(`✅ absences        +${absRows.length}`)

  for (const c of compRows) {
    await add(db.collection('comportements').doc(), {
      eleveId: c.st.codeMassar, eleveNom: c.st.nom, elevePrenom: c.st.prenom, classe: c.st.classe,
      date: c.date, kind: c.kind, reason: c.reason, comment: c.comment,
      teacherId: SUPERADMIN_UID, teacherNom: `${SUPERADMIN_PRENOM} ${SUPERADMIN_NOM}`,
      demo: true, createdAt: TS(),
    })
  }
  await flush()
  console.log(`✅ comportements   +${compRows.length}`)

  process.exit(0)
}

main().catch(e => { console.error('❌', e); process.exit(1) })
