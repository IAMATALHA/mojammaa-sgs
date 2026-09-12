// Read-only diagnosis. Reports counts and error codes, never student records.
const path = require('node:path')
const functionRequire = require('node:module').createRequire(path.join(__dirname, '../functions/index.js'))
const admin = process.argv.includes('--local') ? functionRequire('firebase-admin') : require('firebase-admin')
let localFunctions
if (process.argv.includes('--local')) {
  process.env.GOOGLE_APPLICATION_CREDENTIALS = path.join(__dirname, '../.secrets/firebase-admin.json')
  localFunctions = require('../functions/index')
  // This audit prints only aggregate results, including when invoking local callables.
  require('node:module').createRequire(require.resolve('../functions/index'))('firebase-functions/logger').info = () => {}
} else admin.initializeApp({ credential: admin.credential.cert(require(path.join(__dirname, '../.secrets/firebase-admin.json'))) })
const db = admin.firestore()
async function main() {
  const code = process.argv[2]
  if (!code) throw new Error('Student reference required')
  const [direct, matches] = await Promise.all([
    db.collection('eleves').doc(code).get(),
    db.collection('eleves').where('codeMassar', '==', code).get(),
  ])
  const docs = new Map(matches.docs.map(d => [d.id, d]))
  if (direct.exists) docs.set(direct.id, direct)
  console.log(JSON.stringify({ matchingStudents: docs.size }))
  for (const student of docs.values()) {
    const row = student.data()
    const ids = [...new Set([student.id, row.codeMassar].filter(Boolean))]
    const snaps = await Promise.all(ids.map(id => db.collection('absences').where('eleveId', '==', id).get()))
    const calls = snaps.flatMap(s => s.docs.map(d => d.data()))
    console.log(JSON.stringify({ documentIdMatchesMassar: student.id === row.codeMassar, active: row.active !== false,
      calls: calls.length, absent: calls.filter(r => r.statut === 'absent').length,
      byIdentityCounts: snaps.map(s => s.size), missingPeriod: calls.filter(r => !r.academicYear || !r.monthKey).length,
      years: [...new Set(calls.map(r => r.academicYear).filter(Boolean))],
      statuses: [...new Set(calls.map(r => r.statut))],
    }))
    try {
      const result = await db.collection('absences').where('eleveId', '==', student.id).where('statut', '==', 'absent').get()
      console.log(JSON.stringify({ webQuery: 'ok', count: result.size }))
    } catch (e) { console.log(JSON.stringify({ webQuery: 'error', code: e.code })) }
    if (process.argv.includes('--client') || localFunctions) {
      const fs = require('node:fs')
      const apiKey = fs.readFileSync(path.join(__dirname, '../../mojammaa-admin/src/firebase.ts'), 'utf8').match(/apiKey:.*?'([^']+)'/)[1]
      const { initializeApp, deleteApp } = require('firebase/app')
      const { getAuth, signInWithCustomToken } = require('firebase/auth')
      const { getFirestore, collection, query, where, getDocs } = require('firebase/firestore')
      const admins = await db.collection('users').where('role', '==', 'admin').limit(1).get()
      const teachers = await db.collection('users').where('classes', 'array-contains', row.classe).get()
      const candidates = [...admins.docs, ...teachers.docs.filter(d => d.get('role') === 'professeur')]
      if (localFunctions) {
        for (const person of candidates.slice(0, 2)) {
          const result = await localFunctions.getStatsStudentFile.run({ auth: { uid: person.id }, data: { eleveId: student.id, scope: { period: 'annee' } } })
          console.log(JSON.stringify({ localRole: person.get('role'), absentDays: result.attendance.absentDays, recentAbsences: result.attendance.recentAbsences.length }))
          if (person.get('role') === 'admin') {
            const settings = await localFunctions.getCoefficientSettings.run({ auth: { uid: person.id }, data: {} })
            console.log(JSON.stringify({ coefficientEditor: { levels: settings.levels.length, subjects: settings.subjects.length } }))
          }
        }
        return
      }
      for (let i = 0; i < Math.min(candidates.length, 2); i++) {
        const person = candidates[i]
        const app = initializeApp({ apiKey, projectId: 'mojammaa-sgs' }, `audit-${i}`)
        try {
          const token = await admin.auth().createCustomToken(person.id)
          const auth = getAuth(app)
          await signInWithCustomToken(auth, token)
          const clientDb = getFirestore(app)
          let queryResult
          try {
            const snap = await getDocs(query(collection(clientDb, 'absences'), where('eleveId', '==', student.id), where('classe', '==', row.classe)))
            queryResult = { count: snap.docs.filter(d => d.get('statut') === 'absent').length }
          } catch (e) { queryResult = { code: e.code } }
          const idToken = await auth.currentUser.getIdToken()
          const response = await fetch('https://europe-west1-mojammaa-sgs.cloudfunctions.net/getStatsStudentFile', {
            method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
            body: JSON.stringify({ data: { eleveId: student.id, scope: { period: 'annee' } } }),
          })
          const body = await response.json()
          const result = body.result || body.data
          console.log(JSON.stringify({ clientRole: person.get('role'), query: queryResult, callableStatus: response.status,
            callableError: body.error?.status, absentDays: result?.attendance?.absentDays,
            recentAbsences: result?.attendance?.recentAbsences?.length, gradeScope: result?.gradeScope }))
          if (response.status !== 200 || queryResult.count < 1 || result?.attendance?.absentDays < 1) throw new Error('Attendance verification failed')
          for (const endpoint of ['getCoefficientSettings', 'saveLevelCoefficients']) {
            // Empty save data can only exercise validation; it cannot change coefficients.
            const check = await fetch(`https://europe-west1-mojammaa-sgs.cloudfunctions.net/${endpoint}`, {
              method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
              body: JSON.stringify({ data: {} }),
            })
            const checked = await check.json()
            const expected = person.get('role') === 'admin' ? (endpoint === 'getCoefficientSettings' ? 200 : 400) : 403
            console.log(JSON.stringify({ clientRole: person.get('role'), endpoint, status: check.status, error: checked.error?.status }))
            if (check.status !== expected) throw new Error('Coefficient authorization verification failed')
          }
        } catch (e) { console.log(JSON.stringify({ clientError: e.code || e.name })); process.exitCode = 1 }
        finally { await deleteApp(app) }
      }
      const anonymous = await fetch('https://europe-west1-mojammaa-sgs.cloudfunctions.net/getStatsStudentFile', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: { eleveId: student.id, scope: { period: 'annee' } } }),
      })
      console.log(JSON.stringify({ anonymousStudentFile: anonymous.status }))
      if (anonymous.status !== 401) throw new Error('Anonymous access verification failed')
    }
  }
}
main().catch(e => { console.error(JSON.stringify({ error: e.code || e.name })); process.exitCode = 1 }).finally(() => admin.app().delete())
