const assert = require('node:assert/strict')
const config = require('../config')
const { SelfCheckinApiError, selfCheckinApi } = require('../utils/self-checkin-api')

async function run() {
  const originalWx = global.wx
  config.cloudbasePublishableKey = 'test-publishable'
  let requestOptions
  let responseData
  const englishRules = {
    locale: 'en-US',
    confirmLabel: 'I have read and understood',
    signatureTitle: 'Please provide your signature',
    signatureHint: 'Your signature will be saved with the rules.',
    clearLabel: 'Clear signature',
    items: [{ id: 'no-smoking', title: 'Smoke only in the designated area', body: 'Smoking is prohibited indoors.' }],
  }
  global.wx = {
    request(options) {
      requestOptions = options
      options.success({ statusCode: 200, data: responseData })
    },
  }
  responseData = [{ store_id: 'sifang', rules_locale: englishRules }]

  try {
    const context = await selfCheckinApi.getPublicEntryContext('en-US')
    assert.match(requestOptions.url, /get_self_checkin_public_entry_context$/)
    assert.deepEqual(requestOptions.data, { p_locale: 'en-US' })
    assert.equal(context.rules_locale.locale, 'en-US')
    assert.equal(context.rules_locale.items[0].title, englishRules.items[0].title)
    assert.equal(context.rules_locale.confirmLabel, englishRules.confirmLabel)
    assert.equal(context.rules_locale.signatureTitle, englishRules.signatureTitle)
    assert.equal(context.rules_locale.signatureHint, englishRules.signatureHint)
    assert.equal(context.rules_locale.clearLabel, englishRules.clearLabel)

    responseData = { state: 'active', context: { id: 'test-id', token: 'test-token', rules_locale: englishRules } }
    const accessCodeContext = await selfCheckinApi.getPublicContextByAccessCode('123456', 'en-US')
    assert.match(requestOptions.url, /lookup_self_checkin_public_context_by_access_code$/)
    assert.deepEqual(requestOptions.data, { p_access_code: '123456', p_locale: 'en-US' })
    assert.equal(accessCodeContext.context.rules_locale.locale, 'en-US')

    responseData = [{ store_id: 'sifang', rules_locale: { ...englishRules, locale: 'zh-CN' } }]
    await assert.rejects(selfCheckinApi.getPublicEntryContext('en-US'), (error) => (
      error instanceof SelfCheckinApiError && error.kind === 'rules'
    ))

    responseData = { state: 'expired', message: '该入住码已失效' }
    const expired = await selfCheckinApi.getPublicContextByAccessCode('123456', 'en-US')
    assert.deepEqual(expired, { state: 'expired', message: '该入住码已失效' })
    assert.match(requestOptions.url, /lookup_self_checkin_public_context_by_access_code$/)

    responseData = { state: 'active', context: { id: 'test-id', token: 'test-token', rules_locale: { ...englishRules, locale: 'zh-CN' } } }
    await assert.rejects(selfCheckinApi.getPublicContextByAccessCode('123456', 'en-US'), (error) => (
      error instanceof SelfCheckinApiError && error.kind === 'rules'
    ))
  } finally {
    global.wx = originalWx
    config.cloudbasePublishableKey = ''
  }

  console.log('self-check-in localized rules assertions passed')
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
