const api = require('../api')

Page({
  data: { groups: [], todayUnits: 0, loaded: false },

  onShow() {
    if (!api.worker()) {
      wx.redirectTo({ url: '/cleaning/bind/index' })
      return
    }
    this.load()
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh())
  },

  async load() {
    try {
      const result = await api.tasks()
      this.setData({ groups: result.groups, todayUnits: result.todayUnits, loaded: true })
    } catch (error) {
      wx.showToast({ title: '加载失败，请下拉重试', icon: 'none' })
    }
  },

  openTask(event) {
    wx.navigateTo({ url: `/cleaning/task/index?id=${event.currentTarget.dataset.id}` })
  },

  openStats() {
    wx.navigateTo({ url: '/cleaning/stats/index' })
  },
})
