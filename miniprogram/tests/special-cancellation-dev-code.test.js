const assert = require('node:assert/strict')

async function run() {
  const requests = []
  let envVersion = 'release'
  global.wx = {
    getAccountInfoSync: () => ({ miniProgram: { envVersion } }),
    request(options) { requests.push(options.url); options.success({ statusCode: 200, data: [] }) },
  }
  const { specialCancellationApi } = require('../utils/special-cancellation-api')

  // 正式版 / 体验版：开发码按普通申请码请求服务端，不返回示例数据
  assert.equal(await specialCancellationApi.getByAccessCode('123456'), null)
  assert.equal(requests.length, 1)

  // 开发版：返回本地示例数据，后续保存、上传、提交都不请求服务端
  envVersion = 'develop'
  const item = await specialCancellationApi.getByAccessCode('123456')
  assert.equal(item.status, 'awaiting_guest')
  await specialCancellationApi.saveGuest(item.id, '123456', { booking_number: 'A1', guest_phone: '13800138000' })
  const attachment = await specialCancellationApi.uploadAttachment(item.id, '123456', { proof_purposes: ['supporting'], description: '', is_sensitive: false }, { path: '/tmp/a.jpg', name: 'a.jpg', mimeType: 'image/jpeg', size: 10, originalBytes: 10 })
  assert.equal(attachment.original_name, 'a.jpg')
  const submitted = await specialCancellationApi.submit(item.id, '123456', { booking_number: 'A1', guest_phone: '13800138000' })
  assert.equal(submitted.status, 'pending_review')
  assert.equal(requests.length, 1, 'development codes must not reach the server')
  console.log('special cancellation dev code assertions passed')
}

run().catch(error => { console.error(error); process.exit(1) })
