/**
 * SEED DÉMO — école fictive cohérente pour présentation à l'établissement.
 *
 * Génère (déterministe, ré-exécutable) :
 *   • ~200 élèves (préscolaire + primaire AEP + collège APIC), noms marocains
 *   • un corps enseignant + directory/staff
 *   • un emploi du temps hebdomadaire complet par classe (emploiDuTemps + schedules)
 *   • des notes S1/S2 par matière (primaire & collège)
 *   • présences (registre du jour + exceptions récentes)
 *   • comportements, devoirs, ressources, événements, annonces
 *   • 3 comptes de DÉMO à remettre à l'école : directeur, enseignant, parent
 *   • agrégats classStats + stats/summary recalculés
 *
 * ⚠️  Lance backupAll.js puis wipeAll.js --commit AVANT.
 *
 *   node scripts/demo/seedDemo.js            → dry-run (aperçu + plan)
 *   node scripts/demo/seedDemo.js --commit   → écrit dans Firestore + Auth
 */
const path = require('path')
const fs = require('fs')

const COMMIT = process.argv.includes('--commit')
const TODAY = '2026-06-20'
const ACADEMIC_YEAR = '2025-2026'
const DEMO_PASSWORD = 'demo1234'

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

// ─────────────────────────────────────────────────────────────────────────
// PRNG déterministe (mulberry32) — même graine ⇒ mêmes données.
// ─────────────────────────────────────────────────────────────────────────
function hashStr(s) { let h = 1779033703 ^ s.length; for (let i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19) } return h >>> 0 }
function rng(seed) { let a = typeof seed === 'string' ? hashStr(seed) : seed; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }
const pickIdx = (arr, i) => arr[((i % arr.length) + arr.length) % arr.length]

// ─────────────────────────────────────────────────────────────────────────
// Banques de noms marocains (arabe + latin)
// ─────────────────────────────────────────────────────────────────────────
const FAMILY = [
  ['العلوي', 'Alaoui'], ['الإدريسي', 'Idrissi'], ['بنعلي', 'Benali'], ['العمراني', 'Amrani'],
  ['الفاسي', 'Fassi'], ['بنجلون', 'Benjelloun'], ['الشرقاوي', 'Charkaoui'], ['الحسني', 'Hassani'],
  ['المنصوري', 'Mansouri'], ['بناني', 'Bennani'], ['التازي', 'Tazi'], ['الصقلي', 'Sekkali'],
  ['بركة', 'Baraka'], ['الزيتوني', 'Zaitouni'], ['القباج', 'Kabbaj'], ['الوزاني', 'Ouazzani'],
  ['بلحاج', 'Belhaj'], ['الرامي', 'Rami'], ['السباعي', 'Sbai'], ['المرابط', 'Marabet'],
  ['الناصري', 'Naciri'], ['بنكيران', 'Benkirane'], ['الخطيب', 'Khatib'], ['العماري', 'Ammari'],
  ['الجامعي', 'Jamai'], ['بوزيد', 'Bouzid'], ['الحلوي', 'Halwi'], ['الركراكي', 'Regragui'],
  ['الزروالي', 'Zerouali'], ['بوعزة', 'Bouazza'],
]
const BOYS = [
  ['محمد', 'Mohamed'], ['أحمد', 'Ahmed'], ['يوسف', 'Youssef'], ['عمر', 'Omar'], ['حمزة', 'Hamza'],
  ['ياسين', 'Yassine'], ['أيوب', 'Ayoub'], ['آدم', 'Adam'], ['ريان', 'Rayan'], ['مهدي', 'Mehdi'],
  ['أمين', 'Amine'], ['بلال', 'Bilal'], ['إلياس', 'Ilyas'], ['سفيان', 'Soufiane'], ['مروان', 'Marwane'],
  ['أسامة', 'Oussama'], ['وليد', 'Walid'], ['كريم', 'Karim'], ['زكرياء', 'Zakaria'], ['نبيل', 'Nabil'],
]
const GIRLS = [
  ['فاطمة', 'Fatima'], ['مريم', 'Mariam'], ['خديجة', 'Khadija'], ['عائشة', 'Aicha'], ['زينب', 'Zineb'],
  ['سارة', 'Sara'], ['هاجر', 'Hajar'], ['سلمى', 'Salma'], ['إيمان', 'Imane'], ['أسماء', 'Asmae'],
  ['ملاك', 'Malak'], ['يسرى', 'Yousra'], ['رانيا', 'Rania'], ['هند', 'Hind'], ['نادية', 'Nadia'],
  ['سميرة', 'Samira'], ['كريمة', 'Karima'], ['ليلى', 'Leila'], ['إنصاف', 'Insaf'], ['نور', 'Nour'],
]

// ─────────────────────────────────────────────────────────────────────────
// Structure de l'école : classes, effectifs, matières par cycle
// ─────────────────────────────────────────────────────────────────────────
const SCHOOL = [
  { cycle: 'prescolaire', classes: ['PS-1', 'GS-1'], perClass: 16 },
  { cycle: 'primaire',    classes: ['1AEP-1', '2AEP-1', '3AEP-1', '4AEP-1', '5AEP-1', '6AEP-1'], perClass: 17 },
  { cycle: 'college',     classes: ['1APIC-1', '1APIC-2', '2APIC-1', '3APIC-1'], perClass: 18 },
]
const SUBJECTS = {
  prescolaire: [],
  primaire: [
    { key: 'arabe', label: 'Arabe' }, { key: 'francais', label: 'Français' }, { key: 'maths', label: 'Maths' },
    { key: 'eveil', label: 'Éveil scientifique' }, { key: 'islamique', label: 'Éducation Islamique' },
    { key: 'histgeo', label: 'Histoire-Géo' }, { key: 'anglais', label: 'Anglais' },
    { key: 'info', label: 'Informatique' }, { key: 'eps', label: 'EPS' },
  ],
  college: [
    { key: 'maths', label: 'Mathématiques' }, { key: 'francais', label: 'Français' }, { key: 'arabe', label: 'Arabe' },
    { key: 'anglais', label: 'Anglais' }, { key: 'pc', label: 'Physique-Chimie' }, { key: 'svt', label: 'SVT' },
    { key: 'histgeo', label: 'Histoire-Géo' }, { key: 'islamique', label: 'Éducation Islamique' },
    { key: 'info', label: 'Informatique' }, { key: 'eps', label: 'EPS' },
  ],
}
const PRESCO_ACTIVITIES = ['Éveil', 'Langage', 'Graphisme', 'Activités artistiques', 'Psychomotricité', 'Comptines']
const BIRTH_YEAR = { PS: 2021, GS: 2020, '1AEP': 2019, '2AEP': 2018, '3AEP': 2017, '4AEP': 2016, '5AEP': 2015, '6AEP': 2014, '1APIC': 2013, '2APIC': 2012, '3APIC': 2011 }

const niveauOf = c => c.split('-')[0]
const cycleOf = c => SCHOOL.find(s => s.classes.includes(c)).cycle
const allAcademicClasses = SCHOOL.filter(s => s.cycle !== 'prescolaire').flatMap(s => s.classes)
const allClasses = SCHOOL.flatMap(s => s.classes)

// ─────────────────────────────────────────────────────────────────────────
// Génération des élèves
// ─────────────────────────────────────────────────────────────────────────
function buildStudents() {
  const out = []
  let seq = 1
  for (const block of SCHOOL) {
    for (let ci = 0; ci < block.classes.length; ci++) {
      const classe = block.classes[ci]
      const niveau = niveauOf(classe)
      const r = rng('students:' + classe)
      for (let i = 0; i < block.perClass; i++) {
        const fam = pickIdx(FAMILY, Math.floor(r() * FAMILY.length))
        const isBoy = i % 2 === 0
        const given = isBoy ? pickIdx(BOYS, Math.floor(r() * BOYS.length)) : pickIdx(GIRLS, Math.floor(r() * GIRLS.length))
        const codeMassar = 'D' + String(seq++).padStart(7, '0')
        const by = BIRTH_YEAR[niveau] || 2015
        const month = String(1 + Math.floor(r() * 12)).padStart(2, '0')
        const day = String(1 + Math.floor(r() * 28)).padStart(2, '0')
        out.push({
          codeMassar, nom: fam[0], prenom: given[0], nomLatin: fam[1], prenomLatin: given[1],
          nomComplet: `${fam[0]} ${given[0]}`, classe, niveau, cycle: block.cycle,
          dateNaissance: `${by}-${month}-${day}`,
          parentTel: '06' + String(10000000 + Math.floor(r() * 89999999)),
        })
      }
    }
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────────
// Corps enseignant : un prof par (cycle, matière), réutilisé sur les classes
// du cycle. Le prof de maths collège = compte de DÉMO enseignant.
// ─────────────────────────────────────────────────────────────────────────
const TEACHER_NAMES = [
  ['Bennani', 'Salma'], ['El Amrani', 'Karim'], ['Tazi', 'Nadia'], ['Idrissi', 'Hicham'],
  ['Berrada', 'Imane'], ['Chraibi', 'Omar'], ['Lahlou', 'Sofia'], ['Fassi', 'Mehdi'],
  ['Sebti', 'Leila'], ['Alaoui', 'Reda'], ['Kettani', 'Houda'], ['Naciri', 'Khalid'],
  ['Bouazza', 'Sara'], ['Ouazzani', 'Younes'], ['Mansouri', 'Asmae'], ['Belhaj', 'Tarik'],
  ['Sekkali', 'Meryem'], ['Rami', 'Adil'], ['Zaitouni', 'Nawal'], ['Kabbaj', 'Driss'],
]

function buildStaff() {
  const teachers = new Map() // key `${cycle}:${subjectKey}` → teacher
  let n = 0
  const make = (cycle, subj, classes) => {
    const key = `${cycle}:${subj.key}`
    if (teachers.has(key)) { const t = teachers.get(key); t.classes = [...new Set([...t.classes, ...classes])]; return t }
    const nm = pickIdx(TEACHER_NAMES, n++)
    const t = {
      localId: `T${String(n).padStart(2, '0')}`, nom: nm[0], prenom: nm[1],
      email: null, // pas de login (sauf démo, géré à part)
      cycle, matiere: subj.label, subjectKey: subj.key, classes: [...classes],
    }
    teachers.set(key, t)
    return t
  }
  for (const block of SCHOOL) {
    for (const subj of SUBJECTS[block.cycle]) make(block.cycle, subj, block.classes)
  }
  // Préscolaire : une maîtresse par classe (activités, pas de notes)
  for (const c of SCHOOL.find(s => s.cycle === 'prescolaire').classes) {
    const nm = pickIdx(TEACHER_NAMES, n++)
    teachers.set(`presco:${c}`, { localId: `P${c}`, nom: nm[0], prenom: nm[1], email: null, cycle: 'prescolaire', matiere: 'Préscolaire', subjectKey: 'presco', classes: [c] })
  }
  return teachers
}

function teacherForClassSubject(staff, classe, subjectKey) {
  const cyc = cycleOf(classe)
  return staff.get(`${cyc}:${subjectKey}`)
}

// ─────────────────────────────────────────────────────────────────────────
// Emploi du temps hebdomadaire par classe
// ─────────────────────────────────────────────────────────────────────────
const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']
const PERIODS = [['08:30', '09:30'], ['09:30', '10:30'], ['10:30', '11:30'], ['14:00', '15:00'], ['15:00', '16:00']]

function buildTimetable(staff) {
  // emploiDuTemps docs (vue classe) + accumulation des slots par prof (schedules)
  const edt = []
  const slotsByTeacher = new Map()
  allClasses.forEach((classe, ci) => {
    const cyc = cycleOf(classe)
    const subjects = SUBJECTS[cyc]
    DAYS.forEach((day, di) => {
      PERIODS.forEach(([startTime, endTime], pi) => {
        let matiere, teacher
        if (cyc === 'prescolaire') {
          matiere = pickIdx(PRESCO_ACTIVITIES, di * PERIODS.length + pi)
          teacher = staff.get(`presco:${classe}`)
        } else {
          const subj = pickIdx(subjects, di * PERIODS.length + pi + ci) // décalage par classe
          matiere = subj.label
          teacher = teacherForClassSubject(staff, classe, subj.key)
        }
        const slot = { day, startTime, endTime, durationMin: 60, classe, matiere }
        edt.push({ classe, day, startTime, endTime, durationMin: 60, matiere, teacher })
        const arr = slotsByTeacher.get(teacher.localId) || []
        arr.push(slot)
        slotsByTeacher.set(teacher.localId, arr)
      })
    })
  })
  return { edt, slotsByTeacher }
}

// ─────────────────────────────────────────────────────────────────────────
// Notes S1/S2
// ─────────────────────────────────────────────────────────────────────────
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const round2 = v => Math.round(v * 100) / 100

function buildNotes(students) {
  const notes = []
  const classBase = new Map()
  // bases variées (9.5..14) → certaines classes plus faibles que d'autres
  for (const c of allAcademicClasses) classBase.set(c, 9.5 + rng('cbase:' + c)() * 4.5)
  for (const st of students) {
    if (st.cycle === 'prescolaire') continue
    const subjects = SUBJECTS[st.cycle]
    const sr = rng('snote:' + st.codeMassar)
    const studentOffset = (sr() - 0.5) * 7 // ±3.5 → vrais écarts entre élèves
    for (const sem of ['S1', 'S2']) {
      for (const subj of subjects) {
        const subjOffset = (rng(`so:${st.codeMassar}:${subj.key}:${sem}`)() - 0.5) * 4
        const note = clamp(round2(classBase.get(st.classe) + studentOffset + subjOffset), 3, 19.5)
        notes.push({
          id: `${st.codeMassar}_${ACADEMIC_YEAR}_${sem}_${subj.key}`,
          eleveId: st.codeMassar, eleveNom: st.nom, elevePrenom: st.prenom, codeMassar: st.codeMassar,
          classe: st.classe, cycle: st.cycle, academicYear: ACADEMIC_YEAR, semestre: sem,
          matiere: subj.key, matiereLabel: subj.label, note,
        })
      }
    }
  }
  return notes
}

// ─────────────────────────────────────────────────────────────────────────
// Présences : registre du jour (classes du prof démo) + exceptions récentes
// ─────────────────────────────────────────────────────────────────────────
function recentDates(n) {
  const out = []
  let d = new Date(TODAY + 'T12:00:00')
  while (out.length < n) {
    const dow = d.getDay()
    if (dow !== 0 && dow !== 6) out.push(d.toISOString().slice(0, 10)) // hors week-end
    d = new Date(d.getTime() - 86400000)
  }
  return out
}

function buildAbsences(students, demoTeacher) {
  const rows = []
  const seance = '08:30 - 09:30'
  const demoClasses = demoTeacher.classes
  // Registre du jour pour les classes du prof démo
  for (const st of students.filter(s => demoClasses.includes(s.classe))) {
    const r = rng('att:' + st.codeMassar)
    const v = r()
    const statut = v < 0.88 ? 'present' : v < 0.96 ? 'absent' : 'retard'
    rows.push({ st, date: TODAY, seance, statut, prof: demoTeacher })
  }
  // Exceptions éparses sur les 10 derniers jours d'école, autres classes
  const dates = recentDates(10).slice(1)
  const pool = students.filter(s => s.cycle !== 'prescolaire' && !demoClasses.includes(s.classe))
  const r = rng('exc')
  for (let i = 0; i < 40; i++) {
    const st = pool[Math.floor(r() * pool.length)]
    const date = pickIdx(dates, Math.floor(r() * dates.length))
    const statut = r() < 0.6 ? 'absent' : 'retard'
    rows.push({ st, date, seance, statut, prof: demoTeacher })
  }
  return rows
}

// ─────────────────────────────────────────────────────────────────────────
// Comportements
// ─────────────────────────────────────────────────────────────────────────
const MERITES = ['participation', 'entraide', 'progrès', 'travail soigné', 'comportement exemplaire']
const INCIDENTS = ['bavardage', 'devoir non fait', 'retard répété', 'oubli de matériel']
function buildComportements(students, staff) {
  const rows = []
  const dates = recentDates(12)
  const pool = students.filter(s => s.cycle !== 'prescolaire')
  const r = rng('comp')
  for (let i = 0; i < 26; i++) {
    const st = pool[Math.floor(r() * pool.length)]
    const kind = r() < 0.6 ? 'merite' : 'incident'
    const reason = kind === 'merite' ? pickIdx(MERITES, Math.floor(r() * MERITES.length)) : pickIdx(INCIDENTS, Math.floor(r() * INCIDENTS.length))
    const subj = pickIdx(SUBJECTS[st.cycle], i)
    const teacher = teacherForClassSubject(staff, st.classe, subj.key) || staff.get(`${cycleOf(st.classe)}:${SUBJECTS[st.cycle][0].key}`)
    rows.push({ st, kind, reason, date: pickIdx(dates, i), seance: 'S' + (1 + (i % 6)), teacher })
  }
  return rows
}

// ─────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────
async function main() {
  const students = buildStudents()
  const staff = buildStaff()
  const { edt, slotsByTeacher } = buildTimetable(staff)
  const notes = buildNotes(students)
  const staffList = [...staff.values()]
  // Le prof de maths collège devient le compte enseignant de démo
  const demoTeacherLocal = staff.get('college:maths')
  const comps = buildComportements(students, staff)

  console.log('📋 PLAN DU SEED DÉMO')
  console.log(`   Élèves       : ${students.length} (${allClasses.length} classes)`)
  allClasses.forEach(c => console.log(`        ${c.padEnd(9)} ${students.filter(s => s.classe === c).length}`))
  console.log(`   Enseignants  : ${staffList.length}`)
  console.log(`   Créneaux EDT : ${edt.length}  (schedules: ${slotsByTeacher.size} profs)`)
  console.log(`   Notes        : ${notes.length} (S1+S2)`)
  console.log(`   Comportements: ${comps.length}`)
  console.log('\n   Comptes de DÉMO (mot de passe commun: ' + DEMO_PASSWORD + ')')
  console.log('        directeur@mojammaa.ma   (admin / directeur)')
  console.log('        enseignant@mojammaa.ma  (' + demoTeacherLocal.matiere + ' → ' + demoTeacherLocal.classes.join(', ') + ')')
  console.log('        parent@mojammaa.ma      (2 enfants liés)')

  if (!COMMIT) {
    const sample = students.slice(0, 4).map(s => `${s.codeMassar} ${s.nomComplet} (${s.classe})`)
    console.log('\n   Exemples élèves : ' + sample.join(' · '))
    console.log('\n💡 Dry-run. Relance avec --commit pour écrire (Firestore + Auth).')
    process.exit(0)
  }

  // ── Connexion admin SDK ──
  const keyPath = path.join(__dirname, '..', '..', '.secrets', 'firebase-admin.json')
  if (!fs.existsSync(keyPath)) { console.error('❌ Clé Firebase Admin introuvable'); process.exit(1) }
  const admin = require('firebase-admin')
  admin.initializeApp({ credential: admin.credential.cert(require(keyPath)) })
  const db = admin.firestore()
  const auth = admin.auth()
  const TS = () => admin.firestore.FieldValue.serverTimestamp()

  async function getOrCreateAuth(email, displayName) {
    try { const u = await auth.getUserByEmail(email); await auth.updateUser(u.uid, { password: DEMO_PASSWORD, displayName }); return u.uid }
    catch (e) {
      if (e.code === 'auth/user-not-found') { const u = await auth.createUser({ email, password: DEMO_PASSWORD, displayName, emailVerified: true }); return u.uid }
      throw e
    }
  }
  async function commitDocs(items) { // items: [{ref, data}]
    let batch = db.batch(), ops = 0
    for (const it of items) { batch.set(it.ref, it.data); if (++ops === 450) { await batch.commit(); batch = db.batch(); ops = 0 } }
    if (ops) await batch.commit()
  }

  // ── 1. Comptes de démo (Auth) ──
  console.log('\n🚀 Écriture...')
  const adminUid = await getOrCreateAuth('directeur@mojammaa.ma', 'Direction Démo')
  const teacherUid = await getOrCreateAuth('enseignant@mojammaa.ma', `${demoTeacherLocal.prenom} ${demoTeacherLocal.nom}`)
  const parentUid = await getOrCreateAuth('parent@mojammaa.ma', 'Parent Démo')
  demoTeacherLocal.uid = teacherUid
  demoTeacherLocal.email = 'enseignant@mojammaa.ma'

  // uids synthétiques pour les profs sans login (= localId, stable)
  staffList.forEach(t => { if (!t.uid) t.uid = 'demo-' + t.localId })

  // ── 2. users ──
  const userDocs = []
  userDocs.push({ ref: db.collection('users').doc(adminUid), data: { uid: adminUid, role: 'admin', nom: 'Direction', prenom: 'Démo', email: 'directeur@mojammaa.ma', updatedAt: TS() } })
  for (const t of staffList) {
    userDocs.push({ ref: db.collection('users').doc(t.uid), data: {
      uid: t.uid, role: 'professeur', cycle: t.cycle, nom: t.nom, prenom: t.prenom,
      email: t.email || null, matiere: t.matiere, classes: t.classes, updatedAt: TS(),
    } })
  }
  userDocs.push({ ref: db.collection('users').doc(parentUid), data: { uid: parentUid, role: 'parent', nom: 'Démo', prenom: 'Parent', email: 'parent@mojammaa.ma', children: [], updatedAt: TS() } })
  await commitDocs(userDocs)
  console.log(`   ✓ users           ${userDocs.length}`)

  // ── 3. eleves (2 enfants liés au parent démo) ──
  const child1 = students.find(s => s.classe === '4AEP-1')
  const child2 = students.find(s => s.classe === '1APIC-1')
  const linked = new Set([child1.codeMassar, child2.codeMassar])
  const eleveDocs = students.map(s => {
    const isLinked = linked.has(s.codeMassar)
    return { ref: db.collection('eleves').doc(s.codeMassar), data: {
      codeMassar: s.codeMassar, nom: s.nom, prenom: s.prenom, nomLatin: s.nomLatin, prenomLatin: s.prenomLatin,
      nomComplet: s.nomComplet, classe: s.classe, classes: [s.classe], niveau: s.niveau, cycle: s.cycle,
      dateNaissance: s.dateNaissance,
      parentNom: isLinked ? 'Parent Démo' : `Famille ${s.nomLatin}`,
      parentTel: s.parentTel, parentEmail: isLinked ? 'parent@mojammaa.ma' : null,
      parentUid: isLinked ? parentUid : null,
      demo: true, importedAt: TS(),
    } }
  })
  await commitDocs(eleveDocs)
  console.log(`   ✓ eleves          ${eleveDocs.length}  (2 liés au parent démo : ${child1.nomComplet} ${child1.classe}, ${child2.nomComplet} ${child2.classe})`)

  // ── 4. schedules + emploiDuTemps ──
  const schedDocs = []
  for (const [localId, slots] of slotsByTeacher.entries()) {
    const t = staffList.find(x => x.localId === localId)
    schedDocs.push({ ref: db.collection('schedules').doc(t.uid), data: { uid: t.uid, teacherUid: t.uid, weeklySlots: slots, updatedAt: TS() } })
  }
  await commitDocs(schedDocs)
  const edtDocs = edt.map(e => ({
    ref: db.collection('emploiDuTemps').doc(`${e.classe}__${e.day}__${e.startTime}`.replace(/[/#?]/g, '-')),
    data: {
      classeId: e.classe, day: e.day, startTime: e.startTime, endTime: e.endTime, durationMin: e.durationMin,
      matiere: e.matiere, salle: null, professeurNom: `${e.teacher.prenom} ${e.teacher.nom}`, teacherUid: e.teacher.uid, updatedAt: TS(),
    },
  }))
  await commitDocs(edtDocs)
  console.log(`   ✓ schedules ${schedDocs.length} · emploiDuTemps ${edtDocs.length}`)

  // ── 5. notes ──
  const noteDocs = notes.map(n => ({ ref: db.collection('notes').doc(n.id), data: {
    eleveId: n.eleveId, eleveNom: n.eleveNom, elevePrenom: n.elevePrenom, codeMassar: n.codeMassar,
    classe: n.classe, cycle: n.cycle, academicYear: n.academicYear, semestre: n.semestre, matiere: n.matiere, matiereLabel: n.matiereLabel,
    note: n.note, demo: true, importedBy: 'demo-seed', importedAt: TS(),
  } }))
  await commitDocs(noteDocs)
  console.log(`   ✓ notes           ${noteDocs.length}`)

  // ── 6. absences ──
  const absRows = buildAbsences(students, demoTeacherLocal)
  const absDocs = absRows.map(a => {
    const [s1, s2] = a.seance.split(' - ')
    const id = `${a.st.codeMassar}_${a.date}_${s1.replace(':', '')}_${s2.replace(':', '')}`
    return { ref: db.collection('absences').doc(id), data: {
      eleveId: a.st.codeMassar, eleveNom: a.st.nom, elevePrenom: a.st.prenom, classe: a.st.classe,
      date: a.date, seance: a.seance, statut: a.statut,
      ...periodForISO(a.date),
      professorId: teacherUid, professorNom: `${demoTeacherLocal.prenom} ${demoTeacherLocal.nom}`, createdAt: TS(),
    } }
  })
  await commitDocs(absDocs)
  console.log(`   ✓ absences        ${absDocs.length}`)

  // ── 7. comportements ──
  const compDocs = comps.map(c => ({ ref: db.collection('comportements').doc(), data: {
    eleveId: c.st.codeMassar, eleveNom: c.st.nom, elevePrenom: c.st.prenom, classe: c.st.classe,
    date: c.date, seance: c.seance, kind: c.kind, reason: c.reason,
    teacherId: c.teacher.uid, teacherNom: `${c.teacher.prenom} ${c.teacher.nom}`, createdAt: TS(),
  } }))
  await commitDocs(compDocs)
  console.log(`   ✓ comportements   ${compDocs.length}`)

  // ── 8. devoirs (à venir) ──
  const future = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10)
  // Devoirs du prof démo (Reda, maths collège) → UNIQUEMENT ses classes
  // (demoTeacherLocal.classes), avec des intitulés de maths cohérents. Avant,
  // le seed lui attribuait des devoirs de primaire (4AEP-1/5AEP-1) qu'il
  // n'enseigne pas → l'onglet « Devoirs » affichait des classes incohérentes.
  const devoirsSeed = [
    { titre: 'Exercices sur les fractions', description: 'Faire les exercices 1 à 8 page 72.', type: 'Exercices', classeId: '1APIC-1', d: 3 },
    { titre: 'Calcul littéral', description: 'Développer et réduire les expressions de la fiche distribuée.', type: 'Exercices', classeId: '1APIC-1', d: 2 },
    { titre: 'Problèmes de géométrie', description: 'Exercices 12 à 15 page 90.', type: 'Exercices', classeId: '1APIC-2', d: 4 },
    { titre: 'Révision contrôle — nombres relatifs', description: 'Réviser les chapitres 4 et 5 pour le contrôle.', type: 'Révision', classeId: '2APIC-1', d: 5 },
    { titre: 'Symétrie centrale', description: 'Terminer la construction commencée en classe.', type: 'Exercices', classeId: '2APIC-1', d: 2 },
    { titre: 'Théorème de Thalès', description: "Exercices d'application page 88.", type: 'Contrôle', classeId: '3APIC-1', d: 1 },
  ]
  // Garde-fou : n'émettre que des devoirs pour des classes réellement enseignées
  // par le prof démo (évite toute régression si la liste ci-dessus dérive).
  const teacherClasses = new Set(demoTeacherLocal.classes)
  const devoirDocs = devoirsSeed.filter(x => teacherClasses.has(x.classeId)).map(x => {
    const dateLimite = future(x.d)
    return { ref: db.collection('devoirs').doc(), data: {
      titre: x.titre, description: x.description, type: x.type, classeId: x.classeId,
      teacherId: teacherUid, teacherNom: `${demoTeacherLocal.prenom} ${demoTeacherLocal.nom}`,
      dateLimite, ...periodForISO(dateLimite), attachments: [], createdAt: TS(),
    } }
  })
  await commitDocs(devoirDocs)
  console.log(`   ✓ devoirs         ${devoirDocs.length}`)

  // ── 9. ressources ──
  const ressSeed = [
    { titre: 'Résumé du cours — chapitre 5', matiere: demoTeacherLocal.matiere, classeId: '1APIC-1' },
    { titre: 'Fiche d\'exercices supplémentaires', matiere: demoTeacherLocal.matiere, classeId: '2APIC-1' },
    { titre: 'Correction du dernier contrôle', matiere: demoTeacherLocal.matiere, classeId: '3APIC-1' },
  ]
  const ressDocs = ressSeed.map(x => ({ ref: db.collection('ressources').doc(), data: {
    titre: x.titre, matiere: x.matiere, classeId: x.classeId, attachments: [],
    teacherId: teacherUid, teacherNom: `${demoTeacherLocal.prenom} ${demoTeacherLocal.nom}`, viewedBy: [], ...CURRENT_PERIOD, createdAt: TS(),
  } }))
  await commitDocs(ressDocs)
  console.log(`   ✓ ressources      ${ressDocs.length}`)

  // ── 10. evenements ──
  const evSeed = [
    { titre: 'Réunion parents-professeurs', type: 'reunion', dateDebut: future(7), dateFin: future(7) },
    { titre: 'Sortie pédagogique', type: 'sortie', dateDebut: future(14), dateFin: future(14) },
    { titre: 'Conseil de classe', type: 'reunion', dateDebut: future(4), dateFin: future(4) },
    { titre: 'Vacances d\'été', type: 'vacances', dateDebut: '2026-07-05', dateFin: '2026-09-06' },
    { titre: 'Fête de fin d\'année', type: 'evenement', dateDebut: future(20), dateFin: future(20) },
    { titre: 'Journée portes ouvertes', type: 'evenement', dateDebut: future(10), dateFin: future(10) },
  ]
  const evDocs = evSeed.map(x => ({ ref: db.collection('evenements').doc(), data: { ...x, createdAt: TS() } }))
  await commitDocs(evDocs)
  console.log(`   ✓ evenements      ${evDocs.length}`)

  // ── 11. messages (annonces) ──
  const msgSeed = [
    { toType: 'all', subject: 'Bienvenue sur Mojammaa Connect', body: 'Chers parents et enseignants, bienvenue sur notre nouvelle application de suivi scolaire.', fromId: adminUid, fromNom: 'Direction Démo', fromRole: 'admin' },
    { toType: 'parents', subject: 'Réunion parents-professeurs', body: 'Une réunion est prévue la semaine prochaine. Détails dans l\'agenda.', fromId: adminUid, fromNom: 'Direction Démo', fromRole: 'admin' },
    { toType: 'parents', subject: 'Bulletins du semestre', body: 'Les notes du semestre sont désormais consultables dans l\'application.', fromId: adminUid, fromNom: 'Direction Démo', fromRole: 'admin' },
    { toType: 'teachers', subject: 'Saisie des notes', body: 'Merci de finaliser la saisie des notes avant la fin de la semaine.', fromId: adminUid, fromNom: 'Direction Démo', fromRole: 'admin' },
    { toType: 'user', toIds: [parentUid], toLabel: '4AEP-1', classe: '4AEP-1', subject: 'Devoir à rendre', body: 'Votre enfant a un devoir à rendre cette semaine. Merci de votre suivi.', fromId: teacherUid, fromNom: `${demoTeacherLocal.prenom} ${demoTeacherLocal.nom}`, fromRole: 'professeur' },
  ]
  const msgDocs = msgSeed.map(m => ({ ref: db.collection('messages').doc(), data: {
    type: 'announcement', category: 'announcement', priority: 'normal', status: 'sent',
    toType: m.toType, toIds: m.toIds || [], toLabel: m.toLabel || null, classe: m.classe || null,
    subject: m.subject, body: m.body, fromId: m.fromId, fromNom: m.fromNom, fromRole: m.fromRole,
    readBy: [], deletedBy: [], ...CURRENT_PERIOD, createdAt: TS(),
  } }))
  await commitDocs(msgDocs)
  console.log(`   ✓ messages        ${msgDocs.length}`)

  // ── 12. directory/staff ──
  await db.collection('directory').doc('staff').set({
    teachers: staffList.filter(t => t.subjectKey !== 'presco').map(t => ({ uid: t.uid, nom: t.nom, prenom: t.prenom, matiere: t.matiere, classes: t.classes })),
    admins: [{ uid: adminUid, nom: 'Direction', prenom: 'Démo' }],
    updatedAt: TS(),
  })
  console.log('   ✓ directory/staff')

  // ── 13. Agrégats classStats + stats/summary ──
  console.log('\n📊 Recalcul des agrégats...')
  const { computeClassStats, statsDocId } = require('../../functions/classStats')
  const { computeSchoolStats } = require('../../functions/schoolStats')
  const groups = new Map()
  for (const n of notes) {
    const k = `${n.academicYear}|${n.classe}|${n.semestre}`
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k).push({ note: n.note, matiereLabel: n.matiereLabel, matiere: n.matiere, eleveId: n.eleveId })
  }
  const csDocs = []
  for (const [k, arr] of groups.entries()) {
    const [academicYear, classe, semestre] = k.split('|')
    csDocs.push({ ref: db.collection('classStats').doc(statsDocId(academicYear, classe, semestre)), data: { academicYear, classe, semestre, ...computeClassStats(arr), updatedAt: TS() } })
  }
  await commitDocs(csDocs)
  console.log(`   ✓ classStats      ${csDocs.length}`)

  const [elS, usS, noS, abS, deS] = await Promise.all([
    db.collection('eleves').get(), db.collection('users').get(), db.collection('notes').get(),
    db.collection('absences').get(), db.collection('devoirs').get(),
  ])
  const rows = s => s.docs.map(d => ({ id: d.id, ...d.data() }))
  const summary = computeSchoolStats({ eleves: rows(elS), users: rows(usS), notes: rows(noS), absences: rows(abS), devoirs: rows(deS) })
  await db.collection('stats').doc('summary').set({ ...summary, updatedAt: new Date() })
  console.log('   ✓ stats/summary')

  console.log('\n✅ Seed démo terminé.')
  console.log('\n🔑 COMPTES DÉMO (à remettre à l\'école) — mot de passe : ' + DEMO_PASSWORD)
  console.log('   • Directeur  : directeur@mojammaa.ma')
  console.log('   • Enseignant : enseignant@mojammaa.ma')
  console.log('   • Parent     : parent@mojammaa.ma')
  process.exit(0)
}

main().catch(e => { console.error('❌', e); process.exit(1) })
