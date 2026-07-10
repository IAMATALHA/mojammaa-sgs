/**
 * Ajoute les champs de période aux collections actives :
 * notes, absences, devoirs, ressources et messages.
 *
 * Par défaut, ce script est un dry-run et ne modifie rien.
 *
 *   node scripts/backfillAcademicPeriods.js --notes-year=2025-2026
 *   node scripts/backfillAcademicPeriods.js --notes-year=2025-2026 --commit
 *
 * Pourquoi `--notes-year` est obligatoire : une note historique ne contient
 * pas de date pédagogique fiable. Il serait dangereux de deviner son année
 * depuis la date d'import. Les autres collections sont datées par leur date
 * métier (absence/devoir) ou leur date de création.
 */
const path = require('path')
const admin = require('firebase-admin')

const COMMIT = process.argv.includes('--commit')
const notesYear = process.argv.find((arg) => arg.startsWith('--notes-year='))?.split('=')[1] || ''

if (!/^\d{4}-\d{4}$/.test(notesYear)) {
  throw new Error('Ajoutez --notes-year=YYYY-YYYY (ex. --notes-year=2025-2026).')
}

admin.initializeApp({
  credential: admin.credential.cert(require(path.join(__dirname, '..', '.secrets', 'firebase-admin.json'))),
})
const db = admin.firestore()

function dateFromValue(value) {
  if (typeof value === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  }
  if (value && typeof value.toDate === 'function') return value.toDate()
  return null
}

function periodForDate(date) {
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const schoolYearStart = month >= 9 ? year : year - 1
  return {
    academicYear: `${schoolYearStart}-${schoolYearStart + 1}`,
    semestre: month >= 9 || month <= 1 ? 'S1' : 'S2',
    monthKey: `${year}-${String(month).padStart(2, '0')}`,
  }
}

async function commitUpdates(updates) {
  for (let i = 0; i < updates.length; i += 450) {
    const batch = db.batch()
    updates.slice(i, i + 450).forEach(({ ref, data }) => batch.set(ref, data, { merge: true }))
    await batch.commit()
  }
}

function changed(existing, next) {
  return Object.entries(next).some(([key, value]) => existing[key] !== value)
}

async function backfillCollection(name, makePeriod) {
  const snap = await db.collection(name).get()
  const updates = []
  let skipped = 0
  let unchanged = 0

  snap.forEach((doc) => {
    const current = doc.data() || {}
    const period = makePeriod(current)
    if (!period) {
      skipped++
      return
    }
    if (changed(current, period)) updates.push({ ref: doc.ref, data: period })
    else unchanged++
  })

  console.log(`${name}: ${snap.size} lus · ${updates.length} à compléter · ${unchanged} déjà conformes · ${skipped} sans date fiable`)
  if (COMMIT && updates.length > 0) await commitUpdates(updates)
}

async function main() {
  console.log(`Mode: ${COMMIT ? 'ÉCRITURE' : 'dry-run'} · notes: ${notesYear}`)

  await backfillCollection('notes', (data) => ({
    academicYear: notesYear,
    // Conserver S1/S2 si déjà saisi par le professeur ; le fallback ne sert
    // qu'aux anciennes notes mal formées.
    semestre: data.semestre === 'S1' || data.semestre === 'S2'
      ? data.semestre
      : periodForDate(dateFromValue(data.importedAt) || new Date()).semestre,
  }))
  await backfillCollection('absences', (data) => {
    const date = dateFromValue(data.date) || dateFromValue(data.createdAt)
    return date ? periodForDate(date) : null
  })
  await backfillCollection('devoirs', (data) => {
    const date = dateFromValue(data.dateLimite) || dateFromValue(data.createdAt)
    return date ? periodForDate(date) : null
  })
  await backfillCollection('ressources', (data) => {
    const date = dateFromValue(data.createdAt)
    return date ? periodForDate(date) : null
  })
  await backfillCollection('messages', (data) => {
    const date = dateFromValue(data.createdAt)
    return date ? periodForDate(date) : null
  })

  if (!COMMIT) console.log('\nDry-run terminé : relancez avec --commit après validation des compteurs.')
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error.message || error)
  process.exit(1)
})

