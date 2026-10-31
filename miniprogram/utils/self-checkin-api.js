const testMode = require('./test-mode')
const { normalizeRules } = require('./self-checkin-flow')
const { requestGuest, uploadGuestFile } = require('./guest-transport')

class SelfCheckinApiError extends Error {
  constructor(kind, message, statusCode) {
    super(message)
    this.kind = kind
    this.statusCode = statusCode || 0
  }
}

function request(path, data, timeout = 12000) {
  return requestGuest(path, data, timeout).catch(error => {
    if (error instanceof SelfCheckinApiError) throw error
    throw new SelfCheckinApiError(error.kind || 'service', error.message || '请求失败', error.statusCode || 0)
  })
}

function upload(bucket, path, filePath) {
  return uploadGuestFile(bucket, path, filePath, bucket === 'checkin-signatures' ? 'image/png' : 'image/jpeg').catch(error => {
    throw new SelfCheckinApiError(error.kind || 'upload', error.message || '文件上传失败', error.statusCode || 0)
  })
}

function normalizeRulesForLocale(value, locale) {
  const rules = normalizeRules(value)
  if (rules.locale !== locale) throw new SelfCheckinApiError('rules', `rules locale mismatch: ${rules.locale || 'missing'}`)
  return rules
}

const selfCheckinApi = {
  async getPublicEntryContext(locale) {
    const data = await request('/rest/v1/rpc/get_self_checkin_public_entry_context', { p_locale: locale })
    const row = Array.isArray(data) ? data[0] : data
    if (!row || !row.rules_locale) throw new SelfCheckinApiError('service', 'invalid public entry context')
    try {
      row.rules_locale = normalizeRulesForLocale(row.rules_locale, locale)
    } catch {
      throw new SelfCheckinApiError('rules', 'invalid rules context')
    }
    return { ...row, locale }
  },

  async getPublicContextByAccessCode(accessCode, locale) {
    const body = {
      p_access_code: accessCode,
      p_locale: locale,
    }
    const data = await request('/rest/v1/rpc/lookup_self_checkin_public_context_by_access_code', body)
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new SelfCheckinApiError('service', 'invalid public context')
    if (data.state === 'not_found') return { state: 'not_found' }
    if (data.state === 'expired') return { state: 'expired', message: '该入住码已失效' }
    const row = data.context
    if (data.state !== 'active' || !row || typeof row.id !== 'string' || typeof row.token !== 'string') throw new SelfCheckinApiError('service', 'invalid public context')
    try {
      row.rules_locale = normalizeRulesForLocale(row.rules_locale, locale)
    } catch {
      throw new SelfCheckinApiError('rules', 'invalid rules context')
    }
    return { state: 'active', context: row }
  },

  uploadGuestSignature(recordId, filePath, uploadId = Date.now()) {
    if (testMode.enabled) return Promise.resolve(`test-only/${recordId}/signature.png`)
    const path = `self-checkin/${recordId}/signature-${uploadId}.png`
    return upload('checkin-signatures', path, filePath, 'image/png')
  },

  uploadGuestForeignDocument(recordId, kind, filePath, uploadId = Date.now()) {
    if (testMode.enabled) return Promise.resolve(`test-only/${recordId}/${kind}.jpg`)
    const path = `self-checkin-documents/${recordId}/${kind}-${uploadId}.jpg`
    return upload('self-checkin-documents', path, filePath, 'image/jpeg')
  },

  uploadGuestDepositProof(recordId, filePath, uploadId = Date.now()) {
    if (testMode.enabled) return Promise.resolve(`test-only/${recordId}/deposit.jpg`)
    const path = `self-checkin-documents/${recordId}/deposit-${uploadId}.jpg`
    return upload('self-checkin-documents', path, filePath, 'image/jpeg')
  },


  submitGuest(token, payload) {
    if (testMode.enabled) return Promise.resolve({ id: 'test-self-checkin', status: 'test_completed' })
    return request('/rest/v1/rpc/submit_self_checkin_record', {
      p_token: token,
      p_payload: payload,
    }, 20000).catch(async error => {
      const data = await request('/rest/v1/rpc/get_self_checkin_submission_status', { p_token: token }).catch(() => null)
      const row = Array.isArray(data) ? data[0] : data
      if (row && row.status === 'submitted' && row.id && row.signature_record_id) return row
      throw error
    })
  },
}

module.exports = { SelfCheckinApiError, selfCheckinApi }
