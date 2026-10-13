import { readFileSync } from 'node:fs'
import ts from 'typescript'

// Load the actual service without importing the production Firebase config.
export function loadMessagesService(firestore, auth, db, period = () => ({
  academicYear: '2026-2027', semestre: 'S1', monthKey: '2026-10',
})) {
  const path = process.env.MESSAGES_SERVICE_SOURCE || new URL('../../src/services/messagesService.ts', import.meta.url)
  const run = (source, resolve) => {
    const output = ts.transpileModule(readFileSync(source, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText
    const module = { exports: {} }
    new Function('require', 'module', 'exports', output)(resolve, module, module.exports)
    return module.exports
  }
  // Real reading helpers (no dependency of their own): the inbox goes through them.
  const pure = file => run(new URL(`../../src/${file}`, import.meta.url), () => ({}))
  return run(path, name => {
    if (name === 'firebase/firestore') return firestore
    if (name === '../config/firebase') return { auth, db }
    if (name === '../utils/academicPeriod') return { currentAcademicPeriod: period }
    if (name === './firestore') return pure('services/firestore.ts')
    if (name === '../utils/attachments') return pure('utils/attachments.ts')
    return {}
  })
}

export const personalizedParams = (overrides = {}) => ({
  teacher: { uid: 'prof1', prenom: 'Test', nom: 'Teacher' },
  subject: 'Test personnalisé', classe: '1A',
  recipients: [
    { parentUid: 'parent1', eleveId: 'e1', body: 'Bonjour Test A', label: 'Test A · 1A' },
    { parentUid: 'parent2', eleveId: 'e2', body: 'Bonjour Test B', label: 'Test B · 1A' },
  ],
  ...overrides,
})

export const networkError = () => Object.assign(new Error('simulated disconnect'), { code: 'unavailable' })

// The fallback is only for the before/after counter-proof on the old service.
export const newAttempt = service => service.newPersonalizedSendAttempt?.() ?? {}
