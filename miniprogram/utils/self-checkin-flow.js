const { isValidPhone, formatPhone, parsePhone } = require('./phone-input')

const DOCUMENT_TYPES = ['mainland_id', 'passport']

// 表单有 country_code 时用它；旧草稿只有完整号码时从号码解析。
function phoneOf(form) {
  return form.country_code ? { countryCode: form.country_code, number: form.contact } : parsePhone(form.contact)
}

function normalizeAccessCode(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 6)
}

function normalizeRules(value) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.items) || !value.items.length) throw new Error('rules')
  const valid = value.items.every((item) => item && typeof item.id === 'string' && item.id.trim() && typeof item.title === 'string' && typeof item.body === 'string' && item.body.trim())
  if (!valid) throw new Error('rules')
  return {
    ...value,
    locale: typeof value.locale === 'string' ? value.locale : '',
    languageName: typeof value.languageName === 'string' ? value.languageName : '',
    version: typeof value.version === 'string' ? value.version : '',
    title: typeof value.title === 'string' ? value.title : '',
    intro: typeof value.intro === 'string' ? value.intro : '',
    confirmLabel: typeof value.confirmLabel === 'string' ? value.confirmLabel : '',
    backLabel: typeof value.backLabel === 'string' ? value.backLabel : '',
    signatureTitle: typeof value.signatureTitle === 'string' ? value.signatureTitle : '',
    signatureHint: typeof value.signatureHint === 'string' ? value.signatureHint : '',
    clearLabel: typeof value.clearLabel === 'string' ? value.clearLabel : '',
    submitLabel: typeof value.submitLabel === 'string' ? value.submitLabel : '',
    completedTitle: typeof value.completedTitle === 'string' ? value.completedTitle : '',
    completedMessage: typeof value.completedMessage === 'string' ? value.completedMessage : '',
  }
}

function isSixDigitCode(value) {
  return /^[0-9]{6}$/.test(value)
}

// 证件类型（而非界面语言）决定公安登记或护照上传。
function validateSelfCheckinStep(step, documentType, state) {
  const form = state.form || {}
  if (step === 0 && !String(form.guest_name || '').trim()) return 'guestNameMissing'
  if (step === 0 && !String(form.contact || '').trim()) return 'basicInfo'
  if (step === 0 && !isValidPhone(phoneOf(form).countryCode, phoneOf(form).number)) return 'contactPhone'
  if (step === 1 && (!state.rules || !state.rules.items.every((rule) => (state.confirmedRuleIds || []).includes(rule.id)))) return 'rules'
  if (step === 2 && (!state.rulesFinalConfirmed || !state.signaturePath)) return 'signature'
  if (step === 3 && !DOCUMENT_TYPES.includes(documentType)) return 'documentType'
  if (step === 3 && documentType === 'mainland_id' && !isSixDigitCode(String(form.police_code || ''))) return 'policeCode'
  if (step === 3 && documentType === 'mainland_id' && !form.police_completed_confirmed) return 'policeComplete'
  if (step === 3 && documentType === 'passport' && (!state.passportPath || !state.visaOrEntryPath)) return 'foreignDocuments'
  if (step === 4 && state.paymentChannel === 'wechat' && state.paymentStatus !== 'paid') return 'depositPayment'
  if (step === 4 && state.paymentChannel !== 'wechat' && !state.depositProofPath) return 'depositProof'
  return ''
}

function resolvePhoneLast4(explicitLast4, contact) {
  const known = String(explicitLast4 || '').trim()
  if (/^\d{4}$/.test(known)) return known
  const value = String(contact || '').trim()
  if (!value || /[a-z]/i.test(value) || value.includes('@')) return null
  const normalized = value.replace(/[\s()\-]/g, '')
  const mainland = normalized.replace(/^(?:\+86|0086)/, '')
  if (/^1[3-9]\d{9}$/.test(mainland)) return mainland.slice(-4)
  if (normalized.startsWith('+') && /^\d{7,15}$/.test(normalized.slice(1))) return normalized.slice(-4)
  return null
}

function buildSelfCheckinPayload(state, locale, phoneLast4) {
  const form = state.form || {}
  const rules = state.rules
  const mainlandId = state.documentType === 'mainland_id'
  const phone = phoneOf(form)
  const contact = formatPhone(phone.countryCode, phone.number)
  return {
    locale,
    document_type: state.documentType,
    guest_name: String(form.guest_name || '').trim(),
    contact,
    phone_last4: resolvePhoneLast4(phoneLast4, contact),
    guest_note: String(form.guest_note || '').trim(),
    police_code: mainlandId ? String(form.police_code || '').trim() : '',
    police_completed_confirmed: mainlandId && Boolean(form.police_completed_confirmed),
    deposit_confirmed_by_guest: true,
    payment_channel: state.paymentChannel === 'wechat' ? 'wechat' : 'other',
    deposit_proof_path: state.paymentChannel === 'wechat' ? null : state.depositProofPath,
    confirmed_rules: rules.items.map((rule) => ({
      id: rule.id,
      text: `${rule.title}\n${rule.body}`,
      confirmed: (state.confirmedRuleIds || []).includes(rule.id),
    })),
    signature_storage_path: state.signaturePath,
    ...(mainlandId ? {} : {
      passport_photo_path: state.passportPath,
      visa_or_entry_photo_path: state.visaOrEntryPath,
    }),
  }
}

module.exports = {
  DOCUMENT_TYPES,
  normalizeAccessCode,
  normalizeRules,
  isSixDigitCode,
  validateSelfCheckinStep,
  resolvePhoneLast4,
  buildSelfCheckinPayload,
}

