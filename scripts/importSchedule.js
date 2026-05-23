/**
 * Import the weekly schedule of a teacher into Firestore.
 *
 * Writes to: schedules/<teacherUid>
 * Structure:
 *   {
 *     uid:        string
 *     teacherUid: string
 *     weeklySlots: Array<{
 *       day: 'monday' | 'tuesday' | ... | 'saturday',
 *       startTime: 'HH:MM',
 *       endTime:   'HH:MM',
 *       durationMin: number,
 *       classe:    string,
 *       room?:     string,
 *     }>
 *     updatedAt: serverTimestamp
 *   }
 *
 * Usage :
 *   node scripts/importSchedule.js <teacherUid>
 *   node scripts/importSchedule.js cNnmhtiJF7VLgW01RBErKTwu9Ym2
 *
 * Si tu modifies les créneaux, change l'objet SCHEDULE ci-dessous et relance.
 * L'écriture est en `set` (overwrite complet), c'est sain pour un EDT.
 */

const path = require('path')
const fs   = require('fs')

// ──────────────────────────────────────────────────────────────────────────
// Edit this when your schedule changes (rentrée, mid-year shifts, etc.)
// ──────────────────────────────────────────────────────────────────────────
const SCHEDULE = [
  // Lundi
  { day: 'monday',    startTime: '08:30', endTime: '09:30', durationMin: 60, classe: '1APIC-3' },
  { day: 'monday',    startTime: '09:30', endTime: '10:30', durationMin: 60, classe: '1APIC-4' },
  { day: 'monday',    startTime: '10:30', endTime: '12:30', durationMin: 120, classe: '2APIC-4' },

  // Mardi
  { day: 'tuesday',   startTime: '13:00', endTime: '14:00', durationMin: 60, classe: '1APIC-4' },
  { day: 'tuesday',   startTime: '14:00', endTime: '15:00', durationMin: 60, classe: '1APIC-3' },

  // Mercredi
  { day: 'wednesday', startTime: '08:30', endTime: '09:30', durationMin: 60, classe: '1APIC-3' },
  { day: 'wednesday', startTime: '09:30', endTime: '11:30', durationMin: 120, classe: '2APIC-4' },
  { day: 'wednesday', startTime: '11:30', endTime: '12:30', durationMin: 60, classe: '1APIC-4' },
  { day: 'wednesday', startTime: '13:00', endTime: '14:00', durationMin: 60, classe: '1APIC-3' },
  { day: 'wednesday', startTime: '14:00', endTime: '15:00', durationMin: 60, classe: '1APIC-4' },

  // Jeudi
  { day: 'thursday',  startTime: '08:30', endTime: '09:30', durationMin: 60, classe: '1APIC-4' },
  { day: 'thursday',  startTime: '09:30', endTime: '10:30', durationMin: 60, classe: '1APIC-3' },
  { day: 'thursday',  startTime: '10:30', endTime: '12:30', durationMin: 120, classe: '2APIC-4' },

  // Vendredi — exception : 3 séances de 70 min sans pause
  { day: 'friday',    startTime: '08:30', endTime: '09:40', durationMin: 70, classe: '1APIC-4' },
  { day: 'friday',    startTime: '09:40', endTime: '10:50', durationMin: 70, classe: '2APIC-4' },
  { day: 'friday',    startTime: '10:50', endTime: '12:00', durationMin: 70, classe: '1APIC-3' },

  // Samedi : pas de cours
]

// ──────────────────────────────────────────────────────────────────────────

async function main() {
  const [, , teacherUid] = process.argv
  if (!teacherUid) {
    console.error('Usage : node scripts/importSchedule.js <teacherUid>')
    process.exit(1)
  }

  const keyPath = path.join(__dirname, '..', '.secrets', 'firebase-admin.json')
  if (!fs.existsSync(keyPath)) {
    console.error(`❌ Clé Firebase Admin introuvable : ${keyPath}`)
    process.exit(1)
  }

  const admin = require('firebase-admin')
  const serviceAccount = require(keyPath)
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })

  const auth = admin.auth()
  const db   = admin.firestore()

  // Sanity check : user exists ?
  let user
  try {
    user = await auth.getUser(teacherUid)
  } catch (err) {
    console.error(`❌ Utilisateur ${teacherUid} introuvable dans Firebase Auth.`)
    process.exit(1)
  }
  console.log(`✅ Utilisateur trouvé : ${user.email} (${user.uid})`)

  // Summary
  const totalSlots   = SCHEDULE.length
  const totalMinutes = SCHEDULE.reduce((sum, s) => sum + s.durationMin, 0)
  const totalHours   = (totalMinutes / 60).toFixed(1)
  const byDay = SCHEDULE.reduce((acc, s) => { acc[s.day] = (acc[s.day] || 0) + 1; return acc }, {})

  console.log(`\n📅 EDT à enregistrer :`)
  console.log(`   ${totalSlots} créneaux · ${totalHours}h / semaine`)
  Object.entries(byDay).forEach(([day, n]) => console.log(`   ${day.padEnd(10)} → ${n} créneau${n > 1 ? 'x' : ''}`))

  // Write to Firestore
  const ref = db.collection('schedules').doc(teacherUid)
  await ref.set({
    uid: teacherUid,
    teacherUid,
    weeklySlots: SCHEDULE,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  })

  console.log(`\n✅ Écrit dans schedules/${teacherUid}`)
  process.exit(0)
}

main().catch(err => {
  console.error('❌ Erreur :', err)
  process.exit(1)
})
