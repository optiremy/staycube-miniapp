// 留言板接口：旅客用 CloudBase 微信小程序登录的凭证调用数据库函数（guestbook_*）。
const config = require('../config')
const backend = require('./backend')
const auth = require('./cloudbase-auth')
const session = require('./guestbook-session')

const REACTIONS = [
  { key: 'agree', label: '同感' },
  { key: 'useful', label: '有用' },
  { key: 'thanks', label: '谢谢' },
  { key: 'wantgo', label: '想去' },
  { key: 'fun', label: '有趣' },
  { key: 'cheer', label: '加油' },
]

async function rpc(name, body = {}, options = {}) {
  const token = await auth.accessToken()
  if (!token && !options.anonymous) throw Object.assign(new Error('LOGIN_REQUIRED'), { code: 'LOGIN_REQUIRED' })
  return new Promise((resolve, reject) => wx.request({
    url: backend.guestUrl(`/rest/v1/rpc/${name}`),
    method: 'POST',
    data: body,
    timeout: 15000,
    header: { 'Content-Type': 'application/json', Authorization: `Bearer ${token || config.cloudbasePublishableKey}` },
    success(response) {
      if (response.statusCode >= 200 && response.statusCode < 300) resolve(response.data)
      else {
        const message = String((response.data && (response.data.message || response.data.details)) || `HTTP ${response.statusCode}`)
        reject(Object.assign(new Error(message), { code: (message.match(/[A-Z_]{6,}/) || [])[0], statusCode: response.statusCode }))
      }
    },
    fail(error) { reject(Object.assign(new Error(error && error.errMsg || 'network'), { code: 'NETWORK' })) },
  }))
}

// 同步本机缓存的状态，首页据此显示卡片与票卡
async function refreshState() {
  if (!auth.read()) return session.save({ state: 'guest' })
  const state = await rpc('guestbook_state')
  return state && state.state !== 'guest' ? session.save(state) : (session.clear(), { state: 'guest' })
}

const PHOTO_BUCKET = 'guestbook-photos'
let silentTried = false

async function removePhotos(paths) {
  const list = (paths || []).filter(Boolean)
  if (!list.length) return
  const token = await auth.accessToken()
  if (!token) return
  await new Promise((resolve, reject) => wx.request({
    url: backend.guestUrl(`/storage/v1/object/${PHOTO_BUCKET}`),
    method: 'DELETE',
    data: { prefixes: list },
    header: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    success: (response) => (response.statusCode < 300 ? resolve() : reject(new Error(`HTTP ${response.statusCode}`))),
    fail: reject,
  }))
}

const total = (reactions) => Object.values(reactions || {}).reduce((sum, value) => sum + Number(value || 0), 0)

module.exports = {
  REACTIONS,
  refreshState,

  async overview() {
    const data = await rpc('guestbook_overview', {}, { anonymous: true })
    return { stats: { notes: data.notes, today: data.today, responses: data.responses }, topic: data.topic ? { text: data.topic } : null }
  },

  listNotes(sort = 'latest') {
    return rpc('guestbook_list_notes', { p_sort: sort }, { anonymous: true }).then((list) => (list || []).map((note) => ({ ...note, total: Number(note.total || 0) })))
  },

  async getNote(id) {
    const note = await rpc('guestbook_get_note', { p_id: id }, { anonymous: true })
    if (!note) return null
    return { ...note, total: total(note.reactions), mine: note.mine || [] }
  },

  async toggleReaction(id, kind) {
    const note = await rpc('guestbook_toggle_reaction', { p_id: id, p_kind: kind })
    return { ...note, total: total(note.reactions), mine: note.mine || [] }
  },

  createNote({ content, color, signature, nickname, photoPath }) {
    return rpc('guestbook_create_note', { p_content: content, p_color: color, p_signature: signature, p_nickname: nickname || null, p_photo_path: photoPath || null })
  },

  // 照片存进 guestbook-photos，路径以本人 CloudBase 用户 ID 开头（存储权限按此校验）
  async uploadPhotos(filePaths) {
    if (!filePaths || !filePaths.length) return []
    const token = await auth.accessToken()
    const sub = auth.read() && auth.read().sub
    if (!token || !sub) throw Object.assign(new Error('LOGIN_REQUIRED'), { code: 'LOGIN_REQUIRED' })
    // 上传前重新压缩：长边约 1600px、质量 80，重新编码会去掉拍摄地点等信息
    const compressed = await Promise.all(filePaths.map((src) => new Promise((resolve) => wx.compressImage({
      src, quality: 80, compressedWidth: 1600, success: (result) => resolve(result.tempFilePath), fail: () => resolve(src),
    }))))
    return Promise.all(compressed.map((filePath, index) => new Promise((resolve, reject) => {
      const path = `${sub}/${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}.jpg`
      wx.uploadFile({
        url: backend.guestUrl(`/storage/v1/object/${PHOTO_BUCKET}/${path}`),
        filePath,
        name: 'file',
        timeout: 45000,
        header: { Authorization: `Bearer ${token}`, 'x-upsert': 'false', 'Content-Type': 'image/jpeg' },
        success(response) { response.statusCode >= 200 && response.statusCode < 300 ? resolve(path) : reject(Object.assign(new Error(`HTTP ${response.statusCode}`), { code: 'UPLOAD_FAILED' })) },
        fail() { reject(Object.assign(new Error('network'), { code: 'UPLOAD_FAILED' })) },
      })
    })))
  },

  // 照片签名地址（存储权限只放行本人和已通过审核的照片）
  async photoUrls(paths) {
    const list = (paths || []).filter(Boolean)
    if (!list.length) return {}
    const token = await auth.accessToken()
    return new Promise((resolve) => wx.request({
      url: backend.guestUrl(`/storage/v1/object/sign/${PHOTO_BUCKET}`),
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

  listMine: () => rpc('guestbook_list_mine'),

  // 床位簿条目详情：时间线点开时暂存，详情页读取
  openedEntry: null,

  updateNote({ id, content, color, signature, nickname, photoPath }) {
    return rpc('guestbook_update_note', { p_id: id, p_content: content, p_color: color, p_signature: signature, p_nickname: nickname || null, p_photo_path: photoPath || null })
  },
  // 删除留言后清理照片文件；清理失败不影响删除结果
  async deleteNote(id, photoPaths) {
    await rpc('guestbook_delete_note', { p_id: id })
    await removePhotos(photoPaths).catch(() => {})
  },
  async deleteBookEntry(id, photoPaths) {
    await rpc('guestbook_delete_book_entry', { p_id: id })
    await removePhotos(photoPaths).catch(() => {})
  },
  removePhotos: (paths) => removePhotos(paths).catch(() => {}),

  async getBook() {
    const book = await rpc('guestbook_get_book')
    return {
      room: book.room,
      bed: book.bed,
      entries: (book.entries || []).map((entry) => ({ ...entry, photos: (entry.photoPaths || []).length })),
    }
  },

  saveBookEntry({ content, color, signature, nickname, photoPaths }) {
    return rpc('guestbook_save_book_entry', { p_content: content, p_color: color, p_signature: signature, p_nickname: nickname || null, p_photo_paths: photoPaths || [] })
  },

  // 静默识别：已登录过或已有 CloudBase 用户（含自助入住时关联的）才会成功，不注册新用户
  // 本机没有凭证时，每次启动只静默找回一次已绑定的微信
  async detect() {
    try {
      if (!auth.read() && !silentTried) { silentTried = true; await auth.signIn({ signUp: false }) }
      return (await refreshState()).state
    } catch (error) {
      return 'guest'
    }
  },

  // 姓名 + 房间床位 + 微信登录。返回 { result, state }，result：bound / left / taken / not_found / limited
  async login({ name, room, bed }) {
    await auth.signIn()
    const data = await rpc('guestbook_login_by_bed', { p_name: name, p_room: room, p_bed: bed || null })
    if (data.state && data.state !== 'guest') session.save(data)
    return { result: data.result, state: data.state || 'guest' }
  },

  // 自助入住提交成功后静默关联（失败不影响入住）
  async linkSelfCheckin(submissionToken) {
    if (!submissionToken) return null
    if (!auth.read()) await auth.signIn()
    return rpc('guestbook_link_self_checkin', { p_token: submissionToken })
  },
}
