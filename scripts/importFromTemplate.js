/**
 * Importe Enseignants + Élèves + Parents depuis le modèle Excel
 * (mojammaa_import_template.xlsx — 5 feuilles).
 *
 * Ordre d'écriture : Élèves → Parents (qui s'y rattachent) → Enseignants
 * → EmploiDuTemps (qui se rattache aux enseignants par email).
 *
 * Usage :
 *   node scripts/importFromTemplate.js [fichier.xlsx]            # DRY-RUN (aperçu, aucune écriture)
 *   node scripts/importFromTemplate.js [fichier.xlsx] --commit   # écrit dans Firestore + crée les comptes Auth
 *
 * Règles du modèle :
 *   • Ligne 1 = en-têtes (ne pas modifier).
 *   • Lignes "EXEMPLE..." ignorées automatiquement.
 *   • Colonnes multiples (classes / enfants_codeMassar) : séparées par virgule.
 *   • password vide → mot de passe ALÉATOIRE fort (imprimé une fois en fin
 *     d'import ; le compte le réinitialise au 1er accès). Plus jamais "<email>1234".
 *   • dateNaissance : AAAA-MM-JJ.
 *   • EmploiDuTemps : day accepte monday..saturday ou lundi..samedi.
 */

const path = require('path')
const fs   = require('fs')
const XLSX = require('xlsx')
const { randomPassword } = require('./lib/password')

const COMMIT  = process.argv.includes('--commit')
const fileArg = process.argv.slice(2).find(a => !a.startsWith('--'))
const FILE    = fileArg
  ? path.resolve(fileArg)
  : path.join(__dirname, '..', 'mojammaa_import_template.xlsx')

const splitList = v => String(v || '').split(',').map(s => s.trim()).filter(Boolean)
const clean     = v => String(v == null ? '' : v).trim()
const isExample = row => Object.values(row).some(v => /^EXEMPLE/i.test(clean(v)))
const isEmpty   = row => Object.values(row).every(v => clean(v) === '')

const DAY_ALIASES = {
  sunday: 'sunday', dimanche: 'sunday', dim: 'sunday',
  monday: 'monday', lundi: 'monday', lun: 'monday',
  tuesday: 'tuesday', mardi: 'tuesday', mar: 'tuesday',
  wednesday: 'wednesday', mercredi: 'wednesday', mer: 'wednesday',
  thursday: 'thursday', jeudi: 'thursday', jeu: 'thursday',
  friday: 'friday', vendredi: 'friday', ven: 'friday',
  saturday: 'saturday', samedi: 'saturday', sam: 'saturday',
}

function normalizeKey(v) {
  return clean(v)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function normalizeDay(v) {
  return DAY_ALIASES[normalizeKey(v)] || ''
}

function normalizeTime(v) {
  if (v == null || v === '') return ''
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return `${String(v.getHours()).padStart(2, '0')}:${String(v.getMinutes()).padStart(2, '0')}`
  }
  if (typeof v === 'number' && Number.isFinite(v)) {
    if (v >= 0 && v < 1) {
      const total = Math.round(v * 24 * 60)
      return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
    }
    const s = String(v).padStart(4, '0')
    return `${s.slice(0, -2).padStart(2, '0')}:${s.slice(-2)}`
  }
  const raw = clean(v).toLowerCase().replace(/[h.]/g, ':')
  const compact = raw.match(/^(\d{1,2})(\d{2})$/)
  if (compact) return `${compact[1].padStart(2, '0')}:${compact[2]}`
  const m = raw.match(/^(\d{1,2})(?::(\d{1,2}))?$/)
  if (!m) return ''
  const h = Number(m[1])
  const min = Number(m[2] || 0)
  if (h < 0 || h > 23 || min < 0 || min > 59) return ''
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

function minutesOf(hm) {
  const m = String(hm || '').match(/^(\d{2}):(\d{2})$/)
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

function durationMin(v, startTime, endTime) {
  const explicit = Number(clean(v))
  if (Number.isFinite(explicit) && explicit > 0) return explicit
  const start = minutesOf(startTime)
  const end = minutesOf(endTime)
  if (start == null || end == null || end <= start) return null
  return end - start
}

function compactObject(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && v !== ''))
}

function slotId(classe, day, startTime) {
  return `${classe}__${day}__${startTime}`.replace(/[/#?]/g, '-')
}

function slotSortKey(slot) {
  const order = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  return `${String(order.indexOf(slot.day)).padStart(2, '0')}|${slot.startTime}|${slot.classe}`
}

function niveauFromClasse(classe) {
  const m = String(classe).match(/^(\d+APIC|\d+ASC|\d+TC)/i)
  return m ? m[1].toUpperCase() : String(classe)
}

function readSheet(wb, name) {
  const ws = wb.Sheets[name]
  if (!ws) { console.warn(`⚠️  Feuille "${name}" absente — ignorée.`); return [] }
  return XLSX.utils.sheet_to_json(ws, { defval: '' })
    .filter(r => !isEmpty(r) && !isExample(r))
}

function main() {
  if (!fs.existsSync(FILE)) {
    console.error(`❌ Fichier introuvable : ${FILE}`)
    process.exit(1)
  }
  const wb = XLSX.readFile(FILE)
  console.log(`📂 Lecture : ${path.basename(FILE)}`)
  console.log(`   Feuilles : ${wb.SheetNames.join(', ')}\n`)

  // ── Parse ──────────────────────────────────────────────────────────
  const eleves = readSheet(wb, 'Eleves').map(r => {
    const nom = clean(r.nom), prenom = clean(r.prenom), classe = clean(r.classe)
    return {
      codeMassar: clean(r.codeMassar),
      nom, prenom,
      nomLatin: clean(r.nomLatin),
      prenomLatin: clean(r.prenomLatin),
      nomComplet: [nom, prenom].filter(Boolean).join(' '),
      classe,
      niveau: clean(r.niveau) || niveauFromClasse(classe),
      dateNaissance: clean(r.dateNaissance),
    }
  })

  const parents = readSheet(wb, 'Parents').map(r => ({
    email: clean(r.email),
    password: clean(r.password) || randomPassword(),
    nom: clean(r.nom),
    prenom: clean(r.prenom),
    children: splitList(r.enfants_codeMassar),
  }))

  const teachers = readSheet(wb, 'Enseignants').map(r => ({
    email: clean(r.email),
    password: clean(r.password) || randomPassword(),
    nom: clean(r.nom),
    prenom: clean(r.prenom),
    matiere: clean(r.matiere),
    cycle: clean(r.cycle) || 'college',
    classes: splitList(r.classes),
  }))

  const schedules = readSheet(wb, 'EmploiDuTemps').map(r => {
    const startTime = normalizeTime(r.startTime)
    const endTime = normalizeTime(r.endTime)
    return {
      teacherEmail: clean(r.teacherEmail),
      dayRaw: clean(r.day),
      day: normalizeDay(r.day),
      startTime,
      endTime,
      durationMin: durationMin(r.durationMin, startTime, endTime),
      classe: clean(r.classe),
      seance: clean(r.seance).toUpperCase(),
      room: clean(r.room || r.salle),
      subject: clean(r.subject || r.matiere),
    }
  })

  // ── Validation ─────────────────────────────────────────────────────
  const errors = []
  const codes = new Set(eleves.map(e => e.codeMassar))
  eleves.forEach((e, i) => { if (!e.codeMassar) errors.push(`Eleves ligne ${i + 2}: codeMassar manquant`) })
  teachers.forEach((t, i) => { if (!t.email) errors.push(`Enseignants ligne ${i + 2}: email manquant`) })
  parents.forEach((p, i) => {
    if (!p.email) errors.push(`Parents ligne ${i + 2}: email manquant`)
    p.children.forEach(c => {
      if (!codes.has(c)) errors.push(`Parents (${p.email}): enfant "${c}" absent de la feuille Eleves (sera vérifié aussi dans la base)`)
    })
  })
  schedules.forEach((s, i) => {
    const row = `EmploiDuTemps ligne ${i + 2}`
    if (!s.teacherEmail) errors.push(`${row}: teacherEmail manquant`)
    if (!s.day) errors.push(`${row}: day invalide "${s.dayRaw}"`)
    if (!s.startTime) errors.push(`${row}: startTime invalide`)
    if (!s.endTime) errors.push(`${row}: endTime invalide`)
    if (!s.classe) errors.push(`${row}: classe manquante`)
    if (s.durationMin == null) errors.push(`${row}: durationMin manquant ou impossible à déduire`)
  })

  // ── Aperçu ─────────────────────────────────────────────────────────
  console.log(`📋 À importer :`)
  console.log(`   Élèves      : ${eleves.length}`)
  console.log(`   Parents     : ${parents.length}`)
  console.log(`   Enseignants : ${teachers.length}`)
  console.log(`   EDT         : ${schedules.length} créneau(x)\n`)

  eleves.slice(0, 3).forEach(e => console.log(`   • élève  ${e.codeMassar}  ${e.nomComplet}  (${e.classe})`))
  parents.slice(0, 3).forEach(p => console.log(`   • parent ${p.email}  → enfants: ${p.children.join(', ') || '(aucun)'}`))
  teachers.slice(0, 3).forEach(t => console.log(`   • prof   ${t.email}  ${t.matiere}  → ${t.classes.join(', ') || '(aucune classe)'}`))
  schedules.slice(0, 3).forEach(s => console.log(`   • EDT    ${s.teacherEmail}  ${s.day} ${s.startTime}-${s.endTime}  ${s.classe}${s.seance ? ` (${s.seance})` : ''}`))

  if (errors.length) {
    console.log(`\n⚠️  ${errors.length} avertissement(s) :`)
    errors.forEach(e => console.log('   - ' + e))
  }

  if (!COMMIT) {
    console.log('\n💡 DRY-RUN terminé — aucune écriture. Relance avec --commit pour appliquer.')
    return Promise.resolve()
  }

  return commit({ eleves, parents, teachers, schedules })
}

async function commit({ eleves, parents, teachers, schedules }) {
  const keyPath = path.join(__dirname, '..', '.secrets', 'firebase-admin.json')
  if (!fs.existsSync(keyPath)) { console.error('❌ Clé Firebase Admin introuvable'); process.exit(1) }
  const admin = require('firebase-admin')
  admin.initializeApp({ credential: admin.credential.cert(require(keyPath)) })
  const auth = admin.auth()
  const db   = admin.firestore()
  const TS   = () => admin.firestore.FieldValue.serverTimestamp()

  // ── 1. Élèves ──────────────────────────────────────────────────────
  if (eleves.length) {
    console.log(`\n🚀 Écriture de ${eleves.length} élève(s)...`)
    const batch = db.batch()
    eleves.forEach(e => {
      batch.set(db.collection('eleves').doc(e.codeMassar), {
        codeMassar: e.codeMassar, nom: e.nom, prenom: e.prenom,
        nomLatin: e.nomLatin, prenomLatin: e.prenomLatin, nomComplet: e.nomComplet,
        classe: e.classe, classes: [e.classe], niveau: e.niveau,
        dateNaissance: e.dateNaissance, updatedAt: TS(),
      }, { merge: true })
    })
    await batch.commit()
    console.log(`   ✓ ${eleves.length} élève(s) écrit(s)`)
  }

  // ── helper : trouver ou créer un compte Auth ───────────────────────
  async function ensureUser(email, password, nom, prenom) {
    try {
      const u = await auth.getUserByEmail(email)
      return { user: u, created: false }
    } catch (err) {
      if (err.code !== 'auth/user-not-found') throw err
      const u = await auth.createUser({
        email, password,
        displayName: [prenom, nom].filter(Boolean).join(' ') || undefined,
        emailVerified: true,
      })
      return { user: u, created: true }
    }
  }

  const creds = []

  // ── 2. Parents ─────────────────────────────────────────────────────
  for (const p of parents) {
    const { user, created } = await ensureUser(p.email, p.password, p.nom, p.prenom)
    // vérifier que les enfants existent en base
    const validChildren = []
    for (const code of p.children) {
      const snap = await db.collection('eleves').doc(code).get()
      if (snap.exists) validChildren.push(code)
      else console.warn(`   ⚠️ parent ${p.email}: enfant ${code} introuvable en base — ignoré`)
    }
    await db.collection('users').doc(user.uid).set({
      uid: user.uid, email: user.email, role: 'parent',
      nom: p.nom, prenom: p.prenom, children: validChildren, updatedAt: TS(),
    }, { merge: true })
    const parentNom = [p.prenom, p.nom].filter(Boolean).join(' ')
    const cb = db.batch()
    validChildren.forEach(code => {
      const up = { parentUid: user.uid, parentEmail: user.email || p.email, updatedAt: TS() }
      if (parentNom) up.parentNom = parentNom
      cb.set(db.collection('eleves').doc(code), up, { merge: true })
    })
    if (validChildren.length) await cb.commit()
    console.log(`   ✓ parent ${p.email} (${validChildren.length} enfant(s))`)
    if (created) creds.push({ role: 'parent', email: p.email, password: p.password })
  }

  // ── 3. Enseignants ─────────────────────────────────────────────────
  for (const t of teachers) {
    const { user, created } = await ensureUser(t.email, t.password, t.nom, t.prenom)
    await db.collection('users').doc(user.uid).set({
      uid: user.uid, email: user.email, role: 'professeur',
      nom: t.nom, prenom: t.prenom, matiere: t.matiere,
      cycle: t.cycle, classes: t.classes, updatedAt: TS(),
    }, { merge: true })
    console.log(`   ✓ prof ${t.email} → ${t.classes.join(', ') || '(aucune classe)'}`)
    if (created) creds.push({ role: 'professeur', email: t.email, password: t.password })
  }

  // ── 4. Emploi du temps ──────────────────────────────────────────────
  const validSchedules = schedules.filter(s =>
    s.teacherEmail && s.day && s.startTime && s.endTime && s.durationMin && s.classe
  )
  if (validSchedules.length) {
    console.log(`\n📅 Écriture de ${validSchedules.length} créneau(x) EDT...`)
    const byTeacher = new Map()
    validSchedules.forEach(s => {
      const rows = byTeacher.get(s.teacherEmail) || []
      rows.push(s)
      byTeacher.set(s.teacherEmail, rows)
    })

    for (const [email, rows] of byTeacher.entries()) {
      let user
      try {
        user = await auth.getUserByEmail(email)
      } catch (err) {
        console.warn(`   ⚠️ EDT ignoré pour ${email}: compte Auth introuvable`)
        continue
      }

      const weeklySlots = rows
        .map(s => compactObject({
          day: s.day,
          startTime: s.startTime,
          endTime: s.endTime,
          durationMin: s.durationMin,
          classe: s.classe,
          seance: s.seance,
          room: s.room,
          subject: s.subject,
        }))
        .sort((a, b) => slotSortKey(a).localeCompare(slotSortKey(b)))

      await db.collection('schedules').doc(user.uid).set({
        uid: user.uid,
        teacherUid: user.uid,
        weeklySlots,
        updatedAt: TS(),
      })
      console.log(`   ✓ EDT ${email} → ${weeklySlots.length} créneau(x)`)
    }

    await rebuildEmploiDuTemps(db, admin)
  }

  // ── Récap identifiants des comptes CRÉÉS ───────────────────────────
  if (creds.length) {
    console.log('\n🔑 NOUVEAUX COMPTES CRÉÉS (identifiants — à noter) :')
    creds.forEach(c => console.log(`   [${c.role}] ${c.email}  |  ${c.password}`))
  } else {
    console.log('\n(ℹ️ aucun nouveau compte Auth créé — tous existaient déjà)')
  }

  console.log('\n✅ Import terminé.')
  process.exit(0)
}

async function rebuildEmploiDuTemps(db, admin) {
  const schedSnap = await db.collection('schedules').get()
  const teacherCache = new Map()

  async function teacherInfo(uid) {
    if (teacherCache.has(uid)) return teacherCache.get(uid)
    const u = await db.collection('users').doc(uid).get()
    const d = u.exists ? u.data() : {}
    const info = {
      matiere: d.matiere || null,
      professeurNom: `${d.prenom || ''} ${d.nom || ''}`.trim() || null,
    }
    teacherCache.set(uid, info)
    return info
  }

  const docs = []
  for (const sched of schedSnap.docs) {
    const data = sched.data()
    const teacherUid = data.teacherUid || sched.id
    const info = await teacherInfo(teacherUid)
    for (const s of data.weeklySlots || []) {
      if (!s.classe || !s.day || !s.startTime) continue
      docs.push({
        id: slotId(s.classe, s.day, s.startTime),
        body: compactObject({
          classeId: s.classe,
          day: s.day,
          startTime: s.startTime,
          endTime: s.endTime || null,
          durationMin: s.durationMin || null,
          seance: s.seance || null,
          matiere: s.subject || info.matiere || null,
          salle: s.room || null,
          professeurNom: info.professeurNom,
          teacherUid,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }),
      })
    }
  }

  const existing = await db.collection('emploiDuTemps').get()
  let batch = db.batch()
  let ops = 0
  for (const old of existing.docs) {
    batch.delete(old.ref)
    if (++ops === 450) { await batch.commit(); batch = db.batch(); ops = 0 }
  }
  for (const d of docs) {
    batch.set(db.collection('emploiDuTemps').doc(d.id), d.body)
    if (++ops === 450) { await batch.commit(); batch = db.batch(); ops = 0 }
  }
  if (ops > 0) await batch.commit()
  console.log(`   ✓ emploiDuTemps reconstruit (${docs.length} créneau(x))`)
}

main().catch(err => { console.error('❌ Erreur :', err); process.exit(1) })
