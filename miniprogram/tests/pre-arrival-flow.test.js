const assert = require('assert')
const fs = require('fs')
const path = require('path')
const { arrivalNotice, validatePreArrival } = require('../utils/pre-arrival-flow')
const { HOSTEL, openHostelLocation } = require('../utils/pre-arrival-map')
const copyData = require('../data/pre-arrival-copy')

const valid = {
  locale: 'zh-CN',
  guestName: '张三',
  contactMethod: 'phone',
  contactValue: '13800138000',
  arrivalTime: '18:00',
  bedPreference: 'all',
  guestNote: '',
}

assert.strictEqual(arrivalNotice('05:59'), 'late')
assert.strictEqual(arrivalNotice('06:00'), 'early')
assert.strictEqual(arrivalNotice('09:59'), 'early')
assert.strictEqual(arrivalNotice('10:00'), null)
assert.strictEqual(arrivalNotice('22:29'), null)
assert.strictEqual(arrivalNotice('22:30'), 'late')

assert.strictEqual(validatePreArrival(valid), '')
assert.match(validatePreArrival({ ...valid, contactValue: '1380013800' }), /11位/)
assert.match(validatePreArrival({ ...valid, contactValue: '138001380000' }), /11位/)
assert.match(validatePreArrival({ ...valid, contactValue: '13800a38000' }), /11位/)
assert.match(validatePreArrival({ ...valid, contactValue: '12345678901' }), /11位/)
assert.strictEqual(validatePreArrival({ ...valid, contactValue: '13800138000' }), '')
assert.strictEqual(validatePreArrival({ ...valid, locale: 'en-US', contactValue: '+1 202 555 0100' }), '')
assert.match(validatePreArrival({ ...valid, guestName: '  ' }), /姓名/)
assert.match(validatePreArrival({ ...valid, arrivalTime: '25:80' }), /到达时间/)
assert.match(validatePreArrival({ ...valid, contactValue: 'abc' }), /手机号/)
assert.match(validatePreArrival({ ...valid, locale: 'en-US', contactMethod: 'email', contactValue: 'not-an-email' }), /邮箱/)
assert.match(validatePreArrival({ ...valid, bedPreference: 'window' }), /床位偏好/)

assert.deepStrictEqual(Object.keys(copyData.locales).sort(), copyData.supportedLanguages.map((item) => item.locale).sort())
copyData.supportedLanguages.forEach(({ locale }) => {
  const copy = copyData.locales[locale]
  ;['title', 'name', 'contact', 'arrival', 'bed', 'submit', 'success', 'earlyTitle', 'lateTitle', 'guideTitle', 'mapTitle', 'destinationAddress', 'mapPrompt', 'openMap', 'mapOpenFailed', 'uncertain'].forEach((key) => assert.ok(copy[key], `${locale} is missing ${key}`))
})

assert.ok(Math.abs(HOSTEL.latitude - 34.233516) < 0.00001, 'hostel latitude should be converted from BD-09 to GCJ-02')
assert.ok(Math.abs(HOSTEL.longitude - 108.947541) < 0.00001, 'hostel longitude should be converted from BD-09 to GCJ-02')
assert.strictEqual(HOSTEL.address, '西安市碑林区长安北路21号长安大厦A座')
const resultMarkup = fs.readFileSync(path.join(__dirname, '../pages/pre-arrival/index.wxml'), 'utf8')
assert.match(resultMarkup, /bindtap="openMap"/)
assert.match(resultMarkup, /\{\{text\.openMap\}\}/)
assert.doesNotMatch(resultMarkup, /<map\s|route-modes|planRoute/)
async function verifyLocationOpening() {
  let openedLocation
  await openHostelLocation({ openLocation(options) { openedLocation = options; options.success() } })
  assert.strictEqual(openedLocation.latitude, HOSTEL.latitude)
  assert.strictEqual(openedLocation.longitude, HOSTEL.longitude)
  assert.strictEqual(openedLocation.name, HOSTEL.name)
  assert.strictEqual(openedLocation.address, HOSTEL.address)
  assert.strictEqual(openedLocation.scale, 18)
  await assert.rejects(openHostelLocation({ openLocation(options) { options.fail(new Error('open failed')) } }), /open failed/)
}

verifyLocationOpening().then(() => console.log('pre-arrival flow tests passed')).catch((error) => {
  console.error(error)
  process.exitCode = 1
})
