const config = require('../config')
const backend = require('./backend')

const rpcAllowlist = new Set([
  'get_self_checkin_public_context_by_access_code', 'lookup_self_checkin_public_context_by_access_code', 'get_self_checkin_public_entry_context', 'get_self_checkin_public_context',
  'submit_self_checkin_record', 'submit_pre_arrival_v2', 'get_luggage_storage_public_context',
  'create_luggage_storage_public_draft_v2', 'submit_luggage_storage_record', 'get_luggage_storage_submission_status', 'get_self_checkin_submission_status',
])

function createRequestId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, char => {
    const value = Math.floor(Math.random() * 16)
    return (char === 'x' ? value : (value & 0x3) | 0x8).toString(16)
  })
}

function operationForPath(path) {
  const rpc = String(path).match(/^\/rest\/v1\/rpc\/([a-z0-9_]+)$/)
  if (rpc && rpcAllowlist.has(rpc[1])) return `rpc:${rpc[1]}`
  const payment = String(path).match(/^\/functions\/v1\/self-checkin-payment\/(create|status|switch)$/)
  if (payment) return `function:self-checkin-payment:${payment[1]}`
  if (path === '/functions/v1/special-cancellation-storage') return 'function:special-cancellation-storage'
  return null
}

function relayUrl() {
  const fallback = config.publicLookupFallbackUrl
  if (!fallback) return null
  return fallback.replace(/\/\.netlify\/functions\/self-checkin-public-lookup\/?$/, '/.netlify/functions/guest-relay')
}

function failure(kind, message, statusCode = 0, data = null) {
  const error = new Error(message || `HTTP ${statusCode}`)
  error.kind = kind
  error.statusCode = statusCode
  error.data = data
  return error
}

function requestOnce(url, data, timeout, header) {
  return new Promise((resolve, reject) => {
    wx.request({
      url,
      method: 'POST',
      data,
      timeout,
      header,
      success(response) {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          const kind = response.statusCode === 429 ? 'limited' : response.statusCode >= 500 ? 'service' : 'request'
          reject(failure(kind, response.data?.message || response.data?.details || `HTTP ${response.statusCode}`, response.statusCode, response.data))
          return
        }
        resolve(response.data)
      },
      fail(error) {
        const message = String(error && error.errMsg || '')
        reject(failure(/timeout/i.test(message) ? 'timeout' : 'network', message))
      },
    })
  })
}

async function requestGuest(path, data, timeout = 12000) {
  const operation = operationForPath(path)
  if (backend.functionsViaRelayOnly(path)) throw failure('service', 'CLOUDBASE_FUNCTION_RELAY_UNAVAILABLE')
  const headers = backend.guestHeaders({ 'Content-Type': 'application/json' })
  try {
    return await requestOnce(backend.guestUrl(path), data, timeout, headers)
  } catch (error) {
    if (backend.isCloudbase()) throw error
    const fallback = relayUrl()
    if (!operation || !fallback || !['network', 'timeout', 'service'].includes(error.kind)) throw error
    return requestOnce(fallback, data, timeout, { 'Content-Type': 'application/json', 'x-guest-relay-operation': operation })
  }
}

function uploadOnce(url, filePath, timeout, header) {
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url, filePath, name: 'file', timeout, header,
      success(response) {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          let body = {}
          try { body = JSON.parse(response.data) } catch {}
          const kind = response.statusCode === 429 ? 'limited' : response.statusCode >= 500 ? 'service' : 'upload'
          reject(failure(kind, body.message || body.code || `HTTP ${response.statusCode}`, response.statusCode, body))
          return
        }
        resolve(response.data)
      },
      fail(error) {
        const message = String(error && error.errMsg || '')
        reject(failure(/timeout/i.test(message) ? 'timeout' : 'network', message))
      },
    })
  })
}

async function uploadGuestFile(bucket, path, filePath, contentType, timeout = 45000) {
  const headers = backend.guestHeaders({ 'x-upsert': 'false', 'cache-control': '3600', 'Content-Type': contentType })
  const objectPath = `${bucket}/${path}`
  try {
    await uploadOnce(backend.guestUrl(`/storage/v1/object/${objectPath}`), filePath, timeout, headers)
    return path
  } catch (error) {
    if (backend.isCloudbase()) throw error
    const fallback = relayUrl()
    if (!fallback || !['network', 'timeout', 'service'].includes(error.kind)) throw error
    await uploadOnce(fallback, filePath, timeout, {
      'x-guest-relay-operation': 'storage:upload',
      'x-guest-relay-object-path': objectPath,
      'x-guest-relay-file-content-type': contentType,
      'x-guest-relay-upsert': 'false',
    })
    return path
  }
}

module.exports = { requestGuest, uploadGuestFile, operationForPath, createRequestId }
