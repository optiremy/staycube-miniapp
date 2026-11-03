// 留言板登录状态。后端接入前先保存在本机，字段与后端返回保持一致：
// state: 'guest'（未登录或未关联）| 'staying'（在住）| 'left'（已离店）
const STORAGE_KEY = 'guestbook-session'

const GUEST = { state: 'guest' }

function read() {
  try {
    const value = wx.getStorageSync(STORAGE_KEY)
    if (value && ['staying', 'left'].includes(value.state)) return value
  } catch (error) {}
  return GUEST
}

function save(session) {
  try { wx.setStorageSync(STORAGE_KEY, session) } catch (error) {}
  return session
}

function clear() {
  try { wx.removeStorageSync(STORAGE_KEY) } catch (error) {}
}

module.exports = { read, save, clear }
