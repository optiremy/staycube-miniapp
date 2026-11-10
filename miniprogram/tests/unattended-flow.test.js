const assert = require('node:assert/strict')

// 早到自助寄存：核对小程序实际发出的请求字段与页面状态切换（模拟 wx 与服务端应答）。
const storage = new Map()
const sent = []
let responder = () => ({ statusCode: 500, data: {} })
let paidByWechat = false
global.wx = {
  getStorageSync: key => storage.get(key) || '',
  setStorageSync: (key, value) => storage.set(key, value),
  removeStorageSync: key => storage.delete(key),
  getAccountInfoSync: () => ({ miniProgram: { envVersion: 'release' } }),
  getRandomValues: ({ length, success }) => success({ randomValues: new Uint8Array(Array.from({ length }, (_, i) => (i * 37) % 256)).buffer }),
  // 云函数经网关 /v1/functions/<名> 调用：请求体是事件，应答是 {statusCode, headers, body}。
  request: ({ url, data, header, success }) => {
    const fn = url.match(/\.api\.tcloudbasegateway\.com\/v1\/functions\/([a-z0-9-]+)$/)
    if (!fn) { sent.push({ url, data, header }); setTimeout(() => success(responder(data, url, {})), 0); return }
    const body = JSON.parse(data.body)
    const op = data.path
    sent.push({ url, data: body, header, op })
    setTimeout(() => {
      const answer = responder(body, url, { op })
      success({ statusCode: 200, data: { statusCode: answer.statusCode, headers: { 'content-type': 'application/json' }, body: JSON.stringify(answer.data) } })
    }, 0)
  },
  login: ({ success }) => success({ code: 'login-code' }),
  requestPayment: ({ success }) => { paidByWechat = true; success({}) },
  setNavigationBarTitle() {},
  showShareMenu() {},
  showModal({ success }) { success({ confirm: true }) },
}
global.getCurrentPages = () => []
let definition
global.Page = value => { definition = value }
require('../pages/unattended/index')
const copy = require('../data/unattended-copy')

function createPage() {
  const page = { ...definition, data: JSON.parse(JSON.stringify(definition.data)) }
  page.setData = function (changes) {
    for (const [key, value] of Object.entries(changes)) {
      const parts = key.split('.')
      let target = this.data
      while (parts.length > 1) { const part = parts.shift(); target[part] = { ...target[part] }; target = target[part] }
      target[parts[0]] = value
    }
  }
  return page
}
const tick = () => new Promise(resolve => setTimeout(resolve, 5))
const ok = data => ({ statusCode: 200, data })

async function main() {
  // 1. 正常流程：服务开关 → 资格 → 须知 v2 → 申请 → 收款码认领 → 开门密码。
  responder = (body, url, header) => {
    if (header.op === '/deposit-payment/switch') return ok({ status: 'other_available' })
    if (body.action === 'config') return ok({ arrivalEnabled: true, pickupEnabled: false, paymentEnabled: true })
    if (body.action === 'check-eligibility') return ok({ eligible: true })
    if (body.action === 'create') return ok({ requestId: 'r1', token: body.token, status: 'awaiting_payment', paymentDeadline: '2026-11-10T00:20:00Z' })
    if (body.action === 'confirm-payment') return ok({ status: 'confirmed', possibleUnmarked: false })
    if (body.action === 'entry-code') return ok({ status: 'available', code: '246810' })
    return { statusCode: 400, data: {} }
  }
  const page = createPage()
  page.onLoad({})
  await tick()
  assert.equal(page.data.configState, 'ready')
  assert.equal(page.data.arrivalEnabled, true)
  assert.equal(sent[0].url, 'https://staycube-prod-d0g2d759v95954cd6.api.tcloudbasegateway.com/v1/functions/unattended-access', 'unattended service goes straight to CloudBase')
  assert.equal(sent[0].op, '/unattended-access')
  assert.match(sent[0].header.Authorization, /^Bearer ey/, 'publishable key, no relay')
  page.chooseArrival()
  page.updateName({ detail: { value: '张三' } })
  page.updateContact({ detail: { value: '1380000' } })
  await page.submitDetails()
  assert.equal(page.data.errorText, copy['zh-CN'].invalidPhone, 'Chinese UI requires an 11-digit mainland phone')
  page.updateContact({ detail: { value: '13800000000' } })
  await page.submitDetails()
  assert.deepEqual(sent.at(-1).data, { action: 'check-eligibility', kind: 'arrival', name: '张三', contactMethod: 'phone', contact: '13800000000', locale: 'zh-CN' })
  assert.equal(page.data.screen, 'notice')
  page.updateNotice({ detail: { value: ['0', '1', '2'] } })
  assert.equal(page.data.allAccepted, false, 'all four rules must be accepted')
  page.updateNotice({ detail: { value: ['0', '1', '2', '3'] } })
  assert.equal(page.data.allAccepted, true)
  await page.createRequest()
  const create = [...sent].reverse().find(item => item.data && item.data.action === 'create').data
  assert.equal(create.action, 'create')
  assert.equal(create.noticeVersion, 'v2', 'early arrival submits notice v2')
  assert.equal(create.accepted, true)
  assert.match(create.token, /^[A-Za-z0-9_-]{43}$/, 'recovery token matches the server format')
  assert.equal(page.data.screen, 'payment')
  assert.equal(page.data.paymentChannel, 'wechat', 'mini program offers WeChat Pay first, like self check-in')
  await page.useOtherPayment()
  assert.equal(sent.at(-1).op, '/deposit-payment/switch', 'open WeChat order is closed before switching')
  assert.deepEqual(sent.at(-1).data, { requestId: 'r1', token: create.token })
  assert.equal(page.data.paymentChannel, 'other')
  assert.equal(storage.get('unattended_session').requestId, 'r1', 'session survives leaving the mini program')
  assert.equal(storage.has('unattended_pending'), false)
  await page.checkPayment()
  assert.equal(page.data.screen, 'entry')
  assert.deepEqual(sent.find(item => item.data.action === 'entry-code').data, { action: 'entry-code', requestId: 'r1', token: create.token })
  assert.deepEqual(page.data.entry, { state: 'available', code: '246810' })

  // 1b. 微信支付：下单 → 调起支付 → 以服务端查询结果为准 → 开门密码。
  storage.clear(); paidByWechat = false
  responder = (body, url, header) => {
    const op = header.op
    if (op === '/deposit-payment/create') return ok({ status: 'pending', requestPayment: { timeStamp: '1', nonceStr: 'n', package: 'prepay_id=x', signType: 'RSA', paySign: 's' } })
    if (op === '/deposit-payment/status') return ok({ status: paidByWechat ? 'paid' : 'pending' })
    if (body.action === 'config') return ok({ arrivalEnabled: true, pickupEnabled: false })
    if (body.action === 'check-eligibility') return ok({ eligible: true })
    if (body.action === 'create') return ok({ requestId: 'r2', token: body.token, status: 'awaiting_payment', paymentDeadline: '2026-11-10T00:20:00Z' })
    if (body.action === 'status') return ok({ requestId: 'r2', kind: 'arrival', status: paidByWechat ? 'paid' : 'awaiting_payment' })
    if (body.action === 'entry-code') return ok({ status: 'available', code: '135790' })
    return { statusCode: 400, data: {} }
  }
  const wechatPage = createPage()
  wechatPage.onLoad({}); await tick()
  wechatPage.chooseArrival()
  wechatPage.updateName({ detail: { value: '赵六' } })
  wechatPage.updateContact({ detail: { value: '13800000002' } })
  await wechatPage.submitDetails()
  wechatPage.updateNotice({ detail: { value: ['0', '1', '2', '3'] } })
  await wechatPage.createRequest(); await tick()
  await wechatPage.payWechat()
  const created = sent.find(item => item.op === '/deposit-payment/create')
  assert.equal(created.data.loginCode, 'login-code')
  assert.equal(created.data.requestId, 'r2')
  assert.equal(wechatPage.data.screen, 'entry')
  assert.deepEqual(wechatPage.data.entry, { state: 'available', code: '135790' })

  // 2. 当日无开门密码：付款前拦截，提示可辨认。
  responder = body => body.action === 'config' ? ok({ arrivalEnabled: true, pickupEnabled: false }) : { statusCode: 409, data: { code: 'ENTRY_CODE_UNAVAILABLE', message: '今日早到自助寄存暂无可用开门密码，请联系员工。' } }
  storage.clear()
  const blocked = createPage()
  blocked.onLoad({})
  await tick()
  blocked.chooseArrival()
  blocked.updateName({ detail: { value: '李四' } })
  blocked.updateContact({ detail: { value: '13800000001' } })
  await blocked.submitDetails()
  assert.equal(blocked.data.screen, 'details')
  assert.equal(blocked.data.errorText, copy['zh-CN'].unavailableBeforePayment)

  // 3. 员工关闭服务：入口不可选。
  responder = () => ok({ arrivalEnabled: false, pickupEnabled: false })
  const closed = createPage()
  closed.onLoad({})
  await tick()
  closed.chooseArrival()
  assert.equal(closed.data.screen, 'service')

  // 4. 重新进入：按服务端状态恢复到完成页；凭证失效则清除本机申请。
  storage.set('unattended_session', { requestId: 'r9', token: 't'.repeat(43), kind: 'arrival', name: '王五', paymentDeadline: '2026-11-10T00:20:00Z' })
  responder = body => body.action === 'status' ? ok({ requestId: 'r9', kind: 'arrival', status: 'completed' }) : ok({ arrivalEnabled: true })
  const resumed = createPage()
  resumed.onLoad({})
  await tick()
  assert.equal(resumed.data.screen, 'done')
  responder = body => body.action === 'status' ? { statusCode: 404, data: { code: 'INVALID_SESSION' } } : ok({ arrivalEnabled: true, pickupEnabled: false })
  const invalid = createPage()
  invalid.onLoad({})
  await tick(); await tick()
  assert.equal(invalid.data.screen, 'service')
  assert.equal(storage.has('unattended_session'), false)

  // 5. 八种语言文案齐全。
  const keys = Object.keys(copy['zh-CN'])
  for (const [locale, row] of Object.entries(copy)) {
    assert.deepEqual(Object.keys(row), keys, `${locale} has every key`)
    assert.equal(row.notice.length, 4, `${locale} has four notice items`)
  }
  console.log('早到自助寄存：请求字段、须知 v2、凭证保存、微信支付与改用其他方式、收款码认领、开门密码、付款前拦截、服务关闭、重新进入与多语言通过')
}

main().catch(error => { console.error(error); process.exit(1) })
