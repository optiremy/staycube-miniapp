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

const total = (reactions) => Object.values(reactions || {}).reduce((sum, value) => sum + Number(value || 0), 0)

module.exports = {
  REACTIONS,
  refreshState,

  async overview() {
    const data = await rpc('guestbook_overview')
    return { stats: { notes: data.notes, today: data.today, responses: data.responses }, topic: data.topic ? { text: data.topic } : null }
  },

  listNotes(sort = 'latest') {
    return rpc('guestbook_list_notes', { p_sort: sort }).then((list) => (list || []).map((note) => ({ ...note, total: Number(note.total || 0) })))
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

  createNote({ content, color, signature }) {
    return rpc('guestbook_create_note', { p_content: content, p_color: color, p_signature: signature === 'anon' ? 'anonymous' : 'room' })
  },

  listMine: () => rpc('guestbook_list_mine'),

  async getBook() {
    const book = await rpc('guestbook_get_book')
    return {
      room: book.room,
      bed: book.bed,
      entries: (book.entries || []).map((entry) => ({ ...entry, color: 'purple', photos: (entry.photoPaths || []).length })),
    }
  },

  saveBookEntry({ content, signature }) {
    return rpc('guestbook_save_book_entry', { p_content: content, p_signature: signature === 'anon' ? 'anonymous' : 'bed' })
  },

  resolveWelcome(token) {
    if (!token) return Promise.resolve(null)
    return rpc('guestbook_resolve_welcome', { p_token: token }, { anonymous: true }).catch(() => null)
  },

  // 静默识别：已登录过或已有 CloudBase 用户（含自助入住时关联的）才会成功，不注册新用户
  async detect() {
    try {
      if (!auth.read()) await auth.signIn({ signUp: false })
      return (await refreshState()).state
    } catch (error) {
      return 'guest'
    }
  },

  // 明确登录；带欢迎图凭证时同时关联。返回 { result, state }
  async login(scene) {
    await auth.signIn()
    if (scene) {
      const bound = await rpc('guestbook_bind_welcome', { p_token: scene })
      if (bound.state && bound.state !== 'guest') session.save(bound)
      return { result: bound.result, state: bound.state || 'guest' }
    }
    const state = await refreshState()
    return { result: state.state === 'guest' ? 'unbound' : 'bound', state: state.state }
  },

  // 自助入住提交成功后静默关联（失败不影响入住）
  async linkSelfCheckin(submissionToken) {
    if (!submissionToken) return null
    if (!auth.read()) await auth.signIn()
    return rpc('guestbook_link_self_checkin', { p_token: submissionToken })
  },
}
