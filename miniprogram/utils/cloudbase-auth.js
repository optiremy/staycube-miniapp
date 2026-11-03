// CloudBase 微信小程序登录（不依赖 SDK，按 @cloudbase/auth 的 signInWithOpenId 走 HTTP）：
// wx.login → /auth/v1/provider/token → /auth/v1/signin/with/provider，得到旅客自己的 access_token。
// 只用于留言板；其他旅客功能仍用公开钥匙匿名访问。
const config = require('../config')
const backend = require('./backend')

const CREDENTIALS_KEY = 'cloudbase-guest-credentials'
const DEVICE_KEY = 'cloudbase-device-id'

function deviceId() {
  try {
    let id = wx.getStorageSync(DEVICE_KEY)
    if (typeof id === 'string' && id.length >= 16) return id
    id = 'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const v = Math.floor(Math.random() * 16)
      return (c === 'x' ? v : (v & 0x3) | 0x8).toString(16)
    })
    wx.setStorageSync(DEVICE_KEY, id)
    return id
  } catch (error) {
    return 'staycube-miniapp-device'
  }
}

function authRequest(path, data) {
  return new Promise((resolve, reject) => wx.request({
    url: `${backend.guestBase()}/auth${path}?client_id=${config.cloudbaseEnvId}`,
    method: 'POST',
    data,
    timeout: 15000,
    header: { 'Content-Type': 'application/json', 'x-device-id': deviceId(), Authorization: `Bearer ${config.cloudbasePublishableKey}` },
    success(response) {
      const body = response.data || {}
      if (response.statusCode >= 200 && response.statusCode < 300 && !body.error_code && !body.error) resolve(body)
      else reject(Object.assign(new Error(body.error_description || body.error || `HTTP ${response.statusCode}`), { statusCode: response.statusCode, data: body }))
    },
    fail(error) { reject(Object.assign(new Error(error && error.errMsg || 'network'), { kind: 'network' })) },
  }))
}

function save(credentials) {
  const value = {
    accessToken: credentials.access_token,
    refreshToken: credentials.refresh_token,
    sub: credentials.sub,
    expiresAt: Date.now() + (Number(credentials.expires_in) || 7200) * 1000 - 60000,
  }
  try { wx.setStorageSync(CREDENTIALS_KEY, value) } catch (error) {}
  return value
}

function read() {
  try { return wx.getStorageSync(CREDENTIALS_KEY) || null } catch (error) { return null }
}

function clear() {
  try { wx.removeStorageSync(CREDENTIALS_KEY) } catch (error) {}
}

function wxCode() {
  return new Promise((resolve, reject) => wx.login({
    success(result) { result.code ? resolve(result.code) : reject(new Error('LOGIN_FAILED')) },
    fail: reject,
  }))
}

// 明确登录（旅客点击“使用微信登录”）和静默续期都用这一个流程
async function signIn({ signUp = true } = {}) {
  const code = await wxCode()
  const appid = wx.getAccountInfoSync().miniProgram.appId
  const grant = await authRequest('/v1/provider/token', {
    provider_id: appid,
    provider_code: code,
    provider_params: { provider_code_type: 'open_id', appid },
  })
  const credentials = await authRequest('/v1/signin/with/provider', { provider_token: grant.provider_token, force_disable_sign_up: !signUp })
  return save(credentials)
}

async function refresh(current) {
  try {
    return save(await authRequest('/v1/token', { client_id: config.cloudbaseEnvId, grant_type: 'refresh_token', refresh_token: current.refreshToken }))
  } catch (error) {
    if (error.kind === 'network') throw error
    return signIn()
  }
}

// 已登录过才返回凭证；从未登录返回 null（页面据此显示登录或引导）
async function accessToken() {
  const current = read()
  if (!current || !current.accessToken) return null
  if (current.expiresAt > Date.now()) return current.accessToken
  return (await refresh(current)).accessToken
}

module.exports = { signIn, accessToken, read, clear }
