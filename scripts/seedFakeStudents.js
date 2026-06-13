/**
 * Génère des élèves IMAGINAIRES pour des classes données.
 *
 * Crée N élèves par classe avec des noms marocains réalistes (arabe + latin),
 * des codes MASSAR factices préfixés "A99" (ne peuvent pas entrer en collision
 * avec les vrais codes "A17..."), au même format que la collection `eleves`.
 *
 * Usage :
 *   node scripts/seedFakeStudents.js                 # dry-run (aperçu)
 *   node scripts/seedFakeStudents.js --commit        # écrit dans Firestore
 *
 * Classes & nombre configurables ci-dessous.
 */

const path = require('path')
const fs   = require('fs')

const CLASSES = ['2APIC-3', '3APIC-5']
const PER_CLASS = 20

// noms de famille marocains : [arabe, latin]
const FAMILY = [
  ['العلوي','Alaoui'], ['الإدريسي','Idrissi'], ['بنعلي','Benali'], ['العمراني','Amrani'],
  ['الفاسي','Fassi'], ['بنجلون','Benjelloun'], ['الشرقاوي','Charkaoui'], ['الحسني','Hassani'],
  ['المنصوري','Mansouri'], ['بناني','Bennani'], ['التازي','Tazi'], ['الصقلي','Sekkali'],
  ['بركة','Baraka'], ['الزيتوني','Zaitouni'], ['القباج','Kabbaj'], ['الوزاني','Ouazzani'],
  ['بلحاج','Belhaj'], ['الرامي','Rami'], ['السباعي','Sbai'], ['المرابط','Marabet'],
  ['الناصري','Naciri'], ['بنكيران','Benkirane'], ['الخطيب','Khatib'], ['العماري','Ammari'],
  ['الجامعي','Jamai'], ['بوزيد','Bouzid'], ['الحلوي','Halwi'], ['الركراكي','Regragui'],
  ['الزروالي','Zerouali'], ['بوعزة','Bouazza'],
]

// prénoms garçons : [arabe, latin]
const BOYS = [
  ['محمد','Mohamed'], ['أحمد','Ahmed'], ['يوسف','Youssef'], ['عمر','Omar'], ['حمزة','Hamza'],
  ['ياسين','Yassine'], ['أيوب','Ayoub'], ['آدم','Adam'], ['ريان','Rayan'], ['مهدي','Mehdi'],
  ['أمين','Amine'], ['بلال','Bilal'], ['إلياس','Ilyas'], ['سفيان','Soufiane'], ['مروان','Marwane'],
  ['أسامة','Oussama'], ['وليد','Walid'], ['كريم','Karim'], ['زكرياء','Zakaria'], ['نبيل','Nabil'],
]

// prénoms filles : [arabe, latin]
const GIRLS = [
  ['فاطمة','Fatima'], ['مريم','Mariam'], ['خديجة','Khadija'], ['عائشة','Aicha'], ['زينب','Zineb'],
  ['سارة','Sara'], ['هاجر','Hajar'], ['سلمى','Salma'], ['إيمان','Imane'], ['أسماء','Asmae'],
  ['ملاك','Malak'], ['يسرى','Yousra'], ['رانيا','Rania'], ['هند','Hind'], ['نادية','Nadia'],
  ['سميرة','Samira'], ['كريمة','Karima'], ['ليلى','Leila'], ['إنصاف','Insaf'], ['نور','Nour'],
]

function pick(arr, i) { return arr[i % arr.length] }

function niveauFromClasse(classe) {
  // "2APIC-3" -> "2APIC", "3APIC-5" -> "3APIC"
  return classe.split('-')[0]
}

function randomDOB(niveau) {
  // APIC niveau N : nés ≈ 2014 - N (1APIC~2013, 2APIC~2012, 3APIC~2011)
  const lvl = parseInt(niveau, 10)
  const baseYear = Number.isFinite(lvl) ? 2014 - lvl : 2011
  const year = baseYear + Math.floor(Math.random() * 2)
  const month = String(1 + Math.floor(Math.random() * 12)).padStart(2, '0')
  const day = String(1 + Math.floor(Math.random() * 28)).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function build() {
  const students = []
  let seq = 1
  CLASSES.forEach((classe, ci) => {
    const niveau = niveauFromClasse(classe)
    for (let i = 0; i < PER_CLASS; i++) {
      const fam = pick(FAMILY, ci * 7 + i * 3 + 1)
      const given = (i % 2 === 0) ? pick(BOYS, ci * 5 + i) : pick(GIRLS, ci * 5 + i)
      const codeMassar = 'A99' + String(seq++).padStart(6, '0') // A99000001...
      students.push({
        codeMassar,
        nom: fam[0],
        prenom: given[0],
        nomLatin: fam[1],
        prenomLatin: given[1],
        nomComplet: `${fam[0]} ${given[0]}`,
        classe,
        niveau,
        dateNaissance: randomDOB(niveau),
      })
    }
  })
  return students
}

async function main() {
  const COMMIT = process.argv.includes('--commit')
  const students = build()

  console.log(`📋 ${students.length} élèves imaginaires (${PER_CLASS}/classe) :`)
  CLASSES.forEach(c => {
    const sample = students.filter(s => s.classe === c).slice(0, 3)
    console.log(`\n  ${c} :`)
    sample.forEach(s => console.log(`    ${s.codeMassar}  ${s.nomComplet}  →  ${s.nomLatin} ${s.prenomLatin}`))
    console.log(`    ... (${PER_CLASS} au total)`)
  })

  if (!COMMIT) {
    console.log('\n💡 Dry-run. Relance avec --commit pour écrire dans Firestore.')
    return
  }

  const keyPath = path.join(__dirname, '..', '.secrets', 'firebase-admin.json')
  if (!fs.existsSync(keyPath)) { console.error('❌ Clé Firebase Admin introuvable'); process.exit(1) }
  const admin = require('firebase-admin')
  admin.initializeApp({ credential: admin.credential.cert(require(keyPath)) })
  const db = admin.firestore()

  console.log('\n🚀 Écriture vers Firestore...')
  const batch = db.batch()
  students.forEach(s => {
    const ref = db.collection('eleves').doc(s.codeMassar)
    batch.set(ref, {
      codeMassar: s.codeMassar,
      nom: s.nom, prenom: s.prenom,
      nomLatin: s.nomLatin, prenomLatin: s.prenomLatin,
      nomComplet: s.nomComplet,
      classe: s.classe, classes: [s.classe],
      niveau: s.niveau, dateNaissance: s.dateNaissance,
      fake: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true })
  })
  await batch.commit()
  console.log(`\n✅ ${students.length} élèves imaginaires écrits dans "eleves" (champ fake:true)`)
  process.exit(0)
}

main().catch(e => { console.error('❌', e); process.exit(1) })
