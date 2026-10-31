// 后端开关（utils/backend.js）：默认 Supabase 与现状一致；腾讯云模式下地址改写与网页
// （stayCube 仓库 src/lib/backend.ts）相同，函数调用只经 guest-relay。离线运行，wx 为模拟对象。
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

  // ---- 默认（Supabase）：地址与请求头与现状相同 ----
  assert.strictEqual(config.backend, 'supabase', 'config.js 默认必须是 supabase')
  let calls = mockWx(() => ({ statusCode: 200, data: [] }))
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

    calls = mockWx(() => ({ statusCode: 200, data: '{}' }))
    await uploadGuestFile('luggage-storage-photos', 'luggage-storage/a/photo-1.jpg', '/tmp/p.jpg', 'image/jpeg')
    assert.strictEqual(calls[0].url, `${gateway}/v1/storages/object/luggage-storage-photos/luggage-storage/a/photo-1.jpg`)
    assert.strictEqual(calls[0].header.Authorization, 'Bearer cb-publishable')

    // 付款：不直连网关，直接走中转，带操作名，不带任何钥匙。
    calls = mockWx(() => ({ statusCode: 200, data: { status: 'pending' } }))
    await requestGuest('/functions/v1/self-checkin-payment/create', { token: 't', loginCode: 'c' })
    assert.strictEqual(calls.length, 1)
    assert.strictEqual(calls[0].url, relay)
    assert.strictEqual(calls[0].header['x-guest-relay-operation'], 'function:self-checkin-payment:create')
    assert.strictEqual(calls[0].header.Authorization, undefined)

    // 特殊取消附件：函数经中转，签名上传直连网关存储。
    calls = mockWx((options) => {
      if (options.url === relay) {
        const action = options.data.action
        return { statusCode: 200, data: action === 'create_upload' ? { path: 'app/1.jpg', token: 'up-token' } : { attachment: { id: 'att-1', original_name: '1.jpg', mime_type: 'image/jpeg' } } }
      }
      return { statusCode: 200, data: {} }
    })
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
