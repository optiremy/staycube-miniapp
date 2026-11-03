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
  data: { list: [] },
  onShow() {
    const slot = themed(this)
    api.listMine().catch(() => []).then((list) => this.setData({ list: list.map((note) => ({ ...note, style: theme.noteStyle(slot, note.color, 0.3) })) }))
  },
})
