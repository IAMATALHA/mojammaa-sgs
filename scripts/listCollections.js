const admin = require('firebase-admin');
const path = require('path');

const keyPath = path.join(__dirname, '..', '.secrets', 'firebase-admin.json');
admin.initializeApp({ credential: admin.credential.cert(require(keyPath)) });

async function check() {
  const db = admin.firestore();
  const collections = await db.listCollections();
  console.log("Collections:", collections.map(c => c.id).join(', '));
}
check().catch(console.error);
