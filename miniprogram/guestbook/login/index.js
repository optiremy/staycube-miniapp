const theme = require('../../utils/guestbook-theme')
const api = require('../api')
const i18n = require('../../utils/guestbook-i18n')

function themed(page) {
  const slot = theme.slotOf()
  theme.applyNavigationBar(slot)
  page.setData({ slot, pageStyle: theme.pageStyle(slot) })
  return slot
}

// 登录后去往的页面；没有 next 时回到来源页（如详情页回应）
const TARGETS = { book: '/guestbook/index/index?view=book', mine: '/guestbook/mine/index', compose: '/guestbook/compose/index' }

Page({
  data: { name: '', rooms: i18n.ROOMS, roomLabels: [], roomIndex: -1, beds: i18n.BEDS, bedIndex: -1, needBed: false, ready: false, agreed: false, loading: false, taken: false },

  onLoad(options) { this._next = options.next || '' },

  onShow() {
    themed(this)
    const t = i18n.copy()
    wx.setNavigationBarTitle({ title: t.loginTitle })
    this.setData({ t, roomLabels: i18n.ROOMS.map((room) => i18n.formatBed(room, '', t.locale)) })
  },

  updateReady() {
    const { name, roomIndex, needBed, bedIndex } = this.data
    this.setData({ ready: !!name.trim() && roomIndex >= 0 && (!needBed || bedIndex >= 0) })
  },

  inputName(event) { this.setData({ name: event.detail.value }); this.updateReady() },

  // 换房间时清空床位；独立房间不选床位
  pickRoom(event) {
    const roomIndex = Number(event.detail.value)
    this.setData({ roomIndex, needBed: !i18n.PRIVATE_ROOMS.includes(i18n.ROOMS[roomIndex]), bedIndex: -1 })
    this.updateReady()
  },

  pickBed(event) { this.setData({ bedIndex: Number(event.detail.value) }); this.updateReady() },

  toggleAgree() { this.setData({ agreed: !this.data.agreed }) },

  leave(state) {
    const next = state === 'staying' || this._next === 'mine' ? TARGETS[this._next] : this._next && '/guestbook/index/index'
    if (next) wx.redirectTo({ url: next })
    else wx.navigateBack()
  },

  login() {
    const { ready, agreed, name, roomIndex, needBed, bedIndex, t } = this.data
    if (!ready || this.data.loading) return
    if (!agreed) { wx.showToast({ title: t.agreeFirst, icon: 'none' }); return }
    this.setData({ loading: true })
    api.login({ name: name.trim(), room: i18n.ROOMS[roomIndex], bed: needBed ? i18n.BEDS[bedIndex] : '' }).then(({ result, state }) => {
      this.setData({ loading: false })
      if (result === 'bound') { this.leave(state); return }
      if (result === 'left') { wx.showModal({ content: t.leftNotice, showCancel: false, success: () => this.leave(state) }); return }
      if (result === 'taken') { this.setData({ taken: true }); return }
      wx.showToast({ title: result === 'limited' ? t.tooFrequent : t.noStay, icon: 'none' })
    }).catch(() => { this.setData({ loading: false }); wx.showToast({ title: t.loginFailed, icon: 'none' }) })
  },
})
