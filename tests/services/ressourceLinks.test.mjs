import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs'
import ts from 'typescript'

const source = fs.readFileSync(new URL('../../src/utils/ressourceLinks.ts', import.meta.url), 'utf8')
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
const module = { exports: {} }
new Function('require', 'module', 'exports', output)(() => ({}), module, module.exports)
const { normalizeLink, safeLinks, isRessourceType, foldSearch } = module.exports

test('liens : seuls les sites de la liste, en https, sont acceptés', () => {
  assert.deepEqual(normalizeLink('youtu.be/abc'), { url: 'https://youtu.be/abc', host: 'youtu.be' })
  assert.deepEqual(normalizeLink(' https://www.YouTube.com/watch?v=x '), { url: 'https://www.youtube.com/watch?v=x', host: 'youtube.com' })
  assert.equal(normalizeLink('https://fr.wikipedia.org/wiki/Thal%C3%A8s')?.host, 'fr.wikipedia.org')
  assert.equal(normalizeLink('https://telmidtice.men.gov.ma')?.url, 'https://telmidtice.men.gov.ma/')
  assert.equal(normalizeLink('https://youtube.com?v=1')?.url, 'https://youtube.com/?v=1')

  for (const refused of [
    'http://youtube.com/watch',
    'https://youtube.com.evil.example/x',
    'https://evil-youtube.com/x',
    'https://notyoutube.com/x',
    'https://google.com/url?q=https://evil.example',
    'https://user:pass@youtube.com/x',
    'https://youtube.com@evil.example/x',
    'https://youtube.com:8443/x',
    'https://youtube.com\\@evil.example',
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'https://you tube.com',
    'https://уoutube.com/x',
    '',
  ]) assert.equal(normalizeLink(refused), null, refused)
})

test('les adresses écrites par le site passent aussi dans l’app', () => {
  // Formes produites par URL.href côté web (domaine en minuscules, « / » ajouté).
  for (const href of ['https://www.youtube.com/watch?v=abc123', 'https://youtu.be/thales2026', 'https://www.geogebra.org/m/abc',
    'https://docs.google.com/document/d/1AbC/edit?usp=sharing', 'https://fr.khanacademy.org/', 'https://alloschool.com/course/x#y']) {
    assert.ok(normalizeLink(href), href)
  }
})

test('liens lus en base : refusés écartés, libellé borné, 5 au plus', () => {
  const links = safeLinks([
    { url: 'https://www.geogebra.org/m/abc', label: '  Figure Thalès ' },
    { url: 'https://evil.example/x', label: 'Piège' },
    { url: 'https://youtu.be/z' },
    { url: 42 },
    null,
    { url: 'https://youtu.be/long', label: 'x'.repeat(200) },
  ])
  assert.deepEqual(links.map(link => [link.host, link.label]), [
    ['geogebra.org', 'Figure Thalès'],
    ['youtu.be', 'youtu.be'],
    ['youtu.be', 'x'.repeat(80)],
  ])
  assert.deepEqual(safeLinks('pas une liste'), [])
  assert.equal(safeLinks(Array.from({ length: 9 }, (_, i) => ({ url: `https://youtu.be/${i}` }))).length, 5)
})

test('types et recherche', () => {
  assert.ok(isRessourceType('correction'))
  assert.ok(!isRessourceType('inconnu'))
  assert.equal(foldSearch('Théorème'), 'theoreme')
  assert.equal(foldSearch('الإحْصَاء'), foldSearch('الاحصاء'))
})
