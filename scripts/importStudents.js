const { preserveLatinNames } = require('../functions/studentLatinNames')
/**
 * Import students from MASSAR Excel exports into Firestore.
 *
 * Lit tous les fichiers `data/export_notesCC_*.xlsx` (format MASSAR
 * du Ministère de l'Éducation), extrait les élèves, déduplique par
 * code MASSAR, transliterre l'arabe en français marocain, et :
 *
 *   - sans `--commit` : dry-run, affiche uniquement des totaux anonymisés
 *   - avec `--commit` : active/ajoute les élèves de l'année courante
 *   - avec `--archive-missing` : prépare l'archivage des élèves absents
 *     des exports officiels, sans supprimer leur historique ni parentUid
 *
 * Usage :
 *   node scripts/importStudents.js
 *   node scripts/importStudents.js --academic-year=2026-2027 --archive-missing
 *   node scripts/importStudents.js --academic-year=2026-2027 --archive-missing \
 *     --commit --confirm-archive=<nombre_du_dry-run>
 *
 * Prérequis : .secrets/firebase-admin.json (clé de service Firebase Admin)
 */

const path  = require('path')
const fs    = require('fs')
const glob  = require('glob')
const XLSX  = require('xlsx')
const {
  assertArchiveConfirmation,
  buildStudentYearSyncPlan,
  normalizeAcademicYear,
} = require('./lib/studentYearSync')

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

// Le préfixe varie selon l'élève : ne pas limiter les exports à la lettre A.
const MASSAR_RE = /^[A-Z]\d{6,}$/

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

function parseFile(file, sheetName = null) {
  const wb    = XLSX.readFile(file)
  const selectedSheet = sheetName || wb.SheetNames[0]
  const sheet = wb.Sheets[selectedSheet]
  const rows  = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
  return parseRows(rows, file, selectedSheet)
}

function parseRows(rows, file, selectedSheet) {
  const listEleveFormat = /^ListEleve_/i.test(path.basename(file))
  const classe = listEleveFormat ? selectedSheet : classFromFilename(file)
  const niveau = levelFromClass(classe)
  const students = []

  rows.forEach((row, idx) => {
    if (!Array.isArray(row) || row.length < 4) return
    // Cherche une cellule qui ressemble à un code MASSAR
    const numberedStudent = listEleveFormat && Number.isInteger(row[0]) && row[0] > 0
    if (numberedStudent && !MASSAR_RE.test(String(row[1]).trim())) {
      throw new Error(`Code MASSAR invalide : ${selectedSheet}, ligne ${idx + 1}. Import annulé.`)
    }
    const massarIdx = numberedStudent ? 1 : row.findIndex(c => MASSAR_RE.test(String(c).trim()))
    if (massarIdx < 0) return

    const codeMassar = String(row[massarIdx]).trim()
    let nomAr
    let prenomAr
    let nomComplet
    let dob
    if (listEleveFormat) {
      nomAr = String(row[massarIdx + 1] || '').trim()
      prenomAr = String(row[massarIdx + 2] || '').trim()
      dob = String(row[massarIdx + 4] || '').trim()
      nomComplet = `${nomAr} ${prenomAr}`.trim()
      if (!nomAr || !prenomAr) {
        throw new Error(`Identité incomplète : ${selectedSheet}, ligne ${idx + 1}. Import annulé.`)
      }
    } else {
      // Format MASSAR historique : nom complet dans la cellule suivante.
      const arabicName = String(row[massarIdx + 1] || '').trim()
      dob = String(row[massarIdx + 2] || '').trim()
      if (!arabicName) return
      const parts  = arabicName.split(/\s+/).filter(Boolean)
      nomAr  = parts[0] || ''
      prenomAr = parts.slice(1).join(' ')
      nomComplet = arabicName
    }

    students.push({
      codeMassar,
      nom:         nomAr,
      prenom:      prenomAr,
      nomLatin:    transliterate(nomAr),
      prenomLatin: transliterate(prenomAr),
      nomComplet,
      classe,
      niveau,
      dateNaissance: parseDate(dob),
      sourceFile:  path.basename(file),
      sourceSheet: selectedSheet,
    })
  })

  return students
}

// ──────────────────────────────────────────────────────────────────────────
// 3. Dédup + synchronisation Firestore
// ──────────────────────────────────────────────────────────────────────────

function argumentValue(name) {
  const prefix = `${name}=`
  const arg = process.argv.find(value => value.startsWith(prefix))
  return arg ? arg.slice(prefix.length) : ''
}

async function main() {
  const COMMIT = process.argv.includes('--commit')
  const WIPE = process.argv.includes('--wipe')
  const ARCHIVE_MISSING = process.argv.includes('--archive-missing')
  const requestedAcademicYear = argumentValue('--academic-year')
  const archiveConfirmation = argumentValue('--confirm-archive')
  const DATA = path.join(__dirname, '..', 'data')
  const listEleveFiles = glob.sync(path.join(DATA, 'ListEleve_*.xlsx'))
  const files = listEleveFiles.length > 0
    ? listEleveFiles
    : glob.sync(path.join(DATA, 'export_notesCC_*.xlsx'))

  if (WIPE) {
    throw new Error(
      'Le mode --wipe est désactivé : il détruirait les liens parents et les historiques. '
      + 'Utilisez --archive-missing.',
    )
  }

  let academicYear = ''
  if (requestedAcademicYear) academicYear = normalizeAcademicYear(requestedAcademicYear)
  if ((COMMIT || ARCHIVE_MISSING) && !academicYear) {
    throw new Error(
      'Ajoutez une année scolaire explicite, par exemple --academic-year=2026-2027.',
    )
  }

  if (files.length === 0) {
    console.error(`❌ Aucun fichier MASSAR trouvé dans ${DATA}`)
    process.exit(1)
  }

  console.log(`📂 ${files.length} fichier(s) MASSAR trouvé(s) :`)
  files.forEach(f => console.log('   -', path.basename(f)))

  // Parse tous les fichiers
  const allStudents = []
  for (const f of files) {
    const workbook = XLSX.readFile(f)
    const isListEleve = /^ListEleve_/i.test(path.basename(f))
    const sheets = isListEleve ? workbook.SheetNames : [workbook.SheetNames[0]]
    for (const sheetName of sheets) {
      const list = parseFile(f, sheetName)
      console.log(`   → ${list.length} élève(s) dans ${sheetName}`)
      allStudents.push(...list)
    }
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

  let admin = null
  let db = null
  let existingStudents = []
  if (COMMIT || ARCHIVE_MISSING) {
    const keyPath = path.join(__dirname, '..', '.secrets', 'firebase-admin.json')
    if (!fs.existsSync(keyPath)) {
      throw new Error(`Clé Firebase Admin introuvable : ${keyPath}`)
    }
    admin = require('firebase-admin')
    const serviceAccount = require(keyPath)
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })
    db = admin.firestore()
    const existingSnap = await db.collection('eleves').get()
    existingStudents = existingSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
  }

  if (!academicYear) {
    console.log('\n💡 Lecture locale terminée. Aucun nom, code MASSAR ou autre donnée personnelle n’a été affiché.')
    console.log('   Pour préparer la rentrée : ajoutez --academic-year=YYYY-YYYY --archive-missing.')
    return
  }

  const plan = buildStudentYearSyncPlan({
    existingStudents,
    importedStudents: unique,
    academicYear,
    archiveMissing: ARCHIVE_MISSING,
  })
  console.log('\n📊 Plan de synchronisation (totaux uniquement) :')
  console.log(`   Année scolaire : ${plan.academicYear}`)
  console.log(`   Élèves dans les exports : ${plan.counts.imported}`)
  console.log(`   Nouveaux : ${plan.counts.new}`)
  console.log(`   Mis à jour : ${plan.counts.updated}`)
  console.log(`   Réactivés : ${plan.counts.reactivated}`)
  console.log(`   À archiver : ${plan.counts.archived}`)
  console.log(`   Déjà archivés : ${plan.counts.alreadyArchived}`)

  if (!COMMIT) {
    console.log('\n🔒 Dry-run terminé : aucune écriture Firestore.')
    if (ARCHIVE_MISSING) {
      console.log(
        `   Après vérification des totaux, relancez avec --commit --confirm-archive=${plan.counts.archived}`,
      )
    }
    return
  }

  if (ARCHIVE_MISSING) {
    assertArchiveConfirmation(plan.counts.archived, archiveConfirmation)
  } else if (archiveConfirmation) {
    throw new Error('--confirm-archive exige aussi --archive-missing.')
  }

  console.log('\n🚀 Synchronisation vers Firestore...')
  let written = 0
  const existingIdByMassar = new Map(
    existingStudents
      .filter(s => typeof s.codeMassar === 'string' && s.codeMassar.trim())
      .map(s => [s.codeMassar.trim(), s.id]),
  )
  // Batch écrit par paquets de 400 (limite Firestore: 500)
  const batchSize = 400
  for (let i = 0; i < plan.toUpsert.length; i += batchSize) {
    const slice = plan.toUpsert.slice(i, i + batchSize)
    await db.runTransaction(async tx => {
      const refs = slice.map(s => db.collection('eleves').doc(existingIdByMassar.get(s.codeMassar) || s.codeMassar))
      const current = await tx.getAll(...refs)
      slice.forEach((s, index) => {
        // Si une ancienne base utilise un ID non canonique, écrire dans le doc
        // existant conserve parentUid et évite de créer un doublon.
        const ref = db.collection('eleves').doc(existingIdByMassar.get(s.codeMassar) || s.codeMassar)
        tx.set(ref, {
          codeMassar:    s.codeMassar,
          nom:           s.nom,
          prenom:        s.prenom,
          ...preserveLatinNames(current[index].data(), s),
          nomComplet:    s.nomComplet,
          classe:        s.classe,
          classes:       s.classes ?? [s.classe],
          niveau:        s.niveau,
          dateNaissance: s.dateNaissance,
          active:        true,
          academicYear:  plan.academicYear,
          archivedAt:    admin.firestore.FieldValue.delete(),
          archivedBeforeAcademicYear: admin.firestore.FieldValue.delete(),
          updatedAt:     admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true })
      })
    })
    written += slice.length
    console.log(`   Actifs écrits : ${written}/${plan.toUpsert.length}`)
  }

  let archived = 0
  for (let i = 0; i < plan.toArchive.length; i += batchSize) {
    const batch = db.batch()
    const slice = plan.toArchive.slice(i, i + batchSize)
    slice.forEach(s => {
      const ref = db.collection('eleves').doc(s.id || s.codeMassar)
      batch.set(ref, {
        active: false,
        archivedAt: admin.firestore.FieldValue.serverTimestamp(),
        archivedBeforeAcademicYear: plan.academicYear,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true })
    })
    await batch.commit()
    archived += slice.length
    console.log(`   Archivés : ${archived}/${plan.toArchive.length}`)
  }

  console.log(
    `\n✅ Synchronisation terminée : ${written} actif(s), ${archived} archivé(s), 0 suppression.`,
  )
}

module.exports = { parseFile, parseRows }

if (require.main === module) {
  main().catch(err => {
    console.error('❌ Synchronisation annulée :', err.message || err)
    process.exit(1)
  })
}
