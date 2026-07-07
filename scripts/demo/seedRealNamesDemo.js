/**
 * Peuple `eleves` avec de VRAIS noms (extraits des exports Massar
 * export_notesCC_*.xlsx fournis par l'école), redistribués ALÉATOIREMENT
 * sur TOUS les niveaux de l'école (préscolaire, primaire, collège) — pour
 * que la démo montre des noms réels de l'établissement à l'administration.
 *
 * Seules 3 classes collège ont des exports réels (1APIC-3, 1APIC-4,
 * 2APIC-4) : la structure complète des autres niveaux est une estimation
 * plausible (structure marocaine standard), demandée explicitement en
 * remplacement d'une vraie liste de classes que l'école n'a pas fournie.
 *
 * Usage :
 *   node scripts/demo/seedRealNamesDemo.js            → dry-run
 *   node scripts/demo/seedRealNamesDemo.js --commit   → écrit dans Firestore
 */
const path = require('path')
const fs   = require('fs')
const XLSX = require('xlsx')
const admin = require('firebase-admin')

const COMMIT = process.argv.includes('--commit')
const DESKTOP = path.join(require('os').homedir(), 'Desktop')

const SOURCE_FILES = [
  { classe: '1APIC-4', file: path.join(DESKTOP, 'export_notesCC_1APIC-4_0019-2.xlsx') },
  { classe: '1APIC-3', file: path.join(DESKTOP, 'export_notesCC_1APIC-3_0019.xlsx') },
  { classe: '2APIC-4', file: path.join(DESKTOP, 'export_notesCC_2APIC-4_0019.xlsx') },
]

// Structure complète de l'école — les 3 classes ci-dessus sont réelles
// (confirmées par les exports), le reste est une structure plausible.
const ALL_CLASSES = [
  'PS-1', 'GS-1',
  '1AEP-1', '2AEP-1', '3AEP-1', '4AEP-1', '5AEP-1', '6AEP-1',
  '1APIC-1', '1APIC-2', '1APIC-3', '1APIC-4',
  '2APIC-1', '2APIC-2', '2APIC-3', '2APIC-4',
  '3APIC-1', '3APIC-2', '3APIC-3', '3APIC-4',
]

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
  for (const { file } of SOURCE_FILES) {
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

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function distribute(students, classes) {
  const shuffled = shuffle(students)
  return shuffled.map((s, i) => ({ ...s, classe: classes[i % classes.length] }))
}

function niveauOf(classe) { return classe.split('-')[0] }

async function main() {
  const students = extractStudents()
  console.log(`📄 ${students.length} élève(s) réel(s) extrait(s) de ${SOURCE_FILES.length} fichier(s).`)

  const placed = distribute(students, ALL_CLASSES)
  const perClass = new Map()
  placed.forEach(s => perClass.set(s.classe, (perClass.get(s.classe) || 0) + 1))

  console.log(`\n📚 Répartition sur ${ALL_CLASSES.length} classes :`)
  for (const c of ALL_CLASSES) console.log(`   ${c.padEnd(10)} ${perClass.get(c) || 0} élève(s)`)

  if (!COMMIT) {
    console.log('\n💡 Dry-run. Relance avec --commit pour écrire dans Firestore.')
    console.log('\nAperçu (5 premiers) :')
    placed.slice(0, 5).forEach(s => console.log(`   • ${s.codeMassar}  ${s.nomComplet}  → ${s.classe}`))
    process.exit(0)
  }

  const keyPath = path.join(__dirname, '..', '..', '.secrets', 'firebase-admin.json')
  if (!fs.existsSync(keyPath)) { console.error('❌ Clé Firebase Admin introuvable'); process.exit(1) }
  admin.initializeApp({ credential: admin.credential.cert(require(keyPath)) })
  const db = admin.firestore()
  const TS = admin.firestore.FieldValue.serverTimestamp

  let batch = db.batch(), ops = 0
  for (const s of placed) {
    batch.set(db.collection('eleves').doc(s.codeMassar), {
      codeMassar: s.codeMassar,
      nom: s.nom,
      prenom: s.prenom,
      nomComplet: s.nomComplet,
      classe: s.classe,
      classes: [s.classe],
      niveau: niveauOf(s.classe),
      dateNaissance: s.dateNaissance,
      updatedAt: TS(),
    })
    if (++ops === 450) { await batch.commit(); batch = db.batch(); ops = 0 }
  }
  if (ops > 0) await batch.commit()

  console.log(`\n✅ ${placed.length} élève(s) écrit(s) dans Firestore.`)
  process.exit(0)
}

main().catch(e => { console.error('❌', e); process.exit(1) })
