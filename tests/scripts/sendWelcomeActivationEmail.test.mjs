import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const { message, BODY, SUBJECT } = createRequire(import.meta.url)('../../scripts/sendWelcomeActivationEmail.js')
test('approved body is personalized without additions and recipients are private', () => {
  const result = message('fixture@example.invalid')
  assert.equal(result.text, BODY.replace('{{email}}', 'fixture@example.invalid'))
  assert.equal(result.text.includes('{{email}}'), false)
  assert.deepEqual(result.to, ['fixture@example.invalid'])
  assert.equal(result.cc, undefined)
  assert.equal(result.bcc, undefined)
  assert.equal(result.reply_to, 'contact@mojammaa.com')
  assert.equal(result.subject, SUBJECT)
  assert.match(result.html, /lang="ar" dir="rtl"/)
})
test('recipient input cannot create HTML or header injection', () => {
  assert.throws(() => message('user@example.com\nBcc: other@example.com'))
  const result = message('<tag>@example.invalid')
  assert.ok(!result.html.includes('<tag>'))
  assert.ok(result.html.includes('&lt;tag&gt;'))
})
