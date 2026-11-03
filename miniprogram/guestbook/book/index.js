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
  data: { book: null },
  onShow() {
    const slot = themed(this)
    if (session.read().state !== 'staying') { wx.redirectTo({ url: '/guestbook/index/index' }); return }
    api.getBook().catch(() => { wx.showToast({ title: '加载失败，请重试', icon: 'none' }); return null }).then((book) => book && this.setData({ book: { ...book, entries: book.entries.map((entry) => ({ ...entry, hue: theme.hue(slot, entry.color), photoList: Array.from({ length: entry.photos }) })) } }))
  },
  write() { wx.navigateTo({ url: '/guestbook/compose/index?mode=book' }) },
})
