const theme = require('../../utils/guestbook-theme')
const session = require('../../utils/guestbook-session')
const api = require('../api')
const i18n = require('../../utils/guestbook-i18n')
const shareImage = require('../../utils/guestbook-share-image')

function themed(page) {
  const slot = theme.slotOf()
  theme.applyNavigationBar(slot)
  page.setData({ slot, pageStyle: theme.pageStyle(slot) })
  return slot
}

Page({
  data: { note: null, reactions: [], canReact: false },

  onLoad(options) { this._id = options.id || 'n1' },

  onShow() {
    const slot = themed(this)
    const t = i18n.copy()
    wx.setNavigationBarTitle({ title: t.detailTitle })
    this.setData({ t })
    const current = session.read()
    this._guest = current.state === 'guest'
    this.setData({ canReact: current.state !== 'left' })
    api.getNote(this._id).then((note) => note && this.render(slot, note)).catch(() => wx.showToast({ title: t.loadFailed, icon: 'none' }))
  },

  render(slot, note) {
    const reactions = api.REACTIONS.map((item) => ({ ...item, label: this.data.t.reactions[item.key], count: note.reactions[item.key] || 0, on: note.mine.includes(item.key) }))
    this.setData({ note: { ...note, author: i18n.author(note.author, this.data.t), style: theme.noteStyle(slot, note.color, 0.85) }, reactions })
    if (note.photoPath && !this.data.photoUrl) api.photoUrls([note.photoPath]).then((urls) => this.setData({ photoUrl: urls[note.photoPath] || '' }))
  },

  preview() { wx.previewImage({ urls: [this.data.photoUrl] }) },

  react(event) {
    if (!this.data.canReact) return
    if (this._guest) { wx.navigateTo({ url: '/guestbook/login/index' }); return }
    wx.vibrateShort({ type: 'light' })
    api.toggleReaction(this._id, event.currentTarget.dataset.key).then((note) => this.render(this.data.slot, note)).catch(() => wx.showToast({ title: this.data.t.actionFailed, icon: 'none' }))
  },

  // 分享图：登录旅客生成后，由微信菜单发给朋友、发朋友圈或保存到相册
  async shareImage() {
    if (this._guest) { wx.navigateTo({ url: '/guestbook/login/index' }); return }
    const { note, photoUrl, sharing, t } = this.data
    if (!note || sharing || (note.photoPath && !photoUrl)) return
    this.setData({ sharing: true })
    try {
      const path = await shareImage.create(this, 'shareCanvas', { text: note.content, author: note.author, date: note.fullDate || note.date, hue: theme.SLOTS.night.hues[note.color] || theme.SLOTS.night.hues.blue, photoUrl })
      wx.showShareImageMenu({ path })
    } catch (error) {
      console.error('share image failed', error)
      wx.showToast({ title: t.shareFailed, icon: 'none' })
    }
    this.setData({ sharing: false })
  },

  onShareAppMessage() {
    return { title: i18n.copy().shareTitle, path: `/guestbook/detail/index?id=${this._id}` }
  },
})
