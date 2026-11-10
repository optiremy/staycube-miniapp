// 后端开关（与网页 stayCube 仓库 src/lib/backend.ts、src/lib/cloudbaseFunctions.ts 同一套规则）：
// - config.backend 为 'supabase'：直连旧 Supabase；默认值由 config.js 指定。
// - 'cloudbase'：数据接口 /rest/v1 → <网关>/v1/rdb/rest，存储 /storage/v1 → <网关>/v1/storages，
//   网关为 https://<环境ID>.api.tcloudbasegateway.com，凭证是腾讯云公开钥匙（publishable key）。
//   云函数（/functions/v1/<名>）→ POST <网关>/v1/functions/<名>（见 utils/guest-transport.js），不经任何中转。
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
  if (isCloudbase()) {
    if (!config.cloudbasePublishableKey) throw new Error('CLOUDBASE_PUBLISHABLE_KEY_MISSING')
    return { Authorization: `Bearer ${config.cloudbasePublishableKey}`, ...extra }
  }
  return options.bearer === false ? { apikey: config.publishableKey, ...extra } : { apikey: config.publishableKey, Authorization: `Bearer ${config.publishableKey}`, ...extra }
}

function isFunctionPath(path) {
  return /^\/functions\/v1\/[a-z0-9-]+(\/|$)/.test(String(path))
}

function functionUrl(name) {
  return `${cloudbaseGateway()}/v1/functions/${name}`
}

module.exports = { backend, isCloudbase, guestBase, guestUrl, guestHeaders, isFunctionPath, functionUrl }
