/**
 * Envoie un LIEN DE RÉINITIALISATION de mot de passe (à usage unique, qui expire)
 * aux utilisateurs, via Gmail. L'utilisateur clique → définit lui-même son mot de passe.
 *
 * Aucun mot de passe n'est jamais envoyé en clair : on utilise le mécanisme natif
 * Firebase `generatePasswordResetLink`.
 *
 * ── Identifiants Gmail ──────────────────────────────────────────────
 * Crée .secrets/email.json :
 *   { "user": "tonadresse@gmail.com", "appPassword": "abcd efgh ijkl mnop", "fromName": "Mojammaa Al Maarifa" }
 * ("appPassword" = mot de passe d'application Google, PAS ton mot de passe Gmail.
 *  À créer sur https://myaccount.google.com/apppasswords — 2FA requise.)
 * Ou via variables d'env : GMAIL_USER, GMAIL_APP_PASSWORD.
 *
 * ── Usage ───────────────────────────────────────────────────────────
 *   node scripts/sendPasswordReset.js <email> [<email2> ...]   # cibles précises
 *   node scripts/sendPasswordReset.js --all-teachers           # tous les profs
 *   node scripts/sendPasswordReset.js --all-parents            # tous les parents
 *   node scripts/sendPasswordReset.js <email> --dry-run        # génère le lien SANS envoyer
 */

const path = require('path')
const fs   = require('fs')

const args     = process.argv.slice(2)
const DRY      = args.includes('--dry-run')
const ALL_T    = args.includes('--all-teachers')
const ALL_P    = args.includes('--all-parents')
const emailArgs = args.filter(a => !a.startsWith('--'))

function loadGmailCreds() {
  const p = path.join(__dirname, '..', '.secrets', 'email.json')
  if (fs.existsSync(p)) {
    const c = require(p)
    return { user: c.user, pass: c.appPassword, fromName: c.fromName || 'Mojammaa Al Maarifa' }
  }
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    return { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD, fromName: 'Mojammaa Al Maarifa' }
  }
  return null
}

function emailHtml(link, role) {
  const qui = role === 'professeur' ? 'enseignant(e)' : role === 'parent' ? 'parent' : 'utilisateur'
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:auto;color:#1a1a1a">
    <h2 style="margin:0 0 4px">Mojammaa Al Maarifa</h2>
    <p style="color:#666;margin:0 0 20px">Préscolaire · Primaire · Collège</p>
    <p>Bonjour,</p>
    <p>Un compte ${qui} a été créé pour vous sur l’application <b>Mojammaa Connect</b>.
       Pour l’activer, définissez votre mot de passe en cliquant sur le bouton ci-dessous :</p>
    <p style="text-align:center;margin:28px 0">
      <a href="${link}" style="background:#1f6feb;color:#fff;text-decoration:none;
         padding:12px 24px;border-radius:8px;display:inline-block;font-weight:bold">
        Définir mon mot de passe
      </a>
    </p>
    <p style="font-size:13px;color:#666">Ce lien est à usage unique et expire après un délai.
       Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :</p>
    <p style="font-size:12px;word-break:break-all;color:#1f6feb">${link}</p>
    <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
    <p dir="rtl" style="font-size:13px;color:#444">
      مرحباً، تم إنشاء حساب لكم على تطبيق <b>Mojammaa Connect</b>.
      الرجاء الضغط على الزر أعلاه لتعيين كلمة المرور الخاصة بكم. هذا الرابط صالح لمرة واحدة وينتهي بعد مدة.
    </p>
  </div>`
}

async function main() {
  const keyPath = path.join(__dirname, '..', '.secrets', 'firebase-admin.json')
  if (!fs.existsSync(keyPath)) { console.error('❌ Clé Firebase Admin introuvable'); process.exit(1) }
  const admin = require('firebase-admin')
  admin.initializeApp({ credential: admin.credential.cert(require(keyPath)) })
  const auth = admin.auth()
  const db   = admin.firestore()

  // ── Construire la liste des destinataires ──────────────────────────
  let targets = [...emailArgs] // [{email, role?}]  (ici juste emails)
  const roleByEmail = {}
  if (ALL_T || ALL_P) {
    const roles = []
    if (ALL_T) roles.push('professeur')
    if (ALL_P) roles.push('parent')
    for (const r of roles) {
      const snap = await db.collection('users').where('role', '==', r).get()
      snap.forEach(d => {
        const e = d.data().email
        if (e) { targets.push(e); roleByEmail[e] = r }
      })
    }
  }
  targets = [...new Set(targets.filter(Boolean))]

  if (targets.length === 0) {
    console.error('Usage : node scripts/sendPasswordReset.js <email...> | --all-teachers | --all-parents  [--dry-run]')
    process.exit(1)
  }

  // ── Transport Gmail (sauf en dry-run) ──────────────────────────────
  let transporter = null, creds = null
  if (!DRY) {
    creds = loadGmailCreds()
    if (!creds) {
      console.error('❌ Identifiants Gmail manquants. Crée .secrets/email.json ou exporte GMAIL_USER / GMAIL_APP_PASSWORD.')
      console.error('   (Astuce : relance avec --dry-run pour juste générer les liens sans envoyer.)')
      process.exit(1)
    }
    const nodemailer = require('nodemailer')
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: creds.user, pass: creds.pass },
    })
    await transporter.verify()
    console.log(`✉️  Connecté à Gmail (${creds.user})`)
  } else {
    console.log('🧪 DRY-RUN — génération des liens uniquement, aucun envoi.')
  }

  console.log(`\n${targets.length} destinataire(s) :\n`)
  let ok = 0, fail = 0
  for (const email of targets) {
    try {
      // rôle (pour personnaliser le texte) : depuis la map, sinon depuis users
      let role = roleByEmail[email]
      if (!role) {
        const u = await auth.getUserByEmail(email)
        const us = await db.collection('users').doc(u.uid).get()
        role = us.exists ? us.data().role : undefined
      }
      const link = await auth.generatePasswordResetLink(email)

      if (DRY) {
        console.log(`   • ${email} [${role || '?'}]\n     ${link}\n`)
        ok++
        continue
      }

      await transporter.sendMail({
        from: `"${creds.fromName}" <${creds.user}>`,
        to: email,
        subject: 'Activez votre compte — Mojammaa Al Maarifa',
        html: emailHtml(link, role),
      })
      console.log(`   ✓ envoyé → ${email} [${role || '?'}]`)
      ok++
    } catch (err) {
      console.log(`   ✗ ${email} — ${err.code || err.message}`)
      fail++
    }
  }

  console.log(`\n✅ Terminé : ${ok} réussi(s), ${fail} échec(s).`)
  process.exit(0)
}

main().catch(err => { console.error('❌ Erreur :', err); process.exit(1) })
