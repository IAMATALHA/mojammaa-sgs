/** Approved one-off campaign. --prepare is read-only remotely; --send is explicit. */
'use strict'
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const { createHash } = require('node:crypto')
const { execFileSync } = require('node:child_process')
const admin = require('firebase-admin')
const ROOT = path.resolve(__dirname, '..')
const DIRECTORY = path.join(ROOT, 'backups', 'activation-email-2026-09-11')
const MANIFEST = path.join(DIRECTORY, 'manifest.json')
const SUBJECT = 'مرحبًا بكم في Mojammaa Connect — فعّلوا حسابكم'
const BODY = `السلام عليكم ورحمة الله وبركاته،

يسرّنا أن نرحّب بكم في تطبيق Mojammaa Connect، فضائكم للتواصل والمتابعة مع المؤسسة.

للبدء، يرجى تحديث التطبيق إلى آخر إصدار، أو تحميله إذا لم يكن مثبتًا على هاتفكم، ثم اتباع الخطوات التالية لتعيين كلمة المرور:

1. افتحوا التطبيق، واضغطوا على «نسيت كلمة المرور» في شاشة تسجيل الدخول.
2. أدخلوا بريدكم الإلكتروني المسجّل لدى المؤسسة: {{email}}
3. افتحوا الرسالة التي ستصلكم، واضغطوا على الرابط لاختيار كلمة مرور جديدة.
4. عودوا إلى التطبيق وسجّلوا الدخول باستعمال بريدكم الإلكتروني وكلمة المرور الجديدة.

إذا لم تظهر الرسالة في صندوق الوارد، يرجى التحقق من مجلد الرسائل غير المرغوب فيها.

لأي سؤال أو مساعدة، يسعدنا تواصلكم معنا عبر:
contact@mojammaa.com`
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const normalize = value => String(value || '').trim().toLowerCase()
const validEmail = email => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
const escapeHtml = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
function message(email) {
  assert.ok(validEmail(email), 'Invalid recipient')
  const text = BODY.replace('{{email}}', email)
  return { from: 'Mojammaa Connect <contact@mojammaa.com>', reply_to: 'contact@mojammaa.com',
    to: [email], subject: SUBJECT, text,
    html: `<html lang="ar" dir="rtl"><body><div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.8;text-align:right;max-width:620px;margin:auto;padding:24px">${escapeHtml(text).replaceAll('\n', '<br>')}</div></body></html>` }
}
async function audience(app) {
  const users = await app.firestore().collection('users').get()
  const recipients = new Map()
  for (const doc of users.docs) {
    const email = normalize(doc.get('email'))
    assert.ok(validEmail(email), 'A profile has no valid email; review audience')
    const authUser = await app.auth().getUser(doc.id)
    assert.ok(!authUser.disabled, 'Disabled account; review audience')
    assert.equal(normalize(authUser.email), email, 'Profile/Auth email mismatch')
    assert.ok(!recipients.has(email), 'Duplicate email; review audience')
    recipients.set(email, { uid: doc.id, email, role: doc.get('role') })
  }
  return [...recipients.values()].sort((a, b) => a.email.localeCompare(b.email))
}
function persist(value) {
  const temp = MANIFEST + '.tmp'
  fs.writeFileSync(temp, JSON.stringify(value, null, 2), { mode: 0o600 })
  fs.renameSync(temp, MANIFEST)
}
async function main() {
  const mode = process.argv[2]
  assert.ok(['--prepare', '--send', '--status'].includes(mode), 'Choose --prepare, --send or --status')
  if (mode === '--send') assert.equal(process.argv[3], '--confirm=ENVOYER-18', 'Explicit count confirmation required')
  const key = require(path.join(ROOT, '.secrets/firebase-admin.json'))
  assert.equal(key.project_id, 'mojammaa-sgs')
  const app = admin.initializeApp({ credential: admin.credential.cert(key) })
  try {
    if (mode === '--prepare') {
      const recipients = await audience(app)
      assert.equal(recipients.length, 18, 'Audience changed; review before sending')
      assert.ok(!fs.existsSync(MANIFEST), 'Campaign already prepared; inspect instead of replacing')
      fs.mkdirSync(DIRECTORY, { mode: 0o700 })
      const messages = recipients.map(r => message(r.email))
      const manifest = { preparedAt: new Date().toISOString(), recipients, messages,
        payloadHash: hash(messages), idempotencyKey: 'activation-2026-09-11-' + hash(messages), state: 'prepared' }
      fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2), { flag: 'wx', mode: 0o600 })
      console.log(JSON.stringify({ prepared: true, recipients: recipients.length, from: messages[0].from,
        subject: SUBJECT, individualMessages: true, sent: 0 }))
      return
    }
    const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'))
    assert.equal(manifest.payloadHash, hash(manifest.messages), 'Campaign payload changed')
    assert.deepEqual(manifest.messages, manifest.recipients.map(r => message(r.email)), 'Approved text changed')
    const apiKey = execFileSync('gcloud', ['secrets', 'versions', 'access', 'latest',
      '--secret=RESEND_API_KEY', '--project=mojammaa-sgs'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
    const request = async (url, options = {}) => {
      const res = await fetch('https://api.resend.com' + url, { ...options,
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', ...options.headers },
        signal: AbortSignal.timeout(30_000) })
      const data = await res.json()
      if (!res.ok) throw Object.assign(new Error('Email provider error'), { code: `resend-${res.status}-${data.name || 'error'}` })
      return data
    }
    if (mode === '--send') {
      if (manifest.state === 'accepted') {
        console.log(JSON.stringify({ alreadySent: true, accepted: manifest.ids.length })); return
      }
      assert.deepEqual(await audience(app), manifest.recipients, 'Audience changed after preparation')
      const domains = await request('/domains')
      assert.ok(domains.data.some(d => d.name === 'mojammaa.com' && d.status === 'verified'), 'Sender domain not verified')
      if (manifest.startedAt) assert.ok(Date.now() - Date.parse(manifest.startedAt) < 23 * 3600_000, 'Retry window expired; manual reconciliation required')
      manifest.startedAt ||= new Date().toISOString()
      manifest.state = 'sending'
      persist(manifest)
      await new Promise(resolve => setTimeout(resolve, 1000))
      const result = await request('/emails/batch', { method: 'POST',
        headers: { 'Idempotency-Key': manifest.idempotencyKey }, body: JSON.stringify(manifest.messages) })
      assert.equal(result.data?.length, manifest.recipients.length, 'Unexpected batch response; reconcile before retry')
      assert.ok(result.data.every(row => typeof row.id === 'string'), 'Missing provider receipt')
      manifest.ids = result.data.map(row => row.id)
      manifest.state = 'accepted'
      manifest.acceptedAt = new Date().toISOString()
      persist(manifest)
      console.log(JSON.stringify({ accepted: manifest.ids.length, provider: 'Resend', from: 'contact@mojammaa.com',
        individualMessages: true, receiptManifest: MANIFEST }))
      return
    }
    assert.equal(manifest.state, 'accepted', 'No confirmed send to inspect')
    const counts = {}
    const receipts = []
    for (let i = 0; i < manifest.ids.length; i++) {
      const receipt = await request('/emails/' + encodeURIComponent(manifest.ids[i]))
      assert.equal(normalize(receipt.to?.[0]), manifest.recipients[i].email, 'Receipt recipient mismatch')
      assert.equal(receipt.subject, SUBJECT, 'Receipt subject mismatch')
      const status = receipt.last_event || 'unknown'
      counts[status] = (counts[status] || 0) + 1
      receipts.push({ id: receipt.id, status })
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
    manifest.lastCheck = { at: new Date().toISOString(), counts, receipts }
    persist(manifest)
    console.log(JSON.stringify({ checked: manifest.ids.length, delivery: counts }))
  } finally { await app.delete() }
}
module.exports = { message, BODY, SUBJECT }
if (require.main === module) main().catch(error => {
  console.error('Campaign stopped:', error.code || error.name)
  process.exitCode = 1
})
