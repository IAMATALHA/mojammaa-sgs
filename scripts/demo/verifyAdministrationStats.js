#!/usr/bin/env node
/** Authenticated production callable smoke test. Never prints nominative rows. */
const path = require('path')
const admin = require('firebase-admin')
const serviceAccount = require(path.join(__dirname, '..', '..', '.secrets', 'firebase-admin.json'))
const googleServices = require(path.join(__dirname, '..', '..', 'google-services.json'))
const apiKey = googleServices.client?.[0]?.api_key?.[0]?.current_key
const projectId = serviceAccount.project_id
const region = 'europe-west1'
admin.initializeApp({ credential: admin.credential.cert(serviceAccount), projectId })

async function idTokenFor(email) {
  const user = await admin.auth().getUserByEmail(email)
  const customToken = await admin.auth().createCustomToken(user.uid)
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: customToken, returnSecureToken: true }),
  })
  const body = await response.json()
  if (!response.ok || !body.idToken) throw new Error('Unable to obtain admin ID token')
  return body.idToken
}

async function callable(name, data, token) {
  const started = Date.now()
  const response = await fetch(`https://${region}-${projectId}.cloudfunctions.net/${name}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ data }),
  })
  const body = await response.json()
  if (!response.ok || body.error) throw new Error(`${name} failed with HTTP ${response.status}`)
  return { value: body.result ?? body.data, ms: Date.now() - started, status: response.status }
}

async function main() {
  const token = await idTokenFor('test-admin@mojammaa.com')
  const hero = await callable('getFilteredSchoolStats', {
    period: 'S2', cycle: 'college', niveau: '', classe: '', matiere: '',
  }, token)
  const scope = hero.value.applied
  const [grade, students, homework, attendance] = await Promise.all([
    callable('getStatsGradeDetails', { scope, matiere: 'Mathématiques' }, token),
    callable('getStatsStudents', { scope, segment: 'all', limit: 50, cursor: null }, token),
    callable('getStatsHomework', { scope, limit: 50, cursor: null }, token),
    callable('getStatsAttendanceDetails', { scope, tab: 'resume', limit: 50, cursor: null }, token),
  ])
  const data = hero.value.data
  const report = {
    status: 'PASS',
    hero: { http: hero.status, ms: hero.ms, students: data.totalEleves, classes: data.totalClasses, notes: data.notesCount, subjects: hero.value.options?.matieres?.length ?? null, average: data.avgNote, successRate: data.successRate },
    grade: { http: grade.status, ms: grade.ms, classes: grade.value.classes?.length ?? grade.value.classRows?.length ?? null, subjects: grade.value.subjects?.length ?? null, teachers: grade.value.teachers?.length ?? null, teacherLabels: (grade.value.teachers || []).map(teacher => `${teacher.prenom} ${teacher.nom}`.trim()), weakStudentsPreview: grade.value.weakStudents?.length ?? null },
    students: { http: students.status, ms: students.ms, total: students.value.total, page: students.value.students?.length ?? students.value.rows?.length ?? null },
    homework: { http: homework.status, ms: homework.ms, total: homework.value.total, page: homework.value.homework?.length ?? homework.value.rows?.length ?? null },
    attendance: { http: attendance.status, ms: attendance.ms, total: attendance.value.total ?? attendance.value.rows?.length ?? 0 },
  }
  const mathTeacherLabels = report.grade.teacherLabels
  if (data.totalEleves !== 60 || data.totalClasses !== 3 || data.notesCount !== 600
    || report.hero.subjects !== 10 || students.value.total !== 60
    || !mathTeacherLabels.includes('Pr. Oumaima') || !mathTeacherLabels.includes('Pr. Abdesalam')) {
    report.status = 'FAIL'
  }
  console.log(JSON.stringify(report, null, 2))
  await admin.app().delete()
  if (report.status !== 'PASS') process.exit(1)
}

main().catch(async error => {
  console.error(error.message || error)
  try { await admin.app().delete() } catch {}
  process.exit(1)
})
