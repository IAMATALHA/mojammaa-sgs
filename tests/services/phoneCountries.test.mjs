import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
import { test } from 'node:test'

// Charge un module TS du dossier utils ; ses imports relatifs sont chargés de la même façon.
function load(name, cache = {}) {
  if (cache[name]) return cache[name].exports
  const source = fs.readFileSync(new URL(`../../src/utils/${name}.ts`, import.meta.url), 'utf8')
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const module = { exports: {} }
  cache[name] = module
  new Function('require', 'module', 'exports', output)(spec => load(spec.replace('./', ''), cache), module, module.exports)
  return module.exports
}
const {
  PHONE_COUNTRIES, SUGGESTED_COUNTRY_ISOS, OTHER_COUNTRY_ISO, findPhoneCountry, flagOf, countryName,
  searchPhoneCountries, formatNationalInput, phonePlaceholder, phoneFieldValidity, phoneFieldE164,
  parseInternationalInput, phoneFieldFromE164,
} = load('phoneCountries')
const { normalizeLoginPhone } = load('parentIdentity')

test('country data is consistent', () => {
  const isos = PHONE_COUNTRIES.map(country => country.iso)
  assert.equal(new Set(isos).size, isos.length, 'ISO en double')
  for (const iso of SUGGESTED_COUNTRY_ISOS) assert.ok(findPhoneCountry(iso), iso)
  for (const country of PHONE_COUNTRIES) {
    assert.match(country.dial, /^[1-9]\d{0,2}$/, country.iso)
    assert.ok(country.min <= country.max, country.iso)
    assert.ok(country.example.length >= country.min && country.example.length <= country.max, `${country.iso} exemple hors longueur`)
    for (const lang of ['fr', 'en', 'ar']) assert.ok(country.names[lang], `${country.iso} ${lang}`)
    assert.ok(!(country.trunkZero && country.example.startsWith('0')), `${country.iso} : exemple sans le 0 national`)
  }
})

test('every country produces a number the server accepts unchanged', () => {
  for (const country of PHONE_COUNTRIES) {
    const typed = country.trunkZero ? `0${country.example}` : country.example
    const validity = phoneFieldValidity({ iso: country.iso, raw: typed })
    assert.equal(validity.status, 'valid', country.iso)
    assert.equal(normalizeLoginPhone(validity.e164), validity.e164, `${country.iso} : pas un point fixe serveur`)
    // Sans le 0 national, même résultat.
    assert.equal(phoneFieldE164({ iso: country.iso, raw: country.example }), validity.e164, country.iso)
    // Et l'E.164 retombe sur le même pays (sauf indicatif partagé +1).
    const back = parseInternationalInput(validity.e164, country.iso)
    assert.equal(back.iso, country.iso, country.iso)
    assert.equal(back.raw, country.example.replace(/^0/, country.trunkZero ? '' : '0'), country.iso)
  }
})

test('the country picker settles the 06 ambiguity', () => {
  assert.equal(phoneFieldE164({ iso: 'MA', raw: '06 12 34 56 78' }), '+212612345678')
  assert.equal(phoneFieldE164({ iso: 'FR', raw: '06 12 34 56 78' }), '+33612345678')
  assert.equal(phoneFieldE164({ iso: 'BE', raw: '0470 12 34 56' }), '+32470123456')
  assert.equal(phoneFieldE164({ iso: 'IT', raw: '06 1234 5678' }), '+390612345678')
})

test('validity feedback: empty, too short, too long, Moroccan prefix', () => {
  assert.deepEqual(phoneFieldValidity({ iso: 'MA', raw: '' }), { status: 'empty' })
  assert.deepEqual(phoneFieldValidity({ iso: 'MA', raw: '0' }), { status: 'empty' })
  assert.deepEqual(phoneFieldValidity({ iso: 'MA', raw: '06 12 34' }), { status: 'too-short', min: 9 })
  assert.deepEqual(phoneFieldValidity({ iso: 'FR', raw: '06 12 34 56 78 9' }), { status: 'too-long', max: 9 })
  assert.deepEqual(phoneFieldValidity({ iso: 'MA', raw: '04 12 34 56 78' }), { status: 'invalid' })
  assert.equal(phoneFieldValidity({ iso: 'MA', raw: '٠٦١٢٣٤٥٦٧٨' }).status, 'valid')
  assert.deepEqual(phoneFieldValidity({ iso: 'ZZ', raw: '123' }), { status: 'invalid' })
})

test('"other country" accepts any full international number', () => {
  assert.deepEqual(phoneFieldValidity({ iso: OTHER_COUNTRY_ISO, raw: '+7 912 345 67 89' }), { status: 'valid', e164: '+79123456789' })
  assert.deepEqual(phoneFieldValidity({ iso: OTHER_COUNTRY_ISO, raw: '0612345678' }), { status: 'valid', e164: '+212612345678' })
  assert.deepEqual(phoneFieldValidity({ iso: OTHER_COUNTRY_ISO, raw: '+12' }), { status: 'invalid' })
  assert.deepEqual(phoneFieldValidity({ iso: OTHER_COUNTRY_ISO, raw: ' ' }), { status: 'empty' })
})

test('typing format follows the country', () => {
  const ma = findPhoneCountry('MA')
  const be = findPhoneCountry('BE')
  const us = findPhoneCountry('US')
  assert.equal(formatNationalInput(ma, '0612345678'), '06 12 34 56 78')
  assert.equal(formatNationalInput(ma, '612345678'), '6 12 34 56 78')
  assert.equal(formatNationalInput(ma, '061'), '06 1')
  assert.equal(formatNationalInput(ma, '0'), '0')
  assert.equal(formatNationalInput(be, '0470123456'), '0470 12 34 56')
  assert.equal(formatNationalInput(us, '2015550123'), '201 555 0123')
  assert.equal(formatNationalInput(ma, '06123456789999'), '06 12 34 56 78 9999')
  assert.equal(phonePlaceholder(ma), '06 12 34 56 78')
  assert.equal(phonePlaceholder(findPhoneCountry('ES')), '612 34 56 78')
})

test('pasting an international number switches the country', () => {
  assert.deepEqual(parseInternationalInput('+32 470 12 34 56', 'MA'), { iso: 'BE', raw: '470123456' })
  assert.deepEqual(parseInternationalInput('0033 6 12 34 56 78', 'MA'), { iso: 'FR', raw: '612345678' })
  assert.deepEqual(parseInternationalInput('+212 (0) 6 12 34 56 78', 'FR'), { iso: 'MA', raw: '612345678' })
  assert.deepEqual(parseInternationalInput('+1 514 555 0123', 'CA'), { iso: 'CA', raw: '5145550123' })
  assert.deepEqual(parseInternationalInput('+1 514 555 0123', 'MA'), { iso: 'US', raw: '5145550123' })
  assert.deepEqual(parseInternationalInput('+7 912 345 67 89', 'MA'), { iso: OTHER_COUNTRY_ISO, raw: '+79123456789' })
  assert.equal(parseInternationalInput('06 12 34 56 78', 'MA'), null)
  assert.deepEqual(phoneFieldFromE164('+33612345678'), { iso: 'FR', raw: '612345678' })
  assert.deepEqual(phoneFieldFromE164('garbage'), { iso: 'MA', raw: '' })
})

test('search works by name in any language, without accents, or by dial code', () => {
  const isos = (q, lang = 'fr') => searchPhoneCountries(q, lang).map(country => country.iso)
  assert.deepEqual(isos('belg'), ['BE'])
  assert.deepEqual(isos('etats'), ['US'])
  assert.deepEqual(isos('Germany'), ['DE'])
  assert.deepEqual(isos('فرنسا', 'ar'), ['FR'])
  assert.deepEqual(isos('+33'), ['FR'])
  assert.deepEqual(isos('212'), ['MA'])
  assert.deepEqual(isos('+1').sort(), ['CA', 'US'])
  assert.equal(isos('').length, PHONE_COUNTRIES.length)
  assert.equal(isos('zzzz').length, 0)
  assert.equal(countryName(findPhoneCountry('MA'), 'ar'), 'المغرب')
  assert.equal(countryName(findPhoneCountry('MA'), 'de'), 'Maroc')
})

test('flags come from the ISO code', () => {
  assert.equal(flagOf('MA'), '🇲🇦')
  assert.equal(flagOf('BE'), '🇧🇪')
  assert.equal(flagOf(OTHER_COUNTRY_ISO), '🌐')
})
