const theme = require('../../utils/guestbook-theme')
const session = require('../../utils/guestbook-session')
const api = require('../api')
const i18n = require('../../utils/guestbook-i18n')

function themed(page) {
  const slot = theme.slotOf()
  theme.applyNavigationBar(slot)
  page.setData({ slot, pageStyle: theme.pageStyle(slot) })
  return slot
}

Page({
  data: { text: '', noteStyle: '', mode: 'wall' },
  onLoad(options) {
    const slot = themed(this)
    const t = i18n.copy()
    const place = options.mode === 'book' ? t.book : t.wall
    this.setData({ t, showsIn: i18n.fill(t.showsIn, { place }), backText: i18n.fill(t.back, { place }), text: decodeURIComponent(options.text || ''), mode: options.mode || 'wall', noteStyle: theme.noteStyle(slot, options.color || 'blue', 0.9) })
  },
  back() { wx.navigateBack() },
})
