const backend = require('./backend')

function createRequestId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, char => {
    const value = Math.floor(Math.random() * 16)
    return (char === 'x' ? value : (value & 0x3) | 0x8).toString(16)
  })
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

// 腾讯云模式的云函数调用：POST <网关>/v1/functions/<名>，请求作为事件（与网页 src/lib/cloudbaseFunctions.ts 同一格式），
// 函数返回 {statusCode, headers, body}。旅客带公开钥匙；正式环境的函数安全规则只对旅客函数放行匿名调用。
function functionTarget(path) {
  const match = String(path).match(/^\/functions\/v1\/([a-z0-9-]+)(\/[^?#]*)?$/)
  return match ? { name: match[1], path: `/${match[1]}${match[2] || ''}` } : null
}

function parseBody(text) {
  if (typeof text !== 'string' || !text) return null
  try { return JSON.parse(text) } catch { return text }
}

async function callCloudbaseFunction(path, data, timeout) {
  const target = functionTarget(path)
  if (!target) throw failure('request', 'INVALID_FUNCTION_PATH')
  const event = { httpMethod: 'POST', path: target.path, headers: { 'content-type': 'application/json' }, queryStringParameters: {}, body: JSON.stringify(data == null ? {} : data), isBase64Encoded: false }
  const result = await requestOnce(backend.functionUrl(target.name), event, timeout, backend.guestHeaders({ 'Content-Type': 'application/json' }))
  if (!result || typeof result.statusCode !== 'number') throw failure('service', 'FUNCTION_RESULT_INVALID', 502)
  const body = parseBody(result.body)
  if (result.statusCode < 200 || result.statusCode >= 300) {
    const kind = result.statusCode === 429 ? 'limited' : result.statusCode >= 500 ? 'service' : 'request'
    throw failure(kind, body && (body.message || body.code || body.error) || `HTTP ${result.statusCode}`, result.statusCode, body)
  }
  return body
}

async function requestGuest(path, data, timeout = 12000) {
  if (backend.isCloudbase() && backend.isFunctionPath(path)) return callCloudbaseFunction(path, data, timeout)
  return requestOnce(backend.guestUrl(path), data, timeout, backend.guestHeaders({ 'Content-Type': 'application/json' }))
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
  await uploadOnce(backend.guestUrl(`/storage/v1/object/${bucket}/${path}`), filePath, timeout, headers)
  return path
}

module.exports = { requestGuest, uploadGuestFile, createRequestId }
