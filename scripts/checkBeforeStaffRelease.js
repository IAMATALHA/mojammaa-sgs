#!/usr/bin/env node
/**
 * Contrôle AVANT la mise en ligne du personnel administratif — LECTURE SEULE.
 *
 *   node scripts/checkBeforeStaffRelease.js
 *
 * N'écrit rien, ne déploie rien. Vérifie en production :
 *   1. qu'aucune fiche `users` ne porte déjà `droits`, `poste` ou le rôle `staff`
 *      (sous les règles actuelles, un compte aurait pu se les écrire lui-même) ;
 *   2. qui est admin et qui est superadmin (sans afficher d'e-mail) ;
 *   3. que les règles en ligne sont bien celles d'avant ce chantier.
 * Code de sortie 0 si la voie est libre, 1 sinon.
 */
const path = require('path')
const admin = require('firebase-admin')
const { execFileSync } = require('child_process')

admin.initializeApp({ credential: admin.credential.cert(require(path.join(__dirname, '..', '.secrets', 'firebase-admin.json'))) })
const db = admin.firestore()

async function main() {
  const [users, supers] = await Promise.all([db.collection('users').get(), db.doc('config/superadmins').get()])
  const superUids = new Set(supers.get('uids') || [])
  const name = doc => `${doc.get('prenom') || ''} ${doc.get('nom') || ''}`.trim() || '(sans nom)'
  const marked = users.docs.filter(doc => doc.get('droits') !== undefined || doc.get('poste') !== undefined || doc.get('role') === 'staff')
  const admins = users.docs.filter(doc => doc.get('role') === 'admin')

  console.log(`\nFiches lues : ${users.size}`)
  console.log(`\n1. Fiches portant déjà droits, poste ou rôle staff : ${marked.length}`)
  marked.forEach(doc => console.log(`   ⚠️  ${name(doc)} — rôle ${doc.get('role')}, droits ${JSON.stringify(doc.get('droits') ?? null)}, poste ${JSON.stringify(doc.get('poste') ?? null)}`))
  console.log(`\n2. Administrateurs : ${admins.length} (superadmins : ${superUids.size})`)
  admins.forEach(doc => console.log(`   ${superUids.has(doc.id) ? 'superadmin' : 'admin     '}  ${name(doc)}`))

  console.log('\n3. Règles en ligne')
  let rulesMatch = false
  try {
    // Les règles en ligne doivent encore être celles du dépôt AVANT ce chantier.
    const before = execFileSync('git', ['show', '12d3a00:firestore.rules'], { cwd: path.join(__dirname, '..'), encoding: 'utf8' })
    const token = (await admin.app().options.credential.getAccessToken()).access_token
    const call = async url => (await fetch(url, { headers: { Authorization: `Bearer ${token}` } })).json()
    const releases = await call('https://firebaserules.googleapis.com/v1/projects/mojammaa-sgs/releases')
    const release = (releases.releases || []).find(item => item.name.endsWith('/cloud.firestore'))
    const ruleset = await call(`https://firebaserules.googleapis.com/v1/${release.rulesetName}`)
    const live = ruleset.source.files[0].content
    const norm = text => text.replace(/\r\n/g, '\n').trim()
    rulesMatch = norm(live) === norm(before)
    console.log(`   ${rulesMatch ? '✅ identiques aux règles d’avant le chantier (commit 12d3a00)' : '⚠️  différentes des règles d’avant le chantier : regarder avant de déployer'}`)
    console.log(`   ${live.includes('function can(') ? '⚠️  connaissent déjà le personnel' : 'ne connaissent pas encore le personnel (attendu)'} — ${ruleset.name.split('/').pop().slice(0, 8)}, ${ruleset.createTime}`)
  } catch (error) {
    console.log(`   ⚠️  lecture impossible : ${error.message}`)
  }

  const clear = marked.length === 0 && rulesMatch
  console.log(clear ? '\n✅ Voie libre : déployer les règles, puis les fonctions.\n' : '\n⚠️  À regarder avant tout déploiement.\n')
  process.exit(clear ? 0 : 1)
}
main().catch(error => { console.error(error.message); process.exit(1) })
