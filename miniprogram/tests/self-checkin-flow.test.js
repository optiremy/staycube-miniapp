const assert = require('node:assert/strict')
const {
  normalizeAccessCode,
  normalizeRules,
  validateSelfCheckinStep,
  buildSelfCheckinPayload,
} = require('../utils/self-checkin-flow')

assert.equal(normalizeAccessCode(' 12a34567 '), '123456')
assert.equal(normalizeAccessCode('12345'), '12345')
assert.throws(() => normalizeRules({ items: [] }), /rules/)
assert.deepEqual(normalizeRules({ items: [{ id: 'r1', title: 'T', body: 'B' }] }).items.length, 1)

const state = {
  form: { guest_name: 'Guest', contact: '13900001234', guest_note: '', police_code: '123456', police_completed_confirmed: true },
  rules: { version: 'v1', items: [{ id: 'r1', title: 'Title', body: 'Body' }] },
  confirmedRuleIds: ['r1'],
  rulesFinalConfirmed: true,
  signaturePath: 'self-checkin/record/signature-1.png',
  passportPath: 'self-checkin-documents/record/passport-1.jpg',
  visaOrEntryPath: 'self-checkin-documents/record/visa-or-entry-1.jpg',
  depositProofPath: 'self-checkin-documents/record/deposit-1.jpg',
}
assert.equal(validateSelfCheckinStep(3, 'mainland_id', state), '')
assert.equal(validateSelfCheckinStep(0, 'mainland_id', { ...state, form: { ...state.form, contact: '12345678901' } }), 'contactPhone')
for (const phone of ['1380013800', '138001380000', '13800a38000']) {
  assert.equal(validateSelfCheckinStep(0, 'mainland_id', { ...state, form: { ...state.form, contact: phone } }), 'contactPhone')
}
assert.equal(validateSelfCheckinStep(0, 'mainland_id', { ...state, form: { ...state.form, contact: '13800138000' } }), '')
assert.equal(validateSelfCheckinStep(0, 'mainland_id', { ...state, form: { ...state.form, guest_name: ' ', contact: '13800138000' } }), 'guestNameMissing')
assert.equal(validateSelfCheckinStep(0, 'passport', { ...state, form: { ...state.form, contact: '+1 202 555 0100' } }), '')
assert.equal(validateSelfCheckinStep(3, 'passport', { ...state, passportPath: '' }), 'foreignDocuments')
assert.equal(validateSelfCheckinStep(4, 'mainland_id', { ...state, paymentChannel: 'wechat', paymentStatus: 'pending' }), 'depositPayment')
assert.equal(validateSelfCheckinStep(4, 'mainland_id', { ...state, paymentChannel: 'wechat', paymentStatus: 'paid', depositProofPath: '' }), '')
assert.equal(validateSelfCheckinStep(4, 'mainland_id', { ...state, paymentChannel: 'other', depositProofPath: '' }), 'depositProof')
// 证件类型与界面语言无关：中文界面也可以走护照，英文界面也可以走公安登记。
assert.equal(validateSelfCheckinStep(3, '', state), 'documentType')
assert.equal(validateSelfCheckinStep(3, 'passport', { ...state, passportPath: '' }), 'foreignDocuments')
assert.equal(validateSelfCheckinStep(0, 'passport', { ...state, form: { ...state.form, country_code: '+44', contact: '7700900123' } }), '')
assert.equal(validateSelfCheckinStep(0, 'passport', { ...state, form: { ...state.form, country_code: '+86', contact: '7700900123' } }), 'contactPhone')
const englishMainland = buildSelfCheckinPayload({ ...state, documentType: 'mainland_id' }, 'en-US')
assert.equal(englishMainland.document_type, 'mainland_id')
assert.equal(englishMainland.police_code, '123456')
assert.equal(englishMainland.passport_photo_path, undefined)
const chinesePassport = buildSelfCheckinPayload({ ...state, documentType: 'passport', form: { ...state.form, country_code: '+44', contact: '7700900123' } }, 'zh-CN')
assert.equal(chinesePassport.police_code, '')
assert.equal(chinesePassport.passport_photo_path, state.passportPath)
assert.equal(chinesePassport.contact, '+44 7700900123')
assert.equal(chinesePassport.phone_last4, '0123')
const payload = buildSelfCheckinPayload({ ...state, documentType: 'mainland_id' }, 'zh-CN')
assert.equal(payload.deposit_confirmed_by_guest, true)
assert.equal(payload.police_code, '123456')
assert.equal(payload.confirmed_rules[0].text, 'Title\nBody')
assert.equal(payload.passport_photo_path, undefined)
assert.equal(payload.payment_channel, 'other')
const nativePayload = buildSelfCheckinPayload({ ...state, paymentChannel: 'wechat' }, 'zh-CN')
assert.equal(nativePayload.deposit_proof_path, null)
assert.equal(nativePayload.payment_channel, 'wechat')
console.log('self-check-in flow assertions passed')
