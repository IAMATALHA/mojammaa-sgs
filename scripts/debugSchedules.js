const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const keyPath = path.join(__dirname, '..', '.secrets', 'firebase-admin.json');
admin.initializeApp({ credential: admin.credential.cert(require(keyPath)) });

async function check() {
  const db = admin.firestore();
  console.log("--- TEACHERS ---");
  const users = await db.collection('users').where('role', '==', 'professeur').get();
  for (const doc of users.docs) {
    const data = doc.data();
    console.log(`Teacher: ${data.prenom} ${data.nom} (UID: ${doc.id})`);
    const sched = await db.collection('schedules').doc(doc.id).get();
    if (sched.exists) {
      const data = sched.data();
      console.log(`  -> Schedule exists! Slots: ${data.weeklySlots?.length}`);
      if (data.weeklySlots && data.weeklySlots.length > 0) {
        console.log(`  -> First slot day: "${data.weeklySlots[0].day}"`);
      }
    } else {
      console.log(`  -> NO SCHEDULE FOUND for this UID`);
    }
  }

  console.log("--- SCHEDULES COLLECTION ---");
  const scheds = await db.collection('schedules').get();
  for (const doc of scheds.docs) {
    console.log(`Schedule Doc ID: ${doc.id}`);
  }
}
check().catch(console.error);
