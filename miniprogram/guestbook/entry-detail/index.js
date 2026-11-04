const theme = require('../../utils/guestbook-theme')
const api = require('../api')
const i18n = require('../../utils/guestbook-i18n')

Page({
  data: { entry: null },
  onLoad() {
    const slot = theme.slotOf()
    theme.applyNavigationBar(slot)
    wx.setNavigationBarTitle({ title: i18n.copy().book })
    const entry = api.openedEntry
    if (!entry) { wx.navigateBack(); return }
    this.setData({ pageStyle: theme.pageStyle(slot), entry, hue: theme.hue(slot, entry.color) })
  },
  preview(event) { wx.previewImage({ current: event.currentTarget.dataset.src, urls: this.data.entry.photoList }) },
})
