// 首页身份：在住票卡（房间床位、第几晚、拖鞋号）和是否保洁员，都按微信身份（openid）由后台判断。
// 打开首页时静默登录（utils/cloudbase-auth），调用 guest_home 一次取回两项；结果缓存在本机，下次打开先用缓存显示。
// 自助入住提交成功后在本机记下提交凭证，登录后用 guest_claim_checkin 把这条登记记到当前微信名下（只需成功一次）；
// 之后换手机、清缓存也能认出来。登录或 guest_home 不可用时，退回用本机凭证匿名调用 guest_stay_ticket。
// 依赖 web 仓库 cloudbase/compat/20261112120000_cloudbase_guest_wechat_identity.sql（已应用到生产库）。
const backend = require('./backend')
const auth = require('./cloudbase-auth')

const STORAGE_KEY = 'stay-ticket'
const MAX_AGE = 45 * 24 * 3600 * 1000

// 房床写法与自助入住一致：房间名 + 空格 + 床位字母（单间只有房间名）；非中文显示房间拼音
const ROOM_PINYIN = { 曲江: 'Qujiang', 灞上: 'Bashang', 汉城: 'Hancheng', 秦都: 'Qindu', 莲湖: 'Lianhu', 长安: 'Changan', 雁塔: 'Yanta', 碑林: 'Beilin', 未央: 'Weiyang', 临潼: 'LinTong' }

function formatBed(room, bed, locale) {
  const name = locale === 'zh-CN' ? room : (ROOM_PINYIN[room] || room)
  return [name, bed].filter(Boolean).join(' ')
}

function validToken(value) {
  return Boolean(value && /^[0-9a-f]{32}$/.test(value.token) && Date.now() - Number(value.savedAt || 0) < MAX_AGE)
}

// { token, savedAt, claimed, ticket, cleaner }；凭证过期后只丢凭证，身份缓存保留
function readStore() {
  let value = null
  try { value = wx.getStorageSync(STORAGE_KEY) || null } catch (error) {}
  if (!value || typeof value !== 'object') return {}
  if (value.token && !validToken(value)) return { ticket: value.ticket || null, cleaner: value.cleaner === true }
  return value
}

function writeStore(value) {
  try {
    if (!value.token && !value.ticket && !value.cleaner) wx.removeStorageSync(STORAGE_KEY)
    else wx.setStorageSync(STORAGE_KEY, value)
  } catch (error) {}
}

function dropToken(store) {
  return { ticket: store.ticket || null, cleaner: store.cleaner === true }
}

// 自助入住提交成功后调用；新的提交覆盖旧的，并立即尝试记到当前微信名下
function remember(token) {
  const value = String(token || '').trim().toLowerCase()
  if (!/^[0-9a-f]{32}$/.test(value)) return
  writeStore({ ...dropToken(readStore()), token: value, savedAt: Date.now(), claimed: false })
  refresh().catch(() => {})
}

// 上次查到的在住信息，首页先用它显示，避免每次打开闪一下
function cached() {
  const ticket = readStore().ticket
  return ticket && ticket.state === 'staying' ? ticket : null
}

function cachedCleaner() {
  return readStore().cleaner === true
}

function post(name, data, header) {
  return new Promise((resolve, reject) => wx.request({
    url: backend.guestUrl(`/rest/v1/rpc/${name}`),
    method: 'POST',
    data,
    timeout: 15000,
    header: { 'Content-Type': 'application/json', ...header },
    success(response) {
      if (response.statusCode >= 200 && response.statusCode < 300) resolve(response.data || {})
      else reject(Object.assign(new Error(`HTTP ${response.statusCode}`), { statusCode: response.statusCode }))
    },
    fail(error) { reject(Object.assign(new Error((error && error.errMsg) || 'network'), { network: true })) },
  }))
}

function toTicket(data) {
  return data && data.state === 'staying'
    ? { state: 'staying', room: data.room || '', bed: data.bed || '', slipper: data.slipper || '', nights: Number(data.nights) || 1 }
    : null
}

// 已登录用已有凭证，否则静默登录；登录不了返回 null
async function accessToken() {
  try {
    return (await auth.accessToken()) || (await auth.signIn()).accessToken || null
  } catch (error) {
    return null
  }
}

// 按微信身份查询；任何一步失败都抛出，由 refresh 退回匿名查询
async function refreshByIdentity() {
  const token = await accessToken()
  if (!token) throw new Error('LOGIN_UNAVAILABLE')
  const header = { Authorization: `Bearer ${token}` }
  let store = readStore()
  if (store.token && !store.claimed) {
    const result = await post('guest_claim_checkin', { p_token: store.token }, header)
    store = readStore()
    if (store.token) writeStore(result.state === 'invalid' ? dropToken(store) : { ...store, claimed: true })
  }
  let home
  try {
    home = await post('guest_home', {}, header)
  } catch (error) {
    // 登录凭证被后台拒绝：清掉，下次打开重新登录
    if (error.statusCode === 401) auth.clear()
    throw error
  }
  const ticket = toTicket(home.ticket)
  writeStore({ ...readStore(), ticket, cleaner: home.cleaner === true })
  return ticket
}

// 退路：本机有提交凭证时匿名查询（与改用微信身份之前相同）
async function refreshByToken() {
  const store = readStore()
  if (!store.token) return cached()
  let data
  try { data = await post('guest_stay_ticket', { p_token: store.token }, backend.guestHeaders()) } catch (error) { return cached() }
  if (data.state === 'left' || data.state === 'invalid') { writeStore(dropToken({ ...readStore(), ticket: null })); return null }
  const ticket = toTicket(data)
  writeStore({ ...readStore(), ticket })
  return ticket
}

let pending = null

// 返回在住票卡或 null，并更新保洁员身份缓存；网络失败时保留上次结果。同时只跑一次
function refresh() {
  if (!pending) {
    pending = refreshByIdentity().catch(() => refreshByToken()).finally(() => { pending = null })
  }
  return pending
}

function clear() {
  try { wx.removeStorageSync(STORAGE_KEY) } catch (error) {}
}

module.exports = { remember, cached, cachedCleaner, refresh, clear, formatBed }
