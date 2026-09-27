import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { alertCopy } = require('../../functions/schoolAlerts')
const load = path => {
  const output = ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  const module = { exports: {} }
  new Function('require', 'module', 'exports', output)(() => ({}), module, module.exports)
  return module.exports
}
const { BEHAVIOR_REASONS, BEHAVIOR_OBSERVATIONS } = load('src/utils/behaviorTaxonomy.ts')
for (const lang of ['fr', 'ar', 'en']) {
  const copy = load(`src/i18n/locales/${lang}.ts`).default
  for (const kind of ['merite', 'avertissement']) {
    for (const key of BEHAVIOR_REASONS[kind]) assert.ok(copy.behavior.reasons[key], `${lang}: ${key}`)
    for (const key of BEHAVIOR_OBSERVATIONS[kind]) assert.ok(copy.behavior.observations[key], `${lang}: ${key}`)
  }
}
for (const reason of ['lessonNotCopied', 'inattention', 'talking', 'carefulWork', 'progress', 'respectful', 'autonomy', 'lateToClass', 'interrupting', 'incompleteWork']) {
  const copy = alertCopy('behavior', { kind: 'avertissement', reason, comment: 'Test' }, { prenom: 'Fixture' })
  assert.ok(copy.body.includes(load('src/i18n/locales/fr.ts').default.behavior.reasons[reason]))
  assert.ok(copy.bodyAr.includes(load('src/i18n/locales/ar.ts').default.behavior.reasons[reason]))
  assert.ok(copy.bodyEn.includes(load('src/i18n/locales/en.ts').default.behavior.reasons[reason]))
}
console.log('Behavior motifs, observations and notifications verified in FR/AR/EN')
