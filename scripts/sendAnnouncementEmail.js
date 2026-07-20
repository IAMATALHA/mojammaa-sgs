/**
 * Envoie une annonce email aux utilisateurs dont l'adresse est enregistrée
 * dans Firestore (`users/{uid}.email`).
 *
 * Sécurité : le script est en mode aperçu par défaut. Un envoi réel exige
 * explicitement `--send --confirm=ENVOYER`.
 *
 * Configuration email :
 *   .secrets/email.json
 *   {
 *     "user": "contact@mojammaa.com",
 *     "appPassword": "mot-de-passe-d-application",
 *     "fromName": "Mojammaa Al Maarifa"
 *   }
 *
 * Usage :
 *   node scripts/sendAnnouncementEmail.js --dry-run --all
 *   node scripts/sendAnnouncementEmail.js --dry-run --all-parents
 *   node scripts/sendAnnouncementEmail.js --dry-run --all-teachers
 *   node scripts/sendAnnouncementEmail.js --dry-run exemple@email.com
 *   node scripts/sendAnnouncementEmail.js --send --confirm=ENVOYER --all
 *
 * `--limit=N` permet de tester avec un nombre réduit de destinataires.
 */

const path = require('path')
const fs = require('fs')

const DEFAULT_FROM_EMAIL = 'contact@mojammaa.com'
const DEFAULT_REPLY_TO = 'contact@mojammaa.com'
const DEFAULT_FROM_NAME = 'Mojammaa Al Maarifa'
const DEFAULT_SUBJECT = 'Une nouvelle version de Mojammaa est disponible'
const DEFAULT_MESSAGE = `Bonjour à toutes et à tous,

Nous avons le plaisir de vous informer qu’une nouvelle version de l’application Mojammaa Al Maarifa est désormais disponible.

Cette version apporte plusieurs améliorations afin de rendre l’utilisation de l’application plus simple et plus efficace. Nous vous invitons à la découvrir et à nous faire part de vos remarques.

Merci pour votre confiance.

Cordialement,
Mojammaa Al Maarifa`

const args = process.argv.slice(2)
const hasFlag = (flag) => args.includes(flag)
const flagValue = (flag) => {
  const value = args.find((arg) => arg.startsWith(`${flag}=`))
  return value ? value.slice(flag.length + 1) : null
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function printUsage() {
  console.log(`Usage :
  node scripts/sendAnnouncementEmail.js --dry-run --all
  node scripts/sendAnnouncementEmail.js --dry-run --all-parents
  node scripts/sendAnnouncementEmail.js --dry-run --all-teachers
  node scripts/sendAnnouncementEmail.js --dry-run <email> [<email2> ...]
  node scripts/sendAnnouncementEmail.js --send --confirm=ENVOYER --all

Options :
  --dry-run          aperçu uniquement, aucun email envoyé
  --send             autorise l'envoi réel
  --confirm=ENVOYER  confirmation obligatoire pour l'envoi réel
  --all              tous les utilisateurs avec une adresse email
  --all-parents      uniquement les parents
  --all-teachers     uniquement les professeurs
  --limit=N          limite le nombre de destinataires pour un test`)
}

function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase()
  return EMAIL_RE.test(email) ? email : null
}

function maskEmail(email) {
  const [local, domain] = email.split('@')
  if (local.length <= 2) return `${local[0] || '*'}***@${domain}`
  return `${local.slice(0, 2)}***@${domain}`
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function messageHtml() {
  const paragraphs = DEFAULT_MESSAGE
    .split(/\n\s*\n/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replaceAll('\n', '<br>')}</p>`)
    .join('')

  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:auto;color:#1a1a1a;line-height:1.55">
    <h2 style="margin:0 0 4px;color:#1f6feb">${escapeHtml(DEFAULT_FROM_NAME)}</h2>
    <p style="color:#666;margin:0 0 24px">Mojammaa Connect</p>
    ${paragraphs}
  </div>`
}

function loadEmailCredentials() {
  const configPath = path.join(__dirname, '..', '.secrets', 'email.json')
  if (fs.existsSync(configPath)) {
    const config = require(configPath)
    return {
      user: config.user,
      pass: config.appPassword,
      fromEmail: config.fromEmail || process.env.MOJAMMAA_FROM_EMAIL || DEFAULT_FROM_EMAIL,
      replyTo: config.replyTo || process.env.MOJAMMAA_REPLY_TO || DEFAULT_REPLY_TO,
      fromName: config.fromName || DEFAULT_FROM_NAME,
    }
  }

  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    return {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
      fromEmail: process.env.MOJAMMAA_FROM_EMAIL || DEFAULT_FROM_EMAIL,
      replyTo: process.env.MOJAMMAA_REPLY_TO || DEFAULT_REPLY_TO,
      fromName: process.env.MOJAMMAA_FROM_NAME || DEFAULT_FROM_NAME,
    }
  }

  return null
}

async function loadRecipients(db) {
  const all = hasFlag('--all')
  const roleQueries = []
  if (hasFlag('--all-parents')) roleQueries.push('parent')
  if (hasFlag('--all-teachers')) roleQueries.push('professeur')
  const directEmails = args.filter((arg) => !arg.startsWith('--'))

  if (!all && roleQueries.length === 0 && directEmails.length === 0) {
    throw new Error('Sélectionne --all, --all-parents, --all-teachers ou au moins une adresse email.')
  }

  const byEmail = new Map()
  let missingEmailCount = 0

  const addUserDoc = (doc) => {
    const data = doc.data() || {}
    const email = normalizeEmail(data.email)
    if (!email) {
      missingEmailCount++
      return
    }
    if (!byEmail.has(email)) {
      byEmail.set(email, { email, role: data.role || 'utilisateur' })
    }
  }

  if (all) {
    const snap = await db.collection('users').get()
    snap.forEach(addUserDoc)
  }

  for (const role of roleQueries) {
    const snap = await db.collection('users').where('role', '==', role).get()
    snap.forEach(addUserDoc)
  }

  for (const value of directEmails) {
    const email = normalizeEmail(value)
    if (email && !byEmail.has(email)) {
      byEmail.set(email, { email, role: 'cible directe' })
    }
  }

  const limitValue = flagValue('--limit')
  if (limitValue !== null) {
    const limit = Number(limitValue)
    if (!Number.isInteger(limit) || limit < 1) {
      throw new Error('--limit doit être un entier supérieur ou égal à 1.')
    }
    return {
      recipients: [...byEmail.values()].slice(0, limit),
      missingEmailCount,
      totalBeforeLimit: byEmail.size,
    }
  }

  return {
    recipients: [...byEmail.values()],
    missingEmailCount,
    totalBeforeLimit: byEmail.size,
  }
}

async function main() {
  if (hasFlag('--help') || hasFlag('-h')) {
    printUsage()
    return
  }

  if (hasFlag('--dry-run') && hasFlag('--send')) {
    throw new Error('Choisis soit --dry-run, soit --send, pas les deux.')
  }

  const send = hasFlag('--send')
  const keyPath = path.join(__dirname, '..', '.secrets', 'firebase-admin.json')
  if (!fs.existsSync(keyPath)) {
    throw new Error('Clé Firebase Admin introuvable : .secrets/firebase-admin.json')
  }

  const admin = require('firebase-admin')
  admin.initializeApp({ credential: admin.credential.cert(require(keyPath)) })

  const { recipients, missingEmailCount, totalBeforeLimit } = await loadRecipients(admin.firestore())
  if (recipients.length === 0) {
    throw new Error('Aucun destinataire valide trouvé.')
  }

  const limited = totalBeforeLimit > recipients.length
  console.log(`\n${send ? 'ENVOI RÉEL' : 'APERÇU'} — ${recipients.length} destinataire(s)`)
  if (limited) console.log(`Limite appliquée : ${recipients.length}/${totalBeforeLimit}`)
  if (missingEmailCount > 0) console.log(`Comptes ignorés sans email valide : ${missingEmailCount}`)
  console.log(`Expéditeur prévu : ${DEFAULT_FROM_NAME} <${DEFAULT_FROM_EMAIL}>`)
  console.log(`Objet : ${DEFAULT_SUBJECT}\n`)
  console.log(`Exemples masqués : ${recipients.slice(0, 5).map((r) => maskEmail(r.email)).join(', ')}`)

  if (!send) {
    console.log('\nAucun email n’a été envoyé. Pour envoyer réellement :')
    console.log('node scripts/sendAnnouncementEmail.js --send --confirm=ENVOYER --all')
    return
  }

  if (flagValue('--confirm') !== 'ENVOYER') {
    throw new Error("Envoi bloqué : ajoute --confirm=ENVOYER après avoir vérifié l’aperçu.")
  }

  const credentials = loadEmailCredentials()
  if (!credentials) {
    throw new Error('Identifiants email manquants. Configure .secrets/email.json ou GMAIL_USER/GMAIL_APP_PASSWORD.')
  }

  const nodemailer = require('nodemailer')
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: credentials.user, pass: credentials.pass },
  })
  await transporter.verify()

  console.log(`Connecté au service email avec ${credentials.user}.`)
  let sent = 0
  let failed = 0

  for (const recipient of recipients) {
    try {
      await transporter.sendMail({
        from: `"${credentials.fromName}" <${credentials.fromEmail}>`,
        replyTo: credentials.replyTo,
        to: recipient.email,
        subject: DEFAULT_SUBJECT,
        text: DEFAULT_MESSAGE,
        html: messageHtml(),
      })
      sent++
      console.log(`✓ envoyé → ${maskEmail(recipient.email)}`)
    } catch (error) {
      failed++
      console.error(`✗ échec → ${maskEmail(recipient.email)} : ${error.code || error.message}`)
    }
  }

  console.log(`\nTerminé : ${sent} envoyé(s), ${failed} échec(s).`)
}

main().catch((error) => {
  console.error(`❌ ${error.message}`)
  process.exitCode = 1
})
