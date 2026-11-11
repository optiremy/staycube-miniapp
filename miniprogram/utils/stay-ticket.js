// 首页住宿票卡（房间床位、第几晚、拖鞋号）。
// 自助入住提交成功后在本机记下提交凭证；首页用它匿名调用 guest_stay_ticket 查询在住信息，不需要登录。
// 后端返回 state：staying（在住）/ pending（登记已提交，尚未办入住）/ left（已退房）/ invalid（凭证无效）。
const backend = require('./backend')

const STORAGE_KEY = 'stay-ticket'
const MAX_AGE = 45 * 24 * 3600 * 1000

// 房床写法与自助入住一致：房间名 + 空格 + 床位字母（单间只有房间名）；非中文显示房间拼音
const ROOM_PINYIN = { 曲江: 'Qujiang', 灞上: 'Bashang', 汉城: 'Hancheng', 秦都: 'Qindu', 莲湖: 'Lianhu', 长安: 'Changan', 雁塔: 'Yanta', 碑林: 'Beilin', 未央: 'Weiyang', 临潼: 'LinTong' }

function formatBed(room, bed, locale) {
  const name = locale === 'zh-CN' ? room : (ROOM_PINYIN[room] || room)
  return [name, bed].filter(Boolean).join(' ')
}

function readStore() {
  try {
    const value = wx.getStorageSync(STORAGE_KEY)
    if (value && /^[0-9a-f]{32}$/.test(value.token) && Date.now() - Number(value.savedAt || 0) < MAX_AGE) return value
  } catch (error) {}
  return null
}

function writeStore(value) {
  try { wx.setStorageSync(STORAGE_KEY, value) } catch (error) {}
}

function clear() {
  try { wx.removeStorageSync(STORAGE_KEY) } catch (error) {}
}

// 自助入住提交成功后调用；新的提交覆盖旧的
function remember(token) {
  const value = String(token || '').trim().toLowerCase()
  if (!/^[0-9a-f]{32}$/.test(value)) return
  writeStore({ token: value, savedAt: Date.now(), ticket: null })
}

// 上次查到的在住信息，首页先用它显示，避免每次打开闪一下
function cached() {
  const store = readStore()
  return store && store.ticket && store.ticket.state === 'staying' ? store.ticket : null
}

function request(token) {
  return new Promise((resolve, reject) => wx.request({
    url: backend.guestUrl('/rest/v1/rpc/guest_stay_ticket'),
    method: 'POST',
    data: { p_token: token },
    timeout: 15000,
    header: backend.guestHeaders({ 'Content-Type': 'application/json' }),
    success(response) {
      if (response.statusCode >= 200 && response.statusCode < 300) resolve(response.data || {})
      else reject(new Error(`HTTP ${response.statusCode}`))
    },
    fail(error) { reject(new Error((error && error.errMsg) || 'network')) },
  }))
}

// 返回在住票卡或 null；网络失败时保留上次结果
async function refresh() {
  const store = readStore()
  if (!store) { clear(); return null }
  let data
  try { data = await request(store.token) } catch (error) { return cached() }
  if (data.state === 'left' || data.state === 'invalid') { clear(); return null }
  const ticket = data.state === 'staying'
    ? { state: 'staying', room: data.room || '', bed: data.bed || '', slipper: data.slipper || '', nights: Number(data.nights) || 1 }
    : null
  writeStore({ ...store, ticket })
  return ticket
}

module.exports = { remember, cached, refresh, clear, formatBed }
