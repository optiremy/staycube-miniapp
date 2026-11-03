const theme = require('../../utils/guestbook-theme')
const session = require('../../utils/guestbook-session')
const api = require('../api')

function themed(page) {
  const slot = theme.slotOf()
  theme.applyNavigationBar(slot)
  page.setData({ slot, pageStyle: theme.pageStyle(slot) })
  return slot
}

function decorate(slot, list) {
  const max = Math.max(1, ...list.map((note) => note.total))
  return list.map((note) => {
    const lum = theme.luminance(note.total, max)
    return { ...note, style: theme.noteStyle(slot, note.color, lum), hue: theme.hue(slot, note.color), bright: lum > 0.7 }
  })
}

Page({
  data: { mode: 'card', sort: 'latest', left: [], right: [], list: [], staying: false },

  onShow() {
    const current = session.read()
    if (current.state === 'guest') { wx.redirectTo({ url: '/guestbook/entry/index' }); return }
    const slot = themed(this)
    this.setData({ staying: current.state === 'staying' })
    Promise.all([api.overview(), api.listNotes(this.data.sort)]).then(([overview, list]) => {
      const notes = decorate(slot, list)
      this.setData({ stats: overview.stats, topic: overview.topic, list: notes, left: notes.filter((_, i) => i % 2 === 0), right: notes.filter((_, i) => i % 2 === 1) })
    }).catch((error) => this.handleError(error))
  },

  handleError(error) {
    if (error.code === 'LOGIN_REQUIRED' || error.code === 'NOT_A_GUEST') { session.clear(); wx.redirectTo({ url: '/guestbook/entry/index' }); return }
    wx.showToast({ title: '加载失败，请重试', icon: 'none' })
  },

  setMode(event) { this.setData({ mode: event.currentTarget.dataset.mode }) },
  setSort(event) { this.setData({ sort: event.currentTarget.dataset.sort }); this.onShow() },
  openNote(event) { wx.navigateTo({ url: `/guestbook/detail/index?id=${event.currentTarget.dataset.id}` }) },
  openBook() { wx.navigateTo({ url: '/guestbook/book/index' }) },
  compose() { wx.navigateTo({ url: '/guestbook/compose/index' }) },
})
