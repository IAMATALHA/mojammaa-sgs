/**
 * Détache un élève d'un compte parent SUPPRIMÉ.
 *
 * Pourquoi : rattacher un enfant écrit le lien sur la fiche de l'élève
 * (`parentUid`, `parentNom`, coordonnées). Supprimer le compte ensuite (page
 * Comptes du site, console Firebase) n'efface pas ce lien : l'élève reste
 * « déjà lié », plus aucun code parent ne peut être créé pour lui.
 *
 * Lecture seule par défaut. N'écrit qu'avec --commit, pour UN élève, et
 * seulement si le profil du compte n'existe plus.
 *
 *   node scripts/unlinkOrphanParent.js
 *       liste les élèves liés à un compte parent sans profil
 *   node scripts/unlinkOrphanParent.js <idElève>
 *       détail et plan pour cet élève (rien n'est écrit)
 *   node scripts/unlinkOrphanParent.js <idElève> --commit
 *       applique : retire le lien sur la fiche, supprime l'identifiant restant
 *
 * Options de --commit :
 *   --clear-contact   retire aussi parentTel / parentEmail de la fiche
 *   --keep-contact    les garde même s'ils sont ceux du compte supprimé
 *   --keep-login      ne supprime pas l'identifiant de connexion restant
 *
 * Après l'écriture, les fonctions du serveur font le reste seules : droits du
 * tuteur recalculés (onEleveGuardianAccessWritten), annuaire des parents
 * marqué à rafraîchir. Une copie des champs retirés est gardée dans backups/.
 */
const fs = require('fs')
const path = require('path')
const { runUnlinkOrphanParent } = require('./lib/orphanParent')

const ROOT = path.join(__dirname, '..')

async function main() {
  const keyPath = path.join(ROOT, '.secrets', 'firebase-admin.json')
  if (!fs.existsSync(keyPath)) {
    console.error(`❌ Clé Firebase Admin introuvable : ${keyPath}`)
    return 1
  }
  const admin = require('firebase-admin')
  admin.initializeApp({ credential: admin.credential.cert(require(keyPath)) })

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  return runUnlinkOrphanParent({
    db: admin.firestore(),
    auth: admin.auth(),
    FieldValue: admin.firestore.FieldValue,
    args: process.argv.slice(2),
    saveBackup(studentId, content) {
      const dir = path.join(ROOT, 'backups', `unlink-orphan-parent-${stamp}`)
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
      fs.writeFileSync(path.join(dir, `${studentId}.json`), JSON.stringify(content, null, 2), { flag: 'wx', mode: 0o600 })
      return `${path.relative(ROOT, dir)}/${studentId}.json`
    },
  })
}

main().then(code => process.exit(code)).catch(error => {
  console.error(`❌ ${error.message}`)
  process.exit(1)
})
