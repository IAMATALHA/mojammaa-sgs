#!/usr/bin/env node
/**
 * verifyRulesLive.js — Détection de DÉRIVE des règles de sécurité.
 *
 * Compare les rulesets LIVE (Firestore + Storage) au contenu de ce repo
 * (firestore.rules / storage.rules), qui est la SOURCE DE VÉRITÉ unique.
 *
 *   node scripts/verifyRulesLive.js
 *
 * Sort en code 0 si tout est en phase, 1 s'il y a dérive (utilisable en CI /
 * en pre-deploy). N'écrit RIEN, ne déploie RIEN : lecture seule via l'API
 * Firebase Rules, authentifiée par la clé Admin SDK (.secrets/firebase-admin.json).
 *
 * Pourquoi : les règles déployées peuvent retarder sur le repo (déjà observé).
 * On ne suppose jamais — on vérifie le ruleset live.
 */
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const PROJECT = 'mojammaa-sgs';
const keyPath = path.join(__dirname, '..', '.secrets', 'firebase-admin.json');

admin.initializeApp({ credential: admin.credential.cert(require(keyPath)) });

// Normalise pour comparer le CONTENU (insensible aux fins de ligne / espaces
// de fin de fichier ; le reste doit être strictement identique).
const norm = (s) => s.replace(/\r\n/g, '\n').replace(/\s+$/, '') + '\n';

async function token() {
  const t = await admin.app().options.credential.getAccessToken();
  return t.access_token;
}

async function api(url, accessToken) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`);
  return res.json();
}

async function liveRuleset(accessToken, serviceMatch) {
  const { releases = [] } = await api(
    `https://firebaserules.googleapis.com/v1/projects/${PROJECT}/releases`,
    accessToken,
  );
  const rel = releases.find((r) => r.name.includes(serviceMatch));
  if (!rel) throw new Error(`Aucune release pour "${serviceMatch}"`);
  const rs = await api(`https://firebaserules.googleapis.com/v1/${rel.rulesetName}`, accessToken);
  return {
    content: rs.data ? rs.data.source.files[0].content : rs.source.files[0].content,
    updateTime: rel.updateTime,
    ruleset: rel.rulesetName.split('/').pop(),
  };
}

async function check(label, serviceMatch, localFile, accessToken) {
  const local = norm(fs.readFileSync(path.join(__dirname, '..', localFile), 'utf8'));
  const live = await liveRuleset(accessToken, serviceMatch);
  const inSync = norm(live.content) === local;
  console.log(
    `${inSync ? '✅' : '❌'} ${label.padEnd(10)} ` +
      `live=${live.ruleset.slice(0, 8)} déployé ${live.updateTime} ` +
      `→ ${inSync ? 'EN PHASE avec ' + localFile : 'DÉRIVE vs ' + localFile}`,
  );
  return inSync;
}

(async () => {
  const accessToken = await token();
  const results = await Promise.all([
    check('Firestore', 'cloud.firestore', 'firestore.rules', accessToken),
    check('Storage', 'firebase.storage', 'storage.rules', accessToken),
  ]);
  const drift = results.some((ok) => !ok);
  if (drift) {
    console.error('\n⚠️  DÉRIVE détectée — redéployer depuis ce repo :');
    console.error('   firebase deploy --only firestore:rules,storage');
    process.exit(1);
  }
  console.log('\nTout est en phase. Le live correspond au repo.');
})().catch((e) => {
  console.error('ERREUR:', e.message);
  process.exit(2);
});
