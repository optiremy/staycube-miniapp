const assert = require('node:assert/strict')
const copyData = require('../data/luggage-storage-copy')

let definition
global.Page = (value) => { definition = value }
const modulePath = require.resolve('../pages/luggage-storage/index')
delete require.cache[modulePath]
require(modulePath)

assert.equal(copyData.locales['zh-CN'].editLabel, '完成寄存')
assert.ok(Object.values(copyData.locales).every((copy) => copy.editLabel), 'all locales have a completion action')

const page = {
  ...definition,
  data: {
    ...definition.data,
    locale: 'zh-CN',
    text: copyData.locales['zh-CN'],
    errorCopy: copyData.errorCopy['zh-CN'],
    form: {
      guest_name: '张三', contact_method: 'phone', contact: '12345678901', claim_date: '2026-10-21', claim_time: '10:00',
      fee_acknowledged: true, claim_hours_acknowledged: true, unclaimed_policy_acknowledged: true,
      no_valuables_acknowledged: true, privacy_accepted: true,
    },
    today: '2026-10-21',
    photoPath: '/tmp/luggage.jpg',
  },
  setData(changes) { this.data = { ...this.data, ...changes } },
}

assert.equal(page.validate(), '请输入有效的11位手机号。')
for (const phone of ['1380013800', '138001380000', '13800a38000', '12345678901']) {
  page.data.form.contact = phone
  assert.equal(page.validate(), '请输入有效的11位手机号。')
}
page.data.form.contact = '13800138000'
assert.equal(page.validate(), '')

const navigations = []
const chooseCalls = []
global.wx = {
  reLaunch(options) { navigations.push(options.url) },
  chooseImage(options) { chooseCalls.push(options) },
  showLoading() {},
  hideLoading() {},
}
page.editRegistration()
assert.deepEqual(navigations, ['/pages/home/index'])

async function verifyFailedReplacementPreservesPhoto() {
  page.data.photoProcessing = false
  page.data.submitting = false
  page.data.photoPath = '/tmp/previous.jpg'
  page.data.errorText = ''
  page._context = { maxPhotoBytes: 1_048_576 }
  page.getPhotoCanvas = async () => { throw new Error('image-processing-failed') }
  page.choosePhoto()
  assert.deepEqual(chooseCalls[0].sizeType, ['compressed'])
  await chooseCalls[0].success({ tempFilePaths: ['/tmp/new.heic'] })
  assert.equal(page.data.photoPath, '/tmp/previous.jpg')
  assert.equal(page.data.errorText, copyData.errorCopy['zh-CN'].photo)
  assert.equal(page.messageFor(new Error('image-too-large'), 'fallback'), copyData.errorCopy['zh-CN'].photo)
}

verifyFailedReplacementPreservesPhoto().then(() => {
  delete global.wx
  delete global.Page
  console.log('luggage storage flow tests passed')
}).catch((error) => {
  console.error(error)
  process.exitCode = 1
})
