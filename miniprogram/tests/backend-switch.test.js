// 默认腾讯云正式环境；旅客数据、存储和云函数都直连所选后端，不经任何中转。wx 为离线模拟对象。
const assert = require('assert')
const config = require('../config')
const testMode = require('../utils/test-mode')
const { requestGuest, uploadGuestFile } = require('../utils/guest-transport')
const { specialCancellationApi } = require('../utils/special-cancellation-api')

const gateway = 'https://env-test.api.tcloudbasegateway.com'
const fnUrl = name => `${gateway}/v1/functions/${name}`
const fnResult = (statusCode, body) => ({ statusCode: 200, data: { statusCode, headers: {}, body: JSON.stringify(body), isBase64Encoded: false } })
const original = { backend: config.backend, cloudbaseEnvId: config.cloudbaseEnvId, cloudbasePublishableKey: config.cloudbasePublishableKey }

function mockWx(answer) {
  const calls = []
  global.wx = {
    request(options) { calls.push({ kind: 'request', ...options }); const result = answer(options); result.fail ? options.fail(result.fail) : options.success(result) },
    uploadFile(options) { calls.push({ kind: 'upload', ...options }); options.success({ statusCode: 200, data: '{}' }) },
    getFileSystemManager() { return { readFile({ success }) { success({ data: new ArrayBuffer(4) }) } } },
  }
  return calls
}

async function run() {
  testMode.enabled = false
  const originalWx = global.wx

  // ---- 显式 Supabase 模式：仅供旧环境回归 ----
  assert.strictEqual(config.backend, 'cloudbase', 'config.js 默认必须是 cloudbase')
  assert.strictEqual(config.cloudbaseEnvId, 'staycube-prod-d0g2d759v95954cd6')
  assert.strictEqual(JSON.parse(Buffer.from(config.cloudbasePublishableKey.split('.')[1], 'base64url')).aud, config.cloudbaseEnvId)
  config.cloudbasePublishableKey = ''
  let calls = mockWx(() => ({ statusCode: 200, data: [] }))
  await assert.rejects(requestGuest('/rest/v1/rpc/submit_pre_arrival_v2', {}), /CLOUDBASE_PUBLISHABLE_KEY_MISSING/)
  assert.strictEqual(calls.length, 0, '未配置正式环境公开钥匙时不能发送任何请求')
  config.cloudbasePublishableKey = original.cloudbasePublishableKey
  config.backend = 'supabase'
  calls = mockWx(() => ({ statusCode: 200, data: [] }))
  await requestGuest('/rest/v1/rpc/get_luggage_storage_public_context', {})
  assert.strictEqual(calls[0].url, `${config.supabaseUrl}/rest/v1/rpc/get_luggage_storage_public_context`)
  assert.strictEqual(calls[0].header.apikey, config.publishableKey)
  assert.strictEqual(calls[0].header.Authorization, `Bearer ${config.publishableKey}`)
  calls = mockWx(() => ({ statusCode: 200, data: { status: 'pending' } }))
  await requestGuest('/functions/v1/self-checkin-payment/status', { token: 't' })
  assert.strictEqual(calls[0].url, `${config.supabaseUrl}/functions/v1/self-checkin-payment/status`, 'Supabase 模式函数仍直连')

  // ---- 腾讯云模式 ----
  Object.assign(config, { backend: 'cloudbase', cloudbaseEnvId: 'env-test', cloudbasePublishableKey: 'cb-publishable' })
  try {
    calls = mockWx(() => ({ statusCode: 200, data: [] }))
    await requestGuest('/rest/v1/rpc/submit_pre_arrival_v2', { p_request_id: 'r' })
    assert.strictEqual(calls[0].url, `${gateway}/v1/rdb/rest/rpc/submit_pre_arrival_v2`)
    assert.strictEqual(calls[0].header.Authorization, 'Bearer cb-publishable')
    assert.strictEqual(calls[0].header.apikey, undefined)

    for (const name of ['submit_self_checkin_record', 'submit_luggage_storage_record', 'submit_pre_arrival_v2', 'save_special_cancellation_guest', 'submit_special_cancellation_guest', 'submit_special_cancellation_supplement']) {
      calls = mockWx(() => ({ statusCode: 200, data: {} }))
      await requestGuest(`/rest/v1/rpc/${name}`, {})
      assert.strictEqual(calls.length, 1)
      assert.strictEqual(calls[0].url, `${gateway}/v1/rdb/rest/rpc/${name}`)
    }

    calls = mockWx(() => ({ statusCode: 200, data: '{}' }))
    await uploadGuestFile('luggage-storage-photos', 'luggage-storage/a/photo-1.jpg', '/tmp/p.jpg', 'image/jpeg')
    assert.strictEqual(calls[0].url, `${gateway}/v1/storages/object/luggage-storage-photos/luggage-storage/a/photo-1.jpg`)
    assert.strictEqual(calls[0].header.Authorization, 'Bearer cb-publishable')

    // 云函数：POST <网关>/v1/functions/<名>，公开钥匙，请求作为事件。
    calls = mockWx(() => fnResult(200, { status: 'pending' }))
    assert.deepStrictEqual(await requestGuest('/functions/v1/self-checkin-payment/create', { token: 't', loginCode: 'c' }), { status: 'pending' })
    assert.strictEqual(calls.length, 1)
    assert.strictEqual(calls[0].url, fnUrl('self-checkin-payment'))
    assert.strictEqual(calls[0].header.Authorization, 'Bearer cb-publishable')
    assert.strictEqual(calls[0].data.path, '/self-checkin-payment/create')
    assert.deepStrictEqual(JSON.parse(calls[0].data.body), { token: 't', loginCode: 'c' })

    // 网关异常时直接报错，不回退到其他站点。
    calls = mockWx(() => ({ statusCode: 503, data: { message: 'unavailable' } }))
    await assert.rejects(requestGuest('/rest/v1/rpc/submit_pre_arrival_v2', { p_request_id: 'r' }))
    assert.strictEqual(calls.length, 1)
    assert.strictEqual(calls[0].url, `${gateway}/v1/rdb/rest/rpc/submit_pre_arrival_v2`)

    // 特殊取消：签名和登记走云函数，文件直传腾讯云存储。
    calls = mockWx(options => options.url === fnUrl('special-cancellation-storage')
      ? fnResult(200, JSON.parse(options.data.body).action === 'create_upload' ? { path: 'app/1.jpg', token: 'up-token' } : { attachment: { id: 'att-1', original_name: '1.jpg', mime_type: 'image/jpeg' } })
      : { statusCode: 200, data: {} })
    await specialCancellationApi.uploadAttachment('11111111-1111-4111-8111-111111111111', '654321', { proof_purposes: ['other'], description: '', is_sensitive: false }, { name: '1.jpg', mimeType: 'image/jpeg', size: 4, originalBytes: 4, path: '/tmp/1.jpg' })
    const [create, put, register] = calls
    assert.strictEqual(create.url, fnUrl('special-cancellation-storage'))
    assert.strictEqual(create.data.path, '/special-cancellation-storage')
    assert.strictEqual(put.url, `${gateway}/v1/storages/object/upload/sign/special-cancellation-proofs/app/1.jpg?token=up-token`)
    assert.strictEqual(put.method, 'PUT')
    assert.strictEqual(put.header.Authorization, 'Bearer cb-publishable')
    assert.strictEqual(register.url, fnUrl('special-cancellation-storage'))
    assert.ok(calls.every(call => call.url.startsWith(gateway)), '只请求腾讯云网关')
  } finally {
    Object.assign(config, original)
    global.wx = originalWx
    testMode.enabled = true
  }
  console.log('backend switch tests passed')
}

run().catch((error) => { console.error(error); process.exitCode = 1 })
