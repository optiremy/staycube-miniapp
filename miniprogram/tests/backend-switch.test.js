// 默认腾讯云正式环境；四项旅客服务的直连和中转地址均由开关控制。wx 为离线模拟对象。
const assert = require('assert')
const config = require('../config')
const testMode = require('../utils/test-mode')
const { requestGuest, uploadGuestFile } = require('../utils/guest-transport')
const { specialCancellationApi } = require('../utils/special-cancellation-api')

const gateway = 'https://env-test.api.tcloudbasegateway.com'
const relay = config.publicLookupFallbackUrl.replace(/self-checkin-public-lookup$/, 'guest-relay')
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

    // 付款云函数始终经现有中转，不把公开钥匙传给中转。
    calls = mockWx(() => ({ statusCode: 200, data: { status: 'pending' } }))
    await requestGuest('/functions/v1/self-checkin-payment/create', { token: 't', loginCode: 'c' })
    assert.strictEqual(calls.length, 1)
    assert.strictEqual(calls[0].url, relay)
    assert.strictEqual(calls[0].header['x-guest-relay-operation'], 'function:self-checkin-payment:create')
    assert.strictEqual(calls[0].header.Authorization, undefined)

    // 网关异常时只回退到正式 guest-relay。
    calls = mockWx(options => options.url === relay ? { statusCode: 200, data: { status: 'submitted' } } : { statusCode: 503, data: { message: 'unavailable' } })
    await requestGuest('/rest/v1/rpc/submit_pre_arrival_v2', { p_request_id: 'r' })
    assert.strictEqual(calls.length, 2)
    assert.strictEqual(calls[0].url, `${gateway}/v1/rdb/rest/rpc/submit_pre_arrival_v2`)
    assert.strictEqual(calls[1].url, relay)
    assert.strictEqual(calls[1].header['x-guest-relay-operation'], 'rpc:submit_pre_arrival_v2')

    calls = mockWx(options => options.url === relay ? { statusCode: 200, data: {} } : { statusCode: 503, data: { message: 'unavailable' } })
    await requestGuest('/rest/v1/rpc/submit_special_cancellation_guest', {})
    assert.strictEqual(calls[1].url, relay)
    assert.strictEqual(calls[1].header['x-guest-relay-operation'], 'rpc:submit_special_cancellation_guest')

    // 特殊取消：签名和登记经中转，文件直传腾讯云存储。
    calls = mockWx(options => options.url === relay
      ? { statusCode: 200, data: options.data.action === 'create_upload' ? { path: 'app/1.jpg', token: 'up-token' } : { attachment: { id: 'att-1', original_name: '1.jpg', mime_type: 'image/jpeg' } } }
      : { statusCode: 200, data: {} })
    await specialCancellationApi.uploadAttachment('11111111-1111-4111-8111-111111111111', '654321', { proof_purposes: ['other'], description: '', is_sensitive: false }, { name: '1.jpg', mimeType: 'image/jpeg', size: 4, originalBytes: 4, path: '/tmp/1.jpg' })
    const [create, put, register] = calls
    assert.strictEqual(create.url, relay)
    assert.strictEqual(create.header['x-guest-relay-operation'], 'function:special-cancellation-storage')
    assert.strictEqual(put.url, `${gateway}/v1/storages/object/upload/sign/special-cancellation-proofs/app/1.jpg?token=up-token`)
    assert.strictEqual(put.method, 'PUT')
    assert.strictEqual(put.header.Authorization, 'Bearer cb-publishable')
    assert.strictEqual(register.url, relay)
    assert.ok(calls.every(call => !/tcloudbase\.com\//.test(call.url) || call.url.startsWith(gateway)), '不使用默认域名路由')
  } finally {
    Object.assign(config, original)
    global.wx = originalWx
    testMode.enabled = true
  }
  console.log('backend switch tests passed')
}

run().catch((error) => { console.error(error); process.exitCode = 1 })
