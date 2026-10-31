const config = require('../config')
const { requestGuest, createRequestId } = require('./guest-transport')
const backend = require('./backend')

// 与 Web 端 specialCancellationApi 的旅客侧接口一致：申请码验证、保存草稿、上传材料、提交及补充材料。
const BUCKET = 'special-cancellation-proofs'
const MAX_BYTES = 5000000

const errorMessages = {
  INVALID_ACCESS_CODE: '申请码不正确、已过期，或申请当前状态不能修改。',
  ATTACHMENT_LIMIT_EXCEEDED: '证明材料最多可上传 5 项。',
  INVALID_ATTACHMENT: '请选择 JPG、PNG 图片或 PDF 文件，且大小需小于 5MB。',
  INVALID_SUPPLEMENT_ROUND: '申请当前状态不能补充材料，请联系前台 staff。',
}

class SpecialCancellationApiError extends Error {
  constructor(kind, message, statusCode) {
    super(message)
    this.kind = kind
    this.statusCode = statusCode || 0
  }
}

function friendlyError(error, fallback) {
  if (error instanceof SpecialCancellationApiError) return error
  const raw = String(error && (error.data && (error.data.error || error.data.message) || error.message) || '')
  const code = Object.keys(errorMessages).find(key => raw.includes(key))
  if (code) return new SpecialCancellationApiError('request', errorMessages[code], error.statusCode)
  if (error && ['network', 'timeout'].includes(error.kind)) return new SpecialCancellationApiError(error.kind, '网络连接不稳定，请检查网络后重试。')
  if (error && error.kind === 'limited') return new SpecialCancellationApiError('limited', '操作过于频繁，请稍后再试。', 429)
  return new SpecialCancellationApiError((error && error.kind) || 'service', fallback, error && error.statusCode)
}

function text(value) { return typeof value === 'string' ? value : '' }
function record(value) { return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {} }
function rows(value) { return Array.isArray(value) ? value.map(record).filter(row => text(row.id).trim()) : [] }
const PURPOSES = ['disruption', 'passenger', 'supporting']

function normalizeAttachment(value) {
  const row = record(value)
  if (!text(row.id).trim()) throw new SpecialCancellationApiError('service', '证明材料数据不完整，请重新加载后重试。')
  return {
    id: text(row.id), original_name: text(row.original_name), mime_type: text(row.mime_type),
    proof_purposes: Array.isArray(row.proof_purposes) ? row.proof_purposes.filter(purpose => PURPOSES.includes(purpose)) : [],
    description: text(row.description), supplement_round: typeof row.supplement_round === 'number' ? row.supplement_round : 0,
    created_at: text(row.created_at),
  }
}

function normalizeApplication(value) {
  const row = record(value)
  if (!text(row.id).trim()) throw new SpecialCancellationApiError('service', '申请数据不完整，请重新输入申请码或联系工作人员。')
  const attachments = rows(row.attachments).map(normalizeAttachment)
  return {
    id: text(row.id), application_no: text(row.application_no), status: text(row.status),
    guest_name: text(row.guest_name), guest_phone: text(row.guest_phone), booking_number: text(row.booking_number),
    reason_category: text(row.reason_category), reason_subcategory: text(row.reason_subcategory),
    transport_mode: text(row.transport_mode), transport_trip: text(row.transport_trip), transport_date: text(row.transport_date),
    description: text(row.description), signature_data: text(row.signature_data),
    declarations: Object.fromEntries(Object.entries(record(row.declarations)).map(([key, entry]) => [key, entry === true])),
    decision: row.decision == null ? null : Object.fromEntries(Object.entries(record(row.decision)).map(([key, entry]) => [key, text(entry)])),
    attachments,
    review_events: rows(row.review_events).map(event => ({
      id: text(event.id), actor_type: text(event.actor_type), event_type: text(event.event_type),
      note: text(record(event.payload).note), created_at: text(event.created_at),
    })),
    submitted_at: typeof row.submitted_at === 'string' ? row.submitted_at : null,
    supplement_round: typeof row.supplement_round === 'number' ? row.supplement_round : 0,
    guest_can_supplement: row.guest_can_supplement === true,
    guest_material_count: typeof row.guest_material_count === 'number' ? row.guest_material_count : attachments.length,
    guest_material_limit: typeof row.guest_material_limit === 'number' ? row.guest_material_limit : 5,
  }
}

async function rpc(name, data, fallback, timeout = 15000) {
  try { return await requestGuest(`/rest/v1/rpc/${name}`, data, timeout) }
  catch (error) { throw friendlyError(error, fallback) }
}

function storageFunction(body, fallback) {
  // 腾讯云模式：函数调用经 guest-relay（见 utils/backend.js）。
  if (backend.isCloudbase()) {
    return requestGuest('/functions/v1/special-cancellation-storage', body, 20000).then(data => data || {}, error => { throw friendlyError(error, fallback) })
  }
  const base = config.supabaseUrl.replace(/\/$/, '')
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${base}/functions/v1/special-cancellation-storage`,
      method: 'POST',
      data: body,
      timeout: 20000,
      header: { apikey: config.publishableKey, Authorization: `Bearer ${config.publishableKey}`, 'Content-Type': 'application/json' },
      success(response) {
        if (response.statusCode >= 200 && response.statusCode < 300) return resolve(response.data || {})
        const kind = response.statusCode === 429 ? 'limited' : response.statusCode >= 500 ? 'service' : 'request'
        reject(friendlyError({ kind, statusCode: response.statusCode, data: response.data }, fallback))
      },
      fail(error) {
        const message = String(error && error.errMsg || '')
        reject(friendlyError({ kind: /timeout/i.test(message) ? 'timeout' : 'network', message }, fallback))
      },
    })
  })
}

function readFile(filePath) {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({ filePath, success: result => resolve(result.data), fail: () => reject(new SpecialCancellationApiError('upload', '文件读取失败，请重新选择。')) })
  })
}

function putSignedUpload(path, token, data, contentType) {
  const objectPath = path.split('/').map(encodeURIComponent).join('/')
  return new Promise((resolve, reject) => {
    wx.request({
      url: backend.guestUrl(`/storage/v1/object/upload/sign/${BUCKET}/${objectPath}?token=${encodeURIComponent(token)}`),
      method: 'PUT',
      data,
      timeout: 60000,
      header: backend.guestHeaders({ 'Content-Type': contentType, 'x-upsert': 'false', 'cache-control': '3600' }, { bearer: false }),
      success(response) {
        if (response.statusCode >= 200 && response.statusCode < 300) return resolve()
        reject(friendlyError({ kind: response.statusCode >= 500 ? 'service' : 'upload', statusCode: response.statusCode, data: response.data }, '上传失败，请检查网络和文件后重试。'))
      },
      fail(error) {
        const message = String(error && error.errMsg || '')
        reject(friendlyError({ kind: /timeout/i.test(message) ? 'timeout' : 'network', message }, '上传失败，请检查网络和文件后重试。'))
      },
    })
  })
}

// 开发测试码：仅在微信开发者工具 / 开发版（envVersion 为 develop）有效，用本地示例数据走完整流程，不请求服务端。
// 体验版、正式版输入同样的码会按普通申请码交给服务端校验。
const DEV_CODES = { [config.developmentSelfCheckinTestCode || '123456']: 'awaiting_guest' }
const DEV_PREFIX = 'dev-preview-'
function isDevelopBuild() {
  try { return wx.getAccountInfoSync().miniProgram.envVersion === 'develop' } catch (error) { return false }
}
const isDevId = id => String(id || '').startsWith(DEV_PREFIX)
let devItem = null
function createDevItem(status) {
  const now = new Date().toISOString()
  const needMore = status === 'need_more_info'
  return normalizeApplication({
    id: `${DEV_PREFIX}${status}`, application_no: 'SC-DEV-PREVIEW', status,
    guest_phone: needMore ? '13800138000' : '', booking_number: needMore ? 'DEV-ORDER-001' : '',
    reason_category: needMore ? '不可抗力' : '', reason_subcategory: needMore ? '航班列车异常' : '',
    transport_mode: needMore ? '火车' : '', transport_trip: needMore ? 'G1234' : '', transport_date: needMore ? now.slice(0, 10) : '',
    declarations: {}, attachments: needMore ? [{ id: 'dev-att-1', original_name: '停运通知（示例）.jpg', proof_purposes: ['disruption'], description: '', supplement_round: 0 }] : [],
    decision: needMore ? { result: '要求补充资料', note: '（示例）请补充车站出具的停运证明。' } : null,
    review_events: needMore ? [
      { id: 'dev-e1', actor_type: 'guest', event_type: 'submitted', payload: {}, created_at: now },
      { id: 'dev-e2', actor_type: 'admin', event_type: 'need_more_info', payload: { note: '（示例）请补充车站出具的停运证明。' }, created_at: now },
    ] : [],
    submitted_at: needMore ? now : null, supplement_round: needMore ? 1 : 0, guest_can_supplement: needMore,
    guest_material_count: needMore ? 1 : 0, guest_material_limit: 5,
  })
}
const devDelay = value => new Promise(resolve => setTimeout(() => resolve(value), 300))
function devEvent(type) { return { id: `dev-e-${Date.now()}`, actor_type: 'guest', event_type: type, note: '', created_at: new Date().toISOString() } }

const specialCancellationApi = {
  async getByAccessCode(accessCode) {
    const devStatus = DEV_CODES[text(accessCode).trim()]
    if (devStatus && isDevelopBuild()) {
      if (!devItem || devItem.id !== `${DEV_PREFIX}${devStatus}`) devItem = createDevItem(devStatus)
      return devDelay({ ...devItem })
    }
    const data = await rpc('verify_special_cancellation_access_code', { p_access_code: text(accessCode).trim() }, '申请码验证失败。')
    const row = rows(data)[0]
    return row ? normalizeApplication(row) : null
  },

  async saveGuest(id, accessCode, patch) {
    if (isDevId(id)) { devItem = { ...devItem, ...patch }; return devDelay({ ...devItem }) }
    return normalizeApplication(await rpc('save_special_cancellation_guest', { p_application_id: id, p_access_code: accessCode, p_patch: patch }, '保存失败，请重试。'))
  },

  async submit(id, accessCode, payload) {
    const bookingNumber = text(payload.booking_number).trim()
    const phone = text(payload.guest_phone).trim()
    if (!bookingNumber) throw new SpecialCancellationApiError('request', '请填写真实订单号后提交；如无法找到，请联系前台 staff。')
    if (!phone) throw new SpecialCancellationApiError('request', '请填写联系方式。')
    if (isDevId(id)) {
      devItem = { ...devItem, ...payload, status: 'pending_review', submitted_at: new Date().toISOString(), review_events: [...devItem.review_events, devEvent('submitted')] }
      return devDelay({ ...devItem })
    }
    let data
    try {
      data = await rpc('submit_special_cancellation_guest', { p_application_id: id, p_access_code: accessCode, p_payload: { ...payload, booking_number: bookingNumber, guest_phone: phone } }, '提交失败。请检查必填内容和网络后重试。', 20000)
    } catch (error) {
      const existing = await this.getByAccessCode(accessCode).catch(() => null)
      if (existing && existing.id === id && existing.status === 'pending_review' && existing.submitted_at) return existing
      throw error
    }
    return (await this.getByAccessCode(accessCode).catch(() => null)) || normalizeApplication(data)
  },

  async submitSupplement(id, accessCode, expectedRound) {
    if (isDevId(id)) {
      devItem = { ...devItem, status: 'pending_review', guest_can_supplement: false, submitted_at: new Date().toISOString(), review_events: [...devItem.review_events, devEvent('resubmitted')] }
      return devDelay({ ...devItem })
    }
    let data
    try {
      data = await rpc('submit_special_cancellation_supplement', { p_application_id: id, p_access_code: accessCode }, '提交失败，请检查网络后重试。', 20000)
    } catch (error) {
      const existing = await this.getByAccessCode(accessCode).catch(() => null)
      if (existing && existing.id === id && existing.status === 'pending_review' && existing.submitted_at && existing.supplement_round === expectedRound) return existing
      throw error
    }
    return (await this.getByAccessCode(accessCode).catch(() => null)) || normalizeApplication(data)
  },

  // file: { path, name, mimeType, size, originalBytes }
  async uploadAttachment(id, accessCode, meta, file, uploadId = createRequestId()) {
    if (!['image/jpeg', 'image/png', 'application/pdf'].includes(file.mimeType) || !(file.size > 0) || file.size >= MAX_BYTES) {
      throw new SpecialCancellationApiError('request', errorMessages.INVALID_ATTACHMENT)
    }
    if (isDevId(id)) {
      const attachment = { id: `dev-att-${Date.now()}`, original_name: file.name, mime_type: file.mimeType, proof_purposes: meta.proof_purposes, description: meta.description, supplement_round: devItem.supplement_round, created_at: new Date().toISOString() }
      devItem = { ...devItem, attachments: [...devItem.attachments, attachment], guest_material_count: devItem.guest_material_count + 1 }
      return devDelay(attachment)
    }
    const fallback = '上传失败，请检查网络和文件后重试。'
    const signed = await storageFunction({
      action: 'create_upload', application_id: id, access_code: accessCode, client_upload_id: uploadId,
      file: { name: file.name, mime_type: file.mimeType, original_bytes: file.originalBytes, uploaded_bytes: file.size, proof_purposes: meta.proof_purposes, description: meta.description, is_sensitive: meta.is_sensitive },
    }, fallback)
    if (!text(signed.path) || !text(signed.token)) throw new SpecialCancellationApiError('service', '上传服务返回数据不完整，请重试。')
    const cleanup = () => storageFunction({ action: 'delete_upload', application_id: id, access_code: accessCode, path: signed.path }, fallback).catch(() => null)
    try {
      await putSignedUpload(signed.path, signed.token, await readFile(file.path), file.mimeType)
    } catch (error) { await cleanup(); throw error }
    let registered
    try {
      registered = await storageFunction({
        action: 'register_upload', application_id: id, access_code: accessCode, path: signed.path,
        original_name: file.name, mime_type: file.mimeType, original_bytes: file.originalBytes, uploaded_bytes: file.size,
        proof_purposes: meta.proof_purposes, description: meta.description, is_sensitive: meta.is_sensitive,
      }, fallback)
    } catch (error) { await cleanup(); throw error }
    return normalizeAttachment(registered.attachment)
  },
}

module.exports = { SpecialCancellationApiError, specialCancellationApi, normalizeApplication, MAX_BYTES }
