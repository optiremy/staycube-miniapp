// 保洁端接口：用 CloudBase 微信小程序登录的凭证调用数据库函数 housekeeping_*（stayCube 仓库
// cloudbase/compat/20261109150000_cloudbase_housekeeping.sql）。照片直传存储桶 housekeeping-photos，
// 路径为「任务/拍照点/随机名.jpg」，存储权限只放行本人整理中的任务。
const config = require('../config')
const backend = require('../utils/backend')
const auth = require('../utils/cloudbase-auth')

const BUCKET = 'housekeeping-photos'
const CODES = /\b(NOT_BOUND|LOGIN_REQUIRED|TOKEN_INVALID|WECHAT_IN_USE|NOT_PENDING|NOT_ASSIGNEE|NOT_IN_PROGRESS|NOT_YET|INCOMPLETE|PHOTO_LIMIT|INVALID_PHOTO|NOT_FOUND|INVALID_MONTH)\b/

function failure(message, statusCode) {
  const text = String(message || '')
  const blocked = text.match(/BLOCKED:(.+)$/)
  if (blocked) return Object.assign(new Error(text), { code: 'BLOCKED', detail: blocked[1].trim(), statusCode })
  const code = (text.match(CODES) || [])[1]
  return Object.assign(new Error(text), { code: code || 'SERVER', statusCode })
}

async function rpc(name, body = {}) {
  const token = await auth.accessToken().catch((error) => { throw Object.assign(error, { code: error.kind === 'network' ? 'NETWORK' : 'LOGIN_REQUIRED' }) })
  if (!token) throw Object.assign(new Error('LOGIN_REQUIRED'), { code: 'LOGIN_REQUIRED' })
  return new Promise((resolve, reject) => wx.request({
    url: backend.guestUrl(`/rest/v1/rpc/${name}`),
    method: 'POST',
    data: body,
    timeout: 15000,
    header: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    success(response) {
      if (response.statusCode >= 200 && response.statusCode < 300) resolve(response.data)
      else reject(failure(response.data && (response.data.message || response.data.details), response.statusCode))
    },
    fail(error) { reject(Object.assign(new Error((error && error.errMsg) || 'network'), { code: 'NETWORK' })) },
  }))
}

function randomName() {
  let out = ''
  for (let i = 0; i < 32; i += 1) out += 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]
  return out
}

function compress(src) {
  // 长边约 1600px、质量 80；重新编码会去掉拍摄地点等信息
  return new Promise((resolve) => wx.compressImage({ src, quality: 80, compressedWidth: 1600, success: (result) => resolve(result.tempFilePath), fail: () => resolve(src) }))
}

const api = {
  // 绑定：点击「微信登录并绑定」时登录，再用绑定码绑定
  async bind(token) {
    await auth.signIn()
    return rpc('housekeeping_bind', { p_token: token })
  },
  me: () => rpc('housekeeping_me'),
  list: () => rpc('housekeeping_list'),
  task: (id) => rpc('housekeeping_task', { p_id: id }),
  start: (id) => rpc('housekeeping_start', { p_id: id }),
  check: (id, itemId, checked) => rpc('housekeeping_check', { p_id: id, p_item: itemId, p_checked: checked }),
  submit: (id) => rpc('housekeeping_submit', { p_id: id }),
  stats: (month) => rpc('housekeeping_stats', { p_month: month }),

  // 拍照：压缩 → 直传 → 登记；重拍时先登记新照片，再移除旧的
  async addPhoto(id, pointId, filePath, replacePhotoId) {
    const token = await auth.accessToken()
    if (!token) throw Object.assign(new Error('LOGIN_REQUIRED'), { code: 'LOGIN_REQUIRED' })
    const file = await compress(filePath)
    const path = `${id}/${pointId}/${randomName()}.jpg`
    await new Promise((resolve, reject) => wx.uploadFile({
      url: backend.guestUrl(`/storage/v1/object/${BUCKET}/${path}`),
      filePath: file,
      name: 'file',
      timeout: 45000,
      header: { Authorization: `Bearer ${token}`, 'x-upsert': 'false', 'Content-Type': 'image/jpeg' },
      success(response) { response.statusCode >= 200 && response.statusCode < 300 ? resolve() : reject(Object.assign(new Error(`HTTP ${response.statusCode}`), { code: 'UPLOAD_FAILED' })) },
      fail() { reject(Object.assign(new Error('network'), { code: 'UPLOAD_FAILED' })) },
    }))
    let task = await rpc('housekeeping_photo_add', { p_id: id, p_point: pointId, p_path: path })
    if (replacePhotoId) task = await rpc('housekeeping_photo_remove', { p_id: id, p_photo: replacePhotoId })
    return task
  },

  async photoUrls(paths) {
    const list = (paths || []).filter(Boolean)
    if (!list.length) return {}
    const token = await auth.accessToken().catch(() => null)
    if (!token) return {}
    return new Promise((resolve) => wx.request({
      url: backend.guestUrl(`/storage/v1/object/sign/${BUCKET}`),
      method: 'POST',
      data: { expiresIn: 3600, paths: list },
      header: { 'Content-Type': 'application/json', Authorization: `Bearer ${token || config.cloudbasePublishableKey}` },
      success(response) {
        const map = {}
        ;(Array.isArray(response.data) ? response.data : []).forEach((item) => {
          const url = item.signedURL || item.signedUrl
          if (item.path && url) map[item.path] = /^https?:/.test(url) ? url : /^\/v1\//.test(url) ? `${backend.guestBase()}${url}` : backend.guestUrl(`/storage/v1${url}`)
        })
        resolve(map)
      },
      fail() { resolve({}) },
    }))
  },
}

module.exports = api
