/**
 * Journal des connexions : qui, quand, depuis quelle IP, sur quel appareil.
 *
 * Alimenté par la callable `recordLoginDevice` (functions/loginAudit.js). À la
 * différence de `listLogins.js` — qui lit les métadonnées Firebase Auth et ne
 * connaît QUE la dernière connexion de chaque compte — ce journal garde
 * l'historique de chaque connexion, avec IP et appareil.
 *
 *   node scripts/listLoginAudit.js [jours]
 *
 * Sans argument : les 100 dernières entrées.
 * Avec [jours]  : uniquement les connexions des N derniers jours.
 *
 * Note : l'IP est relevée côté serveur (fiable), l'appareil est déclaré par le
 * client (un client modifié peut mentir ou ne rien envoyer). Une connexion
 * absente d'ici n'est donc PAS une preuve qu'elle n'a pas eu lieu.
 */
const path = require('path')
const fs = require('fs')

const LIMIT = 100

async function main() {
  const days = process.argv[2] ? Number(process.argv[2]) : null

  const keyPath = path.join(__dirname, '..', '.secrets', 'firebase-admin.json')
  if (!fs.existsSync(keyPath)) {
    console.error(`❌ Clé Firebase Admin introuvable : ${keyPath}`)
    process.exit(1)
  }

  const admin = require('firebase-admin')
  admin.initializeApp({ credential: admin.credential.cert(require(keyPath)) })
  const db = admin.firestore()

  let q = db.collection('auditLog').where('action', '==', 'login')
  if (days != null) {
    const cutoff = new Date(Date.now() - days * 86400000)
    q = q.where('at', '>=', cutoff)
  }
  const snap = await q.orderBy('at', 'desc').limit(LIMIT).get()

  if (snap.empty) {
    console.log(
      '\nAucune connexion journalisée.\n' +
        "Normal tant que la fonction n'est pas déployée ET qu'aucun appareil n'a\n" +
        "rouvert l'app depuis. Le journal ne se remplit qu'aux connexions futures.\n",
    )
    process.exit(0)
  }

  console.log(
    `\n${snap.size} connexion(s)${days != null ? ` sur les ${days} derniers jours` : ''} — plus récente d'abord\n`,
  )

  for (const doc of snap.docs) {
    const d = doc.data()
    const at = d.at && d.at.toDate ? d.at.toDate() : null
    const when = at
      ? at.toLocaleString('fr-FR', { timeZone: 'Africa/Casablanca' })
      : '—'
    const who = d.actorEmail || d.actorUid
    const dev = d.device || {}
    const device = dev.label || '—'
    const appVersion = dev.appVersion ? ` · app ${dev.appVersion}` : ''

    console.log(`• [${String(d.actorRole || '—').padEnd(11)}] ${who}`)
    console.log(`    quand    : ${when}`)
    console.log(`    IP       : ${d.ip || '—'}`)
    console.log(`    appareil : ${device}${appVersion}`)
    // Le constructeur n'est affiché que s'il diffère de la marque commerciale
    // (Redmi/Xiaomi, Poco/Xiaomi) — sinon la ligne serait redondante.
    if (dev.manufacturer && dev.manufacturer.toLowerCase() !== String(dev.brand || '').toLowerCase()) {
      console.log(`    fabricant: ${dev.manufacturer}`)
    }
  }
  console.log('')

  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
