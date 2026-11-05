const theme = require('../../utils/guestbook-theme')
const api = require('../api')
const i18n = require('../../utils/guestbook-i18n')

function themed(page) {
  const slot = theme.slotOf()
  theme.applyNavigationBar(slot)
  page.setData({ slot, pageStyle: theme.pageStyle(slot) })
  return slot
}

function statusText(item, t) {
  if (item.status === 'pending') return t.pending
  if (item.status === 'rejected') return item.rejectReason ? `${t.rejected} · ${item.rejectReason}` : t.rejected
  return item.kind === 'entry' ? '' : i18n.fill(t.responses, { n: item.total })
}

Page({
  data: { list: [] },

  onShow() {
    themed(this)
    const t = i18n.copy()
    wx.setNavigationBarTitle({ title: t.mine })
    this.setData({ t })
    this.load()
  },

  async load() {
    const list = await api.listMine().catch(() => [])
    const paths = (item) => (item.kind === 'entry' ? (item.photoPaths || []) : [item.photoPath].filter(Boolean))
    const urls = await api.photoUrls(list.flatMap(paths))
    this.setData({
      list: list.map((item) => ({ ...item, photoList: paths(item).map((path) => urls[path]).filter(Boolean), source: item.kind === 'entry' ? this.data.t.book : this.data.t.wall, statusText: statusText(item, this.data.t), style: theme.noteStyle(this.data.slot, item.color, 0.3) })),
    })
  },

  previewPhoto(event) { wx.previewImage({ current: event.currentTarget.dataset.src, urls: event.currentTarget.dataset.list }) },

  edit(event) {
    const { id, kind } = event.currentTarget.dataset
    wx.navigateTo({ url: `/guestbook/compose/index?edit=${id}${kind === 'entry' ? '&mode=book' : ''}` })
  },

  remove(event) {
    const { id, kind } = event.currentTarget.dataset
    const item = this.data.list.find((entry) => entry.id === id) || {}
    const photos = kind === 'entry' ? (item.photoPaths || []) : [item.photoPath].filter(Boolean)
    wx.showModal({
      title: this.data.t.deleteConfirm,
      confirmText: this.data.t.deleteAction,
      confirmColor: '#e5484d',
      success: ({ confirm }) => {
        if (!confirm) return
        const request = kind === 'entry' ? api.deleteBookEntry(id, photos) : api.deleteNote(id, photos)
        request.then(() => this.load()).catch(() => wx.showToast({ title: this.data.t.deleteFailed, icon: 'none' }))
      },
    })
  },
})
