// 后端开关（与网页 stayCube 仓库 src/lib/backend.ts、src/lib/cloudbaseFunctions.ts 同一套规则）：
// - config.backend 不填或为 'supabase'：与现在完全一样，直连 Supabase。
// - 'cloudbase'：数据接口 /rest/v1 → <网关>/v1/rdb/rest，存储 /storage/v1 → <网关>/v1/storages，
//   网关为 https://<环境ID>.api.tcloudbasegateway.com，凭证是腾讯云公开钥匙（publishable key）。
//   云函数（/functions/v1/<名>）：平台不接受公开钥匙调用云函数（实测 403），旅客的函数调用一律经
//   Netlify guest-relay 中转，由服务端带 API Key 调 /v1/functions/<名>；这里只决定走中转。
const config = require('../config')

function backend() {
  return config.backend === 'cloudbase' ? 'cloudbase' : 'supabase'
}

function isCloudbase() {
  return backend() === 'cloudbase'
}

function cloudbaseGateway() {
  return `https://${config.cloudbaseEnvId}.api.tcloudbasegateway.com`
}

function guestBase() {
  return isCloudbase() ? cloudbaseGateway() : config.supabaseUrl.replace(/\/$/, '')
}

// Supabase 风格路径（/rest/v1/...、/storage/v1/...）→ 当前后端的完整地址。
function guestUrl(path) {
  if (!isCloudbase()) return `${guestBase()}${path}`
  return `${guestBase()}${String(path).replace(/^\/rest\/v1(?=\/|$)/, '/v1/rdb/rest').replace(/^\/storage\/v1(?=\/|$)/, '/v1/storages')}`
}

// 旅客请求头。Supabase 同时要 apikey 与 Authorization；腾讯云只认 Authorization。
function guestHeaders(extra = {}, options = {}) {
  if (isCloudbase()) return { Authorization: `Bearer ${config.cloudbasePublishableKey}`, ...extra }
  return options.bearer === false ? { apikey: config.publishableKey, ...extra } : { apikey: config.publishableKey, Authorization: `Bearer ${config.publishableKey}`, ...extra }
}

function isFunctionPath(path) {
  return /^\/functions\/v1\/[a-z0-9-]+(\/|$)/.test(String(path))
}

// 腾讯云模式下函数调用不直连，只走中转。
function functionsViaRelayOnly(path) {
  return isCloudbase() && isFunctionPath(path)
}

module.exports = { backend, isCloudbase, guestBase, guestUrl, guestHeaders, isFunctionPath, functionsViaRelayOnly }
