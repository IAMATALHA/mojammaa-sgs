/**
 * Lien élève → compte parent supprimé : la décision (planOrphanUnlink, pure)
 * et le déroulé (runUnlinkOrphanParent, base et Auth injectées), tous deux
 * rejoués en test sans la production (tests/scripts/orphanParent.test.mjs).
 *
 * Le rattachement d'un enfant écrit `parentUid`, `parentNom` et les
 * coordonnées du compte sur la fiche de l'élève. Supprimer le compte (page
 * Comptes du site, console Firebase) n'y touche pas : l'élève reste « déjà
 * lié » à un compte qui n'existe plus, et aucun nouveau code ne peut être créé.
 */

/** Chiffres seuls, numéro marocain ramené à 212… : 06 12 34 56 78 = +212 6 12 34 56 78. */
function phoneDigits(value) {
  const digits = String(value || '').replace(/\D/g, '')
  if (!digits) return ''
  if (digits.startsWith('00')) return digits.slice(2)
  if (digits.startsWith('0')) return `212${digits.slice(1)}`
  return digits
}

const sameEmail = (a, b) => Boolean(a) && Boolean(b) && String(a).trim().toLowerCase() === String(b).trim().toLowerCase()
const samePhone = (a, b) => phoneDigits(a) !== '' && phoneDigits(a) === phoneDigits(b)

/**
 * @param {object} input
 * @param {object|null} input.student          Fiche de l'élève (null si absente).
 * @param {boolean} input.profileExists        Le profil `users/{parentUid}` existe encore.
 * @param {object|null} input.login            Identifiant Auth restant : { email, phoneNumber, customClaims }.
 * @param {number} input.otherLinkedCount      Autres élèves encore liés au même compte.
 * @param {object} [input.options]             { clearContact, keepContact, keepLogin }.
 */
function planOrphanUnlink({ student, profileExists, login = null, otherLinkedCount = 0, options = {} }) {
  if (!student) return { ok: false, refusal: 'Élève introuvable.' }
  if (!student.parentUid) return { ok: false, refusal: 'Cet élève n’est lié à aucun compte parent : rien à faire.' }
  if (profileExists) {
    return {
      ok: false,
      refusal: 'Le compte parent existe encore. Ce script ne détache que les liens vers un compte supprimé.',
    }
  }
  if (options.clearContact && options.keepContact) {
    return { ok: false, refusal: 'Choisir --clear-contact ou --keep-contact, pas les deux.' }
  }

  const clearFields = ['parentUid', 'parentNom']
  const keptContact = {}
  // Une coordonnée n'est retirée d'office que si elle est PROUVÉE être celle du
  // compte supprimé (même e-mail ou même numéro que son identifiant). Sinon
  // elle peut venir de l'établissement : on la garde, sauf demande explicite.
  const contact = [
    ['parentTel', value => samePhone(value, login?.phoneNumber)],
    ['parentEmail', value => sameEmail(value, login?.email)],
  ]
  for (const [field, belongsToLogin] of contact) {
    const value = student[field]
    if (!value) continue
    const clear = options.clearContact || (!options.keepContact && belongsToLogin(value))
    if (clear) clearFields.push(field)
    else keptContact[field] = value
  }

  let deleteLogin = false
  let loginKeptReason = ''
  if (!login) loginKeptReason = 'aucun identifiant de connexion ne reste'
  else if (options.keepLogin) loginKeptReason = 'demandé (--keep-login)'
  else if (otherLinkedCount > 0) loginKeptReason = `${otherLinkedCount} autre(s) élève(s) encore lié(s) à ce compte`
  else if (Object.keys(login.customClaims || {}).length > 0) loginKeptReason = 'ce compte porte des droits particuliers (claims) : à traiter à la main'
  else deleteLogin = true

  return { ok: true, clearFields, keptContact, deleteLogin, loginKeptReason }
}

function studentName(data) {
  return data.nomComplet || [data.prenom, data.nom].filter(Boolean).join(' ') || '(sans nom)'
}

async function loginFor(auth, uid) {
  try {
    const user = await auth.getUser(uid)
    return {
      uid: user.uid,
      email: user.email || '',
      phoneNumber: user.phoneNumber || '',
      disabled: user.disabled,
      customClaims: user.customClaims || {},
      createdAt: user.metadata?.creationTime || '',
      lastSignInAt: user.metadata?.lastSignInTime || '',
    }
  } catch (error) {
    if (error.code === 'auth/user-not-found') return null
    throw error
  }
}

async function listOrphans({ db, auth, out }) {
  const linked = await db.collection('eleves').where('parentUid', '>', '')
    .select('parentUid', 'parentNom', 'nom', 'prenom', 'nomComplet', 'classe').get()
  const uids = [...new Set(linked.docs.map(doc => doc.get('parentUid')))]
  const missing = new Set()
  for (let i = 0; i < uids.length; i += 100) {
    const profiles = await db.getAll(...uids.slice(i, i + 100).map(uid => db.doc(`users/${uid}`)))
    profiles.forEach(profile => { if (!profile.exists) missing.add(profile.id) })
  }
  const orphans = linked.docs.filter(doc => missing.has(doc.get('parentUid')))
  out.log(`🔍 ${linked.size} élève(s) lié(s) à un compte parent, ${uids.length} compte(s) distinct(s).`)
  out.log(`   Lectures Firestore : ${linked.size + uids.length} (quota gratuit : 50 000 par jour).\n`)
  if (orphans.length === 0) {
    out.log('✅ Aucun élève lié à un compte supprimé.')
    return
  }
  out.log(`⚠️  ${orphans.length} élève(s) lié(s) à un compte qui n'existe plus :\n`)
  for (const doc of orphans) {
    const data = doc.data()
    const login = await loginFor(auth, data.parentUid)
    out.log(`   ${doc.id}  ${studentName(data)} · ${data.classe || '?'}`)
    out.log(`      compte supprimé : ${data.parentNom || '(sans nom)'} — identifiant de connexion ${login ? 'encore présent' : 'déjà supprimé'}`)
    out.log(`      détail : node scripts/unlinkOrphanParent.js ${doc.id}\n`)
  }
}

const KNOWN_FLAGS = ['--commit', '--clear-contact', '--keep-contact', '--keep-login']

/**
 * Déroulé complet, dépendances injectées (base, Auth, sortie, copie locale)
 * pour être rejoué en test sans toucher à la production. Rend 0 ou 1.
 */
async function runUnlinkOrphanParent({ db, auth, FieldValue, args, out = console, saveBackup }) {
  const flags = new Set(args.filter(arg => arg.startsWith('--')))
  const [studentId] = args.filter(arg => !arg.startsWith('--'))
  const unknown = [...flags].filter(flag => !KNOWN_FLAGS.includes(flag))
  if (unknown.length) {
    out.error(`❌ Option inconnue : ${unknown.join(', ')}`)
    return 1
  }
  const commit = flags.has('--commit')
  const options = {
    clearContact: flags.has('--clear-contact'),
    keepContact: flags.has('--keep-contact'),
    keepLogin: flags.has('--keep-login'),
  }

  if (!studentId) {
    if (commit) {
      out.error('❌ --commit demande l’identifiant d’UN élève.')
      return 1
    }
    await listOrphans({ db, auth, out })
    return 0
  }

  // ── 1. État actuel ──────────────────────────────────────────
  const studentRef = db.doc(`eleves/${studentId}`)
  const snap = await studentRef.get()
  const student = snap.exists ? snap.data() : null
  const parentUid = student?.parentUid || ''
  const profileExists = parentUid ? (await db.doc(`users/${parentUid}`).get()).exists : false
  const login = parentUid ? await loginFor(auth, parentUid) : null
  const others = parentUid
    ? (await db.collection('eleves').where('parentUid', '==', parentUid).select('classe').get()).docs.filter(doc => doc.id !== studentId)
    : []
  const plan = planOrphanUnlink({ student, profileExists, login, otherLinkedCount: others.length, options })

  if (student) {
    out.log(`👤 Élève : ${studentId} — ${studentName(student)} · ${student.classe || '?'}`)
    out.log(`   lié au compte : ${parentUid || '(aucun)'}${student.parentNom ? ` (${student.parentNom})` : ''}`)
    out.log(`   profil du compte : ${profileExists ? 'EXISTE' : 'supprimé'}`)
    out.log(`   identifiant de connexion : ${login
      ? `présent — ${login.email || 'sans e-mail'} / ${login.phoneNumber || 'sans téléphone'}, dernière connexion ${login.lastSignInAt || 'jamais'}`
      : 'absent'}`)
    out.log(`   coordonnées sur la fiche : téléphone ${student.parentTel || '(vide)'}, e-mail ${student.parentEmail || '(vide)'}`)
    if (others.length) out.log(`   autres élèves liés au même compte : ${others.map(doc => doc.id).join(', ')}`)
  }
  if (!plan.ok) {
    out.error(`\n❌ ${plan.refusal}`)
    return 1
  }

  out.log('\n📋 Ce qui sera fait :')
  out.log(`   • fiche de l'élève : retirer ${plan.clearFields.join(', ')}`)
  for (const [field, value] of Object.entries(plan.keptContact)) {
    out.log(`   • ${field} gardé (${value}) — ajouter --clear-contact si c'est une coordonnée de test`)
  }
  out.log(plan.deleteLogin
    ? '   • identifiant de connexion restant : supprimé (e-mail et numéro libérés)'
    : `   • identifiant de connexion : laissé tel quel — ${plan.loginKeptReason}`)
  out.log('   • droits du tuteur et annuaire des parents : recalculés par le serveur après l’écriture')

  if (!commit) {
    const extra = [...flags].join(' ')
    out.log('\n🟡 Rien n’a été écrit. Pour appliquer :')
    out.log(`   node scripts/unlinkOrphanParent.js ${studentId} --commit${extra ? ` ${extra}` : ''}`)
    return 0
  }

  // ── 2. Copie locale des champs retirés (jamais commitée) ────
  const removed = Object.fromEntries(plan.clearFields.map(field => [field, student[field] ?? null]))
  const backup = saveBackup(studentId, { studentId, removed, login })
  out.log(`\n💾 Copie des champs retirés : ${backup}`)

  // ── 3. Écriture, seulement si rien n'a changé entre-temps ───
  try {
    await db.runTransaction(async tx => {
      const [fresh, profile] = await Promise.all([tx.get(studentRef), tx.get(db.doc(`users/${parentUid}`))])
      if (!fresh.exists || fresh.get('parentUid') !== parentUid) {
        throw new Error('La fiche a changé depuis la lecture : relancer sans --commit.')
      }
      if (profile.exists) throw new Error('Le compte parent existe de nouveau.')
      tx.update(studentRef, {
        ...Object.fromEntries(plan.clearFields.map(field => [field, FieldValue.delete()])),
        updatedAt: FieldValue.serverTimestamp(),
      })
    })
  } catch (error) {
    out.error(`❌ Rien n’a été écrit : ${error.message}`)
    return 1
  }
  out.log('✅ Fiche de l’élève : lien retiré.')

  let loginLeft = false
  if (plan.deleteLogin) {
    try {
      await auth.deleteUser(parentUid)
      out.log('✅ Identifiant de connexion supprimé.')
    } catch (error) {
      // La fiche ne porte plus l'identifiant du compte : le donner ici pour finir à la main.
      loginLeft = true
      out.error(`⚠️  Identifiant de connexion NON supprimé (${error.message}).`)
      out.error(`    À supprimer dans la console Firebase → Authentication : ${parentUid}`)
    }
  }

  // ── 4. Contrôle ─────────────────────────────────────────────
  const after = await studentRef.get()
  if (after.get('parentUid')) {
    out.error('❌ Contrôle : la fiche porte encore un parentUid.')
    return 1
  }
  out.log('✅ Contrôle : l’élève n’est plus lié. Un nouveau code parent peut être créé pour lui.')
  return loginLeft ? 1 : 0
}

module.exports = { phoneDigits, planOrphanUnlink, runUnlinkOrphanParent }
