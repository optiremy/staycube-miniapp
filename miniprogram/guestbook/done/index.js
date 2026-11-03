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
  data: { text: '', noteStyle: '', mode: 'wall' },
  onLoad(options) {
    const slot = themed(this)
    this.setData({ text: decodeURIComponent(options.text || ''), mode: options.mode || 'wall', noteStyle: theme.noteStyle(slot, options.color || 'blue', 0.9) })
  },
  back() { wx.navigateBack() },
})
