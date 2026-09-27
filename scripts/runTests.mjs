#!/usr/bin/env node
/**
 * runTests.mjs — lance tous les fichiers tests/{functions,rules,scripts,services}/*.test.mjs.
 *
 *   npm test                → tests Node purs (sans émulateur)
 *   npm run test:emulator   → tests qui exigent l'émulateur (Firestore + Storage),
 *                             un fichier à la fois dans un seul émulateur (JDK 21 requis)
 *
 * Un test « émulateur » est reconnu à son contenu (FIRESTORE_EMULATOR_HOST ou
 * @firebase/rules-unit-testing) : un nouveau fichier est pris en compte sans
 * modifier package.json. Chaque test fixe son propre projectId ; le projet par
 * défaut de l'émulateur est celui du test Storage, dont les règles lisent
 * Firestore (firestore.get) dans ce projet-là.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const NEEDS_EMULATOR = /FIRESTORE_EMULATOR_HOST|initializeTestEnvironment|rules-unit-testing/
const emulator = process.argv.includes('--emulator')

const files = ['functions', 'rules', 'scripts', 'services'].flatMap(dir =>
  readdirSync(`${root}tests/${dir}`).filter(name => name.endsWith('.test.mjs')).sort().map(name => `tests/${dir}/${name}`))
const selected = files.filter(file => NEEDS_EMULATOR.test(readFileSync(root + file, 'utf8')) === emulator)

if (emulator && !process.env.FIRESTORE_EMULATOR_HOST) {
  console.error('Émulateur absent : lancer `npm run test:emulator`.')
  process.exit(1)
}
const args = ['--test', ...(emulator ? ['--test-concurrency=1'] : []), ...selected]
const { status } = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit' })
process.exit(status ?? 1)
