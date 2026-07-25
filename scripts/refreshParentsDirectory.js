#!/usr/bin/env node
/**
 * refreshParentsDirectory.js — (re)calcule `directoryAdmin/parents`.
 *
 *   node scripts/refreshParentsDirectory.js            # simulation
 *   node scripts/refreshParentsDirectory.js --commit   # écrit le document
 *
 * À quoi ça sert : amorcer l'annuaire au premier déploiement, ou le réparer
 * après une reprise de données faite hors application (import direct, restore
 * de sauvegarde) — ces chemins ne déclenchent pas les triggers Firestore qui
 * marquent l'annuaire à recalculer.
 *
 * En fonctionnement normal, rien à lancer : `flushParentsDirectoryDirty`
 * (Cloud Function planifiée) s'en charge dans les deux minutes qui suivent un
 * changement de parent ou d'élève.
 *
 * La projection vient de functions/parentsDirectory.js, le MÊME module que la
 * Cloud Function : ce script ne peut pas produire un annuaire différent
 * d'elle. Il ne journalise que des volumes — jamais un nom, un e-mail ou une
 * classe (données d'élèves mineurs).
 */
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const KEY_PATH = path.join(ROOT, '.secrets', 'firebase-admin.json');
const COMMIT = process.argv.includes('--commit');

const {
  buildParentsDirectory, approximateSize, SIZE_WARNING_BYTES,
} = require(path.join(ROOT, 'functions', 'parentsDirectory.js'));

async function main() {
  if (!fs.existsSync(KEY_PATH)) {
    console.error(`Clé Firebase Admin introuvable : ${KEY_PATH}`);
    process.exit(1);
  }
  const admin = require('firebase-admin');
  admin.initializeApp({ credential: admin.credential.cert(require(KEY_PATH)) });
  const db = admin.firestore();

  console.log(COMMIT ? '=== MODE ÉCRITURE (--commit) ===' : '=== SIMULATION — aucune écriture ===');

  const [usersSnap, elevesSnap] = await Promise.all([
    db.collection('users').get(),
    db.collection('eleves').get(),
  ]);

  const payload = buildParentsDirectory(
    usersSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    elevesSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
  );

  const bytes = approximateSize(payload);
  const withChildren = payload.parents.filter((p) => p.children.length > 0).length;

  console.log(`lu       : ${usersSnap.size} users · ${elevesSnap.size} eleves`);
  console.log(`annuaire : ${payload.parents.length} parents (${withChildren} avec enfant rattaché)`);
  console.log(`classes  : ${payload.classes.length}`);
  console.log(`taille   : ${(bytes / 1024).toFixed(1)} Ko (alerte à ${(SIZE_WARNING_BYTES / 1024).toFixed(0)} Ko, plafond Firestore 1024 Ko)`);

  if (bytes > SIZE_WARNING_BYTES) {
    console.warn('⚠️  Le document approche le plafond Firestore — prévoir un découpage.');
  }

  // Un annuaire sans aucun parent rattaché signale presque toujours une
  // anomalie de données (parentUid non renseignés) : mieux vaut refuser
  // d'écraser un document valide par un annuaire vide.
  if (COMMIT && payload.parents.length === 0) {
    console.error('✋ Aucun parent trouvé — écriture annulée (anomalie probable).');
    process.exit(1);
  }

  if (!COMMIT) {
    console.log('\nRelancer avec --commit pour écrire directoryAdmin/parents.');
    return;
  }

  await db.collection('directoryAdmin').doc('parents').set({
    ...payload,
    updatedAt: new Date(),
  });
  console.log('\n✅ directoryAdmin/parents écrit.');
}

main().catch((e) => {
  console.error(e && e.message ? e.message : e);
  process.exit(1);
});
