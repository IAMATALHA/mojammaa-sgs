const admin = require('firebase-admin');
const path = require('path');

const keyPath = path.join(__dirname, '..', '.secrets', 'firebase-admin.json');
admin.initializeApp({ credential: admin.credential.cert(require(keyPath)) });

async function check() {
  const db = admin.firestore();
  console.log("--- EMPLOI DU TEMPS ---");
  const snap = await db.collection('emploiDuTemps').get();
  console.log(`Docs in emploiDuTemps: ${snap.size}`);
  if (snap.size > 0) {
    console.log(snap.docs[0].data());
  }
}
check().catch(console.error);
