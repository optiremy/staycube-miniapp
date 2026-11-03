const theme = require('../../utils/guestbook-theme')
const session = require('../../utils/guestbook-session')
const api = require('../api')

function themed(page) {
  const slot = theme.slotOf()
  theme.applyNavigationBar(slot)
  page.setData({ slot, pageStyle: theme.pageStyle(slot) })
  return slot
}

Page({
  data: { note: null, reactions: [], canReact: false, isGuest: false },

  onLoad(options) { this._id = options.id || 'n1' },

  onShow() {
    const slot = themed(this)
    const current = session.read()
    this.setData({ canReact: current.state === 'staying', isGuest: current.state === 'guest' })
    api.getNote(this._id).then((note) => note && this.render(slot, note)).catch(() => wx.showToast({ title: '加载失败，请重试', icon: 'none' }))
  },

  render(slot, note) {
    const reactions = api.REACTIONS.map((item) => ({ ...item, count: note.reactions[item.key] || 0, on: note.mine.includes(item.key) }))
    this.setData({ note: { ...note, style: theme.noteStyle(slot, note.color, 0.85) }, reactions })
  },

  react(event) {
    if (!this.data.canReact) return
    wx.vibrateShort({ type: 'light' })
    api.toggleReaction(this._id, event.currentTarget.dataset.key).then((note) => this.render(this.data.slot, note)).catch(() => wx.showToast({ title: '操作失败，请重试', icon: 'none' }))
  },

  onShareAppMessage() {
    return { title: '肆方空间旅客留言', path: `/guestbook/detail/index?id=${this._id}` }
  },
})
