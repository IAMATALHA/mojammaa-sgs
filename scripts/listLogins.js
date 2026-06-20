/**
 * Diagnostic LECTURE SEULE : qui s'est connecté récemment.
 *
 * Firebase Auth ne garde pas de liste "connecté maintenant" (les jetons vivent
 * sur l'appareil). On affiche donc, par utilisateur :
 *   - dernière connexion  (lastSignInTime)
 *   - dernière activité    (lastRefreshTime = rafraîchissement du jeton, ~ usage récent)
 *   - création du compte
 * enrichis avec le rôle/nom depuis Firestore (collection users).
 *
 *   node scripts/listLogins.js [jours]
 *
 * Sans argument : tous les comptes, triés du plus récemment actif au plus ancien.
 * Avec [jours]  : ne montre que ceux actifs dans les N derniers jours.
 */
const path = require('path')
const fs = require('fs')

async function main() {
  const days = process.argv[2] ? Number(process.argv[2]) : null

  const keyPath = path.join(__dirname, '..', '.secrets', 'firebase-admin.json')
  if (!fs.existsSync(keyPath)) {
    console.error(`❌ Clé Firebase Admin introuvable : ${keyPath}`)
    process.exit(1)
  }

  const admin = require('firebase-admin')
  admin.initializeApp({ credential: admin.credential.cert(require(keyPath)) })
  const auth = admin.auth()
  const db = admin.firestore()

  // Rôles/noms depuis Firestore
  const roleByUid = {}
  const snap = await db.collection('users').get()
  snap.forEach((d) => {
    const u = d.data() || {}
    roleByUid[d.id] = { role: u.role || '—', nom: u.nom || u.displayName || '' }
  })

  // Tous les utilisateurs Auth (paginé)
  const users = []
  let pageToken
  do {
    const res = await auth.listUsers(1000, pageToken)
    users.push(...res.users)
    pageToken = res.pageToken
  } while (pageToken)

  const now = Date.now()
  const cutoff = days != null ? now - days * 86400000 : null

  const rows = users
    .map((u) => {
      const m = u.metadata || {}
      const lastRefresh = m.lastRefreshTime ? new Date(m.lastRefreshTime).getTime() : 0
      const lastSignIn = m.lastSignInTime ? new Date(m.lastSignInTime).getTime() : 0
      const created = m.creationTime ? new Date(m.creationTime).getTime() : 0
      const meta = roleByUid[u.uid] || { role: '—', nom: '' }
      return {
        email: u.email || u.uid,
        role: meta.role,
        nom: meta.nom,
        lastActive: lastRefresh || lastSignIn,
        lastSignIn,
        created,
      }
    })
    .filter((r) => cutoff == null || r.lastActive >= cutoff)
    .sort((a, b) => b.lastActive - a.lastActive)

  const fmt = (t) => {
    if (!t) return '—'
    const d = new Date(t)
    const diff = now - t
    const day = 86400000
    let ago
    if (diff < 3600000) ago = `il y a ${Math.round(diff / 60000)} min`
    else if (diff < day) ago = `il y a ${Math.round(diff / 3600000)} h`
    else ago = `il y a ${Math.round(diff / day)} j`
    return `${d.toLocaleString('fr-FR', { timeZone: 'Africa/Casablanca' })} (${ago})`
  }

  console.log(`\n${rows.length} compte(s)${days != null ? ` actifs ces ${days} derniers jours` : ''} — triés par activité récente\n`)
  for (const r of rows) {
    const who = r.nom ? `${r.nom} <${r.email}>` : r.email
    console.log(`• [${r.role.padEnd(11)}] ${who}`)
    console.log(`    dernière activité : ${fmt(r.lastActive)}`)
    console.log(`    dernière connexion: ${fmt(r.lastSignIn)}`)
  }
  console.log('')

  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
