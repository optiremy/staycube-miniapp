// 早到自助寄存（非值守服务）接口。与网页版共用 Netlify 函数 unattended-access：
// 资格核对、申请、押金核对、开门密码与拍照登记均由服务端按申请凭证重新校验。
// 开发版（envVersion = develop）且 config.unattendedDemoInDevelop 为 true 时走本地演示，不产生真实付款或登记。
const config = require('../config')
const { luggageStorageApi } = require('./luggage-storage-api')
const { requestGuest } = require('./guest-transport')
const paymentUtils = require('./self-checkin-payment')

class UnattendedApiError extends Error {
  constructor(code, message, statusCode) {
    super(message || code)
    this.code = code
    this.statusCode = statusCode || 0
  }
}

function endpoint() {
  const base = String(config.publicLookupFallbackUrl || '').replace(/\/\.netlify\/functions\/self-checkin-public-lookup\/?$/, '')
  return base ? `${base}/.netlify/functions/unattended-access` : ''
}

function post(body, timeout = 15000) {
  const url = endpoint()
  if (!url) return Promise.reject(new UnattendedApiError('API_UNAVAILABLE', ''))
  return new Promise((resolve, reject) => {
    wx.request({
      url, method: 'POST', data: body, timeout, header: { 'Content-Type': 'application/json' },
      success(response) {
        const data = response.data && typeof response.data === 'object' ? response.data : {}
        if (response.statusCode === 429) { reject(new UnattendedApiError('REQUEST_LIMITED', data.message, 429)); return }
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new UnattendedApiError(typeof data.code === 'string' ? data.code : 'API_FAILED', data.message, response.statusCode))
          return
        }
        resolve(data)
      },
      fail() { reject(new UnattendedApiError('NETWORK', '')) },
    })
  })
}

// 申请恢复凭证：43 位 base64url（与网页一致），只保存在本机。
// 仅在基础库不支持 wx.getRandomValues 时使用。
function recoveryToken() {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
  const values = []
  for (let i = 0; i < 43; i++) values.push(alphabet[Math.floor(Math.random() * 64)])
  return values.join('')
}

function secureRecoveryToken() {
  return new Promise((resolve) => {
    if (typeof wx === 'undefined' || !wx.getRandomValues) { resolve(recoveryToken()); return }
    wx.getRandomValues({
      length: 43,
      success(result) {
        const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
        const view = new Uint8Array(result.randomValues)
        resolve(Array.from(view, value => alphabet[value % 64]).join(''))
      },
      fail() { resolve(recoveryToken()) },
    })
  })
}

const noticeVersion = kind => (kind === 'arrival' ? 'v2' : 'v1')

// 押金微信支付（stayCube 押金模块的 deposit-payment 云函数，经 guest-relay 中转）。
async function depositPayment(route, requestId, token, extra = {}) {
  try {
    return await requestGuest(`/functions/v1/deposit-payment/${route}`, { requestId, token, ...extra }, 15000)
  } catch (error) {
    throw new UnattendedApiError(error && error.data && error.data.code || 'PAYMENT_SERVICE_ERROR', '')
  }
}

const realApi = {
  async wechatCreate(requestId, token) {
    const loginCode = await paymentUtils.loginCode()
    return depositPayment('create', requestId, token, { loginCode })
  },
  wechatStatus: (requestId, token) => depositPayment('status', requestId, token),
  wechatSwitch: (requestId, token) => depositPayment('switch', requestId, token),
  requestPayment: params => paymentUtils.requestPayment(params),
  config: () => post({ action: 'config' }, 12000),
  checkEligibility: (kind, name, contactMethod, contact, locale) => post({ action: 'check-eligibility', kind, name, contactMethod, contact, locale }),
  create: (kind, name, contactMethod, contact, locale, token) => post({ action: 'create', kind, name, contactMethod, contact, locale, noticeVersion: noticeVersion(kind), accepted: true, token }, 20000),
  status: (requestId, token) => post({ action: 'status', requestId, token }, 12000),
  confirmPayment: (requestId, token) => post({ action: 'confirm-payment', requestId, token }, 25000),
  entryCode: (requestId, token) => post({ action: 'entry-code', requestId, token }, 12000),
  cancel: (requestId, token) => post({ action: 'cancel', requestId, token }, 12000),
  async completeArrivalPhoto(requestId, token, photoPath, locale, state) {
    if (!state.draft) state.draft = await luggageStorageApi.createDraft()
    if (!state.storagePath) state.storagePath = await luggageStorageApi.uploadPhoto(state.draft.id, photoPath, state.uploadId || Date.now())
    return post({ action: 'complete-arrival', requestId, token, luggageRecordId: state.draft.id, draftToken: state.draft.token, photoStoragePath: state.storagePath, locale }, 20000)
  },
}

// 本地演示：流程与真实接口一致，状态保存在内存中。
function createDemoApi() {
  let current = null
  const required = () => { if (!current) throw new UnattendedApiError('INVALID_SESSION', ''); return current }
  return {
    config: async () => ({ arrivalEnabled: true, pickupEnabled: false, paymentEnabled: true }),
    checkEligibility: async () => ({ eligible: true }),
    create: async (kind, name, contactMethod, contact) => {
      current = { requestId: `demo-${Date.now()}`, kind, name, contactMethod, contact, status: 'awaiting_payment', paymentDeadline: new Date(Date.now() + 20 * 60000).toISOString() }
      return { requestId: current.requestId, token: 'demo-token', status: current.status, paymentDeadline: current.paymentDeadline, paymentQrValue: 'demo' }
    },
    status: async () => { const row = required(); return { requestId: row.requestId, kind: row.kind, status: row.status, paymentDeadline: row.paymentDeadline } },
    confirmPayment: async () => { required().status = 'paid'; return { status: 'confirmed', possibleUnmarked: false } },
    wechatCreate: async () => { required(); return { status: 'pending', requestPayment: null } },
    requestPayment: async () => { required().status = 'paid' },
    wechatStatus: async () => ({ status: required().status === 'paid' ? 'paid' : 'not_started' }),
    wechatSwitch: async () => ({ status: 'other_available' }),
    entryCode: async () => { required(); return { status: 'available', code: '123456' } },
    cancel: async () => { required().status = 'cancelled'; return { status: 'cancelled' } },
    completeArrivalPhoto: async () => { required().status = 'completed'; return { status: 'completed' } },
  }
}

function demoEnabled() {
  if (!config.unattendedDemoInDevelop) return false
  try { return wx.getAccountInfoSync().miniProgram.envVersion === 'develop' } catch { return false }
}

let demoApi = null
function unattendedApi() {
  if (!demoEnabled()) return realApi
  demoApi = demoApi || createDemoApi()
  return demoApi
}

module.exports = { UnattendedApiError, unattendedApi, demoEnabled, secureRecoveryToken, noticeVersion, endpoint }
