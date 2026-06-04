/**
 * Importe Enseignants + Élèves + Parents depuis le modèle Excel
 * (mojammaa_import_template.xlsx — 4 feuilles).
 *
 * Ordre d'écriture : Élèves → Parents (qui s'y rattachent) → Enseignants.
 *
 * Usage :
 *   node scripts/importFromTemplate.js [fichier.xlsx]            # DRY-RUN (aperçu, aucune écriture)
 *   node scripts/importFromTemplate.js [fichier.xlsx] --commit   # écrit dans Firestore + crée les comptes Auth
 *
 * Règles du modèle :
 *   • Ligne 1 = en-têtes (ne pas modifier).
 *   • Lignes "EXEMPLE..." ignorées automatiquement.
 *   • Colonnes multiples (classes / enfants_codeMassar) : séparées par virgule.
 *   • password vide  → "<email>1234".
 *   • dateNaissance  : AAAA-MM-JJ.
 */

const path = require('path')
const fs   = require('fs')
const XLSX = require('xlsx')

const COMMIT  = process.argv.includes('--commit')
const fileArg = process.argv.slice(2).find(a => !a.startsWith('--'))
const FILE    = fileArg
  ? path.resolve(fileArg)
  : path.join(__dirname, '..', 'mojammaa_import_template.xlsx')

const splitList = v => String(v || '').split(',').map(s => s.trim()).filter(Boolean)
const clean     = v => String(v == null ? '' : v).trim()
const isExample = row => Object.values(row).some(v => /^EXEMPLE/i.test(clean(v)))
const isEmpty   = row => Object.values(row).every(v => clean(v) === '')

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
    password: clean(r.password) || (clean(r.email) + '1234'),
    nom: clean(r.nom),
    prenom: clean(r.prenom),
    children: splitList(r.enfants_codeMassar),
  }))

  const teachers = readSheet(wb, 'Enseignants').map(r => ({
    email: clean(r.email),
    password: clean(r.password) || (clean(r.email) + '1234'),
    nom: clean(r.nom),
    prenom: clean(r.prenom),
    matiere: clean(r.matiere),
    cycle: clean(r.cycle) || 'college',
    classes: splitList(r.classes),
  }))

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

  // ── Aperçu ─────────────────────────────────────────────────────────
  console.log(`📋 À importer :`)
  console.log(`   Élèves      : ${eleves.length}`)
  console.log(`   Parents     : ${parents.length}`)
  console.log(`   Enseignants : ${teachers.length}\n`)

  eleves.slice(0, 3).forEach(e => console.log(`   • élève  ${e.codeMassar}  ${e.nomComplet}  (${e.classe})`))
  parents.slice(0, 3).forEach(p => console.log(`   • parent ${p.email}  → enfants: ${p.children.join(', ') || '(aucun)'}`))
  teachers.slice(0, 3).forEach(t => console.log(`   • prof   ${t.email}  ${t.matiere}  → ${t.classes.join(', ') || '(aucune classe)'}`))

  if (errors.length) {
    console.log(`\n⚠️  ${errors.length} avertissement(s) :`)
    errors.forEach(e => console.log('   - ' + e))
  }

  if (!COMMIT) {
    console.log('\n💡 DRY-RUN terminé — aucune écriture. Relance avec --commit pour appliquer.')
    return Promise.resolve()
  }

  return commit({ eleves, parents, teachers })
}

async function commit({ eleves, parents, teachers }) {
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

main().catch(err => { console.error('❌ Erreur :', err); process.exit(1) })
