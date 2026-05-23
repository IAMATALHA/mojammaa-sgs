/**
 * Import students from MASSAR Excel exports into Firestore.
 *
 * Lit tous les fichiers `data/export_notesCC_*.xlsx` (format MASSAR
 * du Ministère de l'Éducation), extrait les élèves, déduplique par
 * code MASSAR, transliterre l'arabe en français marocain, et :
 *
 *   - sans `--commit` : dry-run, affiche ce qui serait écrit
 *   - avec `--commit`  : écrit dans la collection `eleves`
 *
 * Usage :
 *   node scripts/importStudents.js              # dry-run
 *   node scripts/importStudents.js --commit     # écriture réelle
 *
 * Prérequis : .secrets/firebase-admin.json (clé de service Firebase Admin)
 */

const path  = require('path')
const fs    = require('fs')
const glob  = require('glob')
const XLSX  = require('xlsx')

// ──────────────────────────────────────────────────────────────────────────
// 1. Transliteration arabe → français (style marocain)
// ──────────────────────────────────────────────────────────────────────────

// Dictionnaire des noms marocains courants (override la translit phonétique
// pour les noms où les voyelles courtes manquent en arabe — la majorité)
const NAME_DICT = {
  // Prénoms
  'محمد':       'Mohamed',
  'أحمد':       'Ahmed',
  'يوسف':       'Youssef',
  'علي':        'Ali',
  'حسن':        'Hassan',
  'حسين':       'Hossine',
  'ابراهيم':    'Ibrahim',
  'إبراهيم':    'Ibrahim',
  'إسماعيل':    'Ismail',
  'اسماعيل':    'Ismail',
  'خالد':       'Khalid',
  'سعيد':       'Said',
  'مصطفى':      'Mustapha',
  'زكرياء':     'Zakaria',
  'زكريا':      'Zakaria',
  'عمر':        'Omar',
  'عثمان':      'Othmane',
  'نور':        'Nour',
  'سراج':       'Siraj',
  'وليد':       'Walid',
  'زيد':        'Zaid',
  'نادر':       'Nader',
  'ياسين':      'Yassine',
  'ياسر':       'Yasser',
  'أمين':       'Amine',
  'امين':       'Amine',
  'مصعب':       'Mossab',
  'إياد':       'Iyad',
  'اياد':       'Iyad',
  'جابر':       'Jaber',
  'اسحاق':      'Ishak',
  'إسحاق':      'Ishak',
  'يحي':        'Yahya',
  'يحيى':       'Yahya',
  'صفوان':      'Safouane',
  'عدنان':      'Adnan',
  'مهدي':       'Mehdi',
  'أيوب':       'Ayoub',
  'ايوب':       'Ayoub',
  'مروان':      'Marwane',
  'آدم':        'Adam',
  'ريان':       'Rayan',
  'إلياس':      'Ilyas',
  'الياس':      'Ilyas',
  'إكرام':      'Ikram',
  'إسلام':      'Islam',
  'حمزة':       'Hamza',
  'كريم':       'Karim',
  'سفيان':      'Soufiane',
  'سليمان':     'Souleymane',
  'إدريس':      'Idriss',
  'ادريس':      'Idriss',
  'حاتم':       'Hatim',
  'يزيد':       'Yazid',
  'بلال':       'Bilal',
  'طارق':       'Tarik',
  'فهد':        'Fahd',
  'فيصل':       'Faisal',
  'رضا':        'Reda',
  'منير':       'Mounir',
  'بدر':        'Badr',
  'لطفي':       'Lotfi',
  'كمال':       'Kamal',
  'جمال':       'Jamal',
  'نبيل':       'Nabil',
  'رشيد':       'Rachid',
  'محسن':       'Mohsen',
  'هشام':       'Hicham',
  'جواد':       'Jaouad',
  'أسامة':      'Oussama',
  'اسامة':      'Oussama',
  'عبد':        'Abdel',
  'الله':       'Allah',
  'الرحمان':    'Rahman',
  'الرحمن':     'Rahman',
  'الكريم':     'Karim',
  'العزيز':     'Aziz',
  'المجيد':     'Majid',
  'السلام':     'Salam',
  'الحق':       'Haq',
  'الإله':      'Ilah',
  'الإلاه':     'Ilah',
  'النور':      'Nour',
  'القادر':     'Kader',
  'الواحد':     'Wahed',
  'الصمد':      'Samad',
  'الفتاح':     'Fatah',
  'يكي':        'Yaki',
  // Filles (au cas où)
  'فاطمة':      'Fatima',
  'مريم':       'Mariam',
  'خديجة':      'Khadija',
  'عائشة':      'Aicha',
  'زينب':       'Zineb',
  'سارة':       'Sara',
  'هاجر':       'Hajar',
  'ليلى':       'Leila',
  'سلمى':       'Salma',
  'إيمان':      'Imane',
  'ايمان':      'Imane',
  'نادية':      'Nadia',
  'سميرة':      'Samira',
  'كريمة':      'Karima',
  'حسنى':       'Hosna',
  'هند':        'Hind',
  'رانيا':      'Rania',
  'يسرى':       'Yousra',
  'ملاك':       'Malak',
  'أسماء':      'Asmae',
  'اسماء':      'Asmae',
  'إنصاف':      'Insaf',
}

// Convention marocaine : "ch" pour ش, "ou" pour و, "i" pour ي
const MAP = {
  'ا': 'a',  'أ': 'a',  'إ': 'i',  'آ': 'a',
  'ب': 'b',  'ت': 't',  'ث': 'th',
  'ج': 'j',  'ح': 'h',  'خ': 'kh',
  'د': 'd',  'ذ': 'dh',
  'ر': 'r',  'ز': 'z',
  'س': 's',  'ش': 'ch',
  'ص': 's',  'ض': 'd',
  'ط': 't',  'ظ': 'dh',
  'ع': 'a',  'غ': 'gh',
  'ف': 'f',  'ق': 'q',
  'ك': 'k',  'ل': 'l',
  'م': 'm',  'ن': 'n',
  'ه': 'h',  'و': 'ou', 'ي': 'i',  'ى': 'a',
  'ء': '',   'ؤ': 'o',  'ئ': 'i',  'ة': 'a',
  ' ': ' ',  '-': '-',
}

// Diacritics & connectors to strip
const STRIP = /[ً-ٰٟۖ-ۭ]/g

function transliterateWord(arabic) {
  if (!arabic) return ''
  const cleaned = String(arabic).replace(STRIP, '').trim()
  // 1. Dictionary lookup (exact match on the full word)
  if (NAME_DICT[cleaned]) return NAME_DICT[cleaned]
  // 2. Phonetic fallback
  let out = ''
  for (const ch of cleaned) {
    out += MAP[ch] != null ? MAP[ch] : ch
  }
  return out.charAt(0).toUpperCase() + out.slice(1)
}

function transliterate(arabic) {
  if (!arabic) return ''
  return String(arabic)
    .replace(STRIP, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(transliterateWord)
    .join(' ')
}

// ──────────────────────────────────────────────────────────────────────────
// 2. Parse un fichier MASSAR
// ──────────────────────────────────────────────────────────────────────────

const MASSAR_RE = /^A\d{6,}$/

function classFromFilename(file) {
  // export_notesCC_1APIC-3_0019.xlsx → "1APIC-3"
  const m = path.basename(file).match(/notesCC_([^_]+)_/)
  return m ? m[1] : 'INCONNU'
}

function levelFromClass(classe) {
  // 1APIC-3 → "1APIC" (1ère année collège)
  // 2APIC-4 → "2APIC"
  const m = classe.match(/^(\d+APIC|\d+ASC|\d+TC)/i)
  return m ? m[1].toUpperCase() : classe
}

function parseDate(s) {
  // "19-02-2013" → "2013-02-19"
  if (!s) return ''
  const m = String(s).match(/^(\d{2})-(\d{2})-(\d{4})$/)
  if (!m) return String(s)
  return `${m[3]}-${m[2]}-${m[1]}`
}

function parseFile(file) {
  const wb    = XLSX.readFile(file)
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const rows  = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })

  const classe = classFromFilename(file)
  const niveau = levelFromClass(classe)
  const students = []

  rows.forEach((row, idx) => {
    if (!Array.isArray(row) || row.length < 4) return
    // Cherche une cellule qui ressemble à un code MASSAR
    const massarIdx = row.findIndex(c => MASSAR_RE.test(String(c).trim()))
    if (massarIdx < 0) return

    const codeMassar = String(row[massarIdx]).trim()
    // Le nom arabe est dans la cellule suivante (col +1)
    const arabicName = String(row[massarIdx + 1] || '').trim()
    const dob        = String(row[massarIdx + 2] || '').trim()
    if (!arabicName) return

    // Split: 1er mot = nom de famille, le reste = prénom
    const parts  = arabicName.split(/\s+/).filter(Boolean)
    const nomAr  = parts[0] || ''
    const prenomAr = parts.slice(1).join(' ')

    students.push({
      codeMassar,
      nom:         nomAr,
      prenom:      prenomAr,
      nomLatin:    transliterate(nomAr),
      prenomLatin: transliterate(prenomAr),
      nomComplet:  arabicName,
      classe,
      niveau,
      dateNaissance: parseDate(dob),
      sourceFile:  path.basename(file),
    })
  })

  return students
}

// ──────────────────────────────────────────────────────────────────────────
// 3. Dédup + écriture Firestore
// ──────────────────────────────────────────────────────────────────────────

async function main() {
  const COMMIT  = process.argv.includes('--commit')
  const WIPE    = process.argv.includes('--wipe')
  const DATA    = path.join(__dirname, '..', 'data')
  const files   = glob.sync(path.join(DATA, 'export_notesCC_*.xlsx'))

  if (files.length === 0) {
    console.error(`❌ Aucun fichier MASSAR trouvé dans ${DATA}`)
    process.exit(1)
  }

  console.log(`📂 ${files.length} fichier(s) MASSAR trouvé(s) :`)
  files.forEach(f => console.log('   -', path.basename(f)))

  // Parse tous les fichiers
  const allStudents = []
  for (const f of files) {
    const list = parseFile(f)
    console.log(`   → ${list.length} élève(s) dans ${classFromFilename(f)}`)
    allStudents.push(...list)
  }

  // Dédup par codeMassar (un élève peut apparaître dans plusieurs Excels
  // si on récupère ses notes dans différentes matières plus tard)
  const byMassar = new Map()
  allStudents.forEach(s => {
    const existing = byMassar.get(s.codeMassar)
    if (existing) {
      // Concatène les classes si l'élève est dans plusieurs
      if (existing.classe !== s.classe) {
        existing.classes = existing.classes || [existing.classe]
        if (!existing.classes.includes(s.classe)) existing.classes.push(s.classe)
      }
    } else {
      byMassar.set(s.codeMassar, s)
    }
  })

  const unique = [...byMassar.values()]
  console.log(`\n✅ ${unique.length} élève(s) unique(s) au total`)

  // Aperçu
  console.log('\n📋 Aperçu (5 premiers) :')
  unique.slice(0, 5).forEach(s => {
    console.log(`   ${s.codeMassar}  ${s.nomComplet}  →  ${s.nomLatin} ${s.prenomLatin}  (${s.classe})`)
  })

  if (!COMMIT) {
    console.log('\n💡 Dry-run terminé. Relance avec --commit pour écrire dans Firestore.')
    console.log('   Prérequis : .secrets/firebase-admin.json doit exister.')
    return
  }

  // ── COMMIT MODE ────────────────────────────────────────────────
  const keyPath = path.join(__dirname, '..', '.secrets', 'firebase-admin.json')
  if (!fs.existsSync(keyPath)) {
    console.error(`\n❌ Clé Firebase Admin introuvable : ${keyPath}`)
    console.error('   Crée-la depuis console.firebase.google.com → ⚙️ → Paramètres du projet → Comptes de service → Générer une nouvelle clé privée')
    process.exit(1)
  }

  const admin = require('firebase-admin')
  const serviceAccount = require(keyPath)
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })
  const db = admin.firestore()

  // ── WIPE (avec backup automatique) ────────────────────────────
  if (WIPE) {
    console.log('\n🗑️  Wipe demandé. Backup en cours...')
    const snap = await db.collection('eleves').get()
    if (snap.size > 0) {
      const backup = snap.docs.map(d => ({ id: d.id, data: d.data() }))
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      const backupPath = path.join(DATA, `eleves-backup-${ts}.json`)
      fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2))
      console.log(`   ✅ ${snap.size} doc(s) sauvegardés dans ${path.basename(backupPath)}`)

      console.log('   Suppression en cours...')
      let deleted = 0
      const delBatchSize = 400
      for (let i = 0; i < snap.docs.length; i += delBatchSize) {
        const batch = db.batch()
        snap.docs.slice(i, i + delBatchSize).forEach(d => batch.delete(d.ref))
        await batch.commit()
        deleted += Math.min(delBatchSize, snap.docs.length - i)
        console.log(`   Supprimé ${deleted}/${snap.size}`)
      }
    } else {
      console.log('   (collection déjà vide, rien à supprimer)')
    }
  }

  console.log('\n🚀 Écriture vers Firestore...')
  let written = 0
  // Batch écrit par paquets de 400 (limite Firestore: 500)
  const batchSize = 400
  for (let i = 0; i < unique.length; i += batchSize) {
    const batch = db.batch()
    const slice = unique.slice(i, i + batchSize)
    slice.forEach(s => {
      const ref = db.collection('eleves').doc(s.codeMassar)
      batch.set(ref, {
        codeMassar:    s.codeMassar,
        nom:           s.nom,
        prenom:        s.prenom,
        nomLatin:      s.nomLatin,
        prenomLatin:   s.prenomLatin,
        nomComplet:    s.nomComplet,
        classe:        s.classe,
        classes:       s.classes ?? [s.classe],
        niveau:        s.niveau,
        dateNaissance: s.dateNaissance,
        updatedAt:     admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true })
    })
    await batch.commit()
    written += slice.length
    console.log(`   ${written}/${unique.length}`)
  }

  console.log(`\n✅ ${written} élève(s) écrit(s) dans Firestore (collection "eleves")`)
  process.exit(0)
}

main().catch(err => {
  console.error('❌ Erreur fatale :', err)
  process.exit(1)
})
