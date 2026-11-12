const api = require('../api')
const logic = require('../logic')
const auth = require('../../utils/cloudbase-auth')

// 待整理：每次进入或返回时读取一次，下拉刷新；不轮询
Page({
  data: { groups: logic.groupTasks([]), todayUnits: 0, state: 'loading', message: '' },

  onShow() {
    this.load()
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh())
  },

  async load() {
    try {
      const result = await api.list()
      this.setData({ groups: logic.groupTasks(result.tasks), todayUnits: result.me.todayUnits, state: 'ready' })
    } catch (error) {
      if (error.code === 'NOT_BOUND' || error.code === 'LOGIN_REQUIRED') {
        // 已解绑或登录失效：清掉本机凭证，首页不再显示保洁入口
        auth.clear()
        wx.redirectTo({ url: '/cleaning/bind/index' })
        return
      }
      this.setData({ state: 'error', message: error.code === 'NETWORK' ? '网络不好，没能读取任务。' : '服务暂时不可用，没能读取任务。' })
    }
  },

  retry() {
    this.setData({ state: 'loading' })
    this.load()
  },

  openTask(event) {
    wx.navigateTo({ url: `/cleaning/task/index?id=${event.currentTarget.dataset.id}` })
  },

  openStats() {
    wx.navigateTo({ url: '/cleaning/stats/index' })
  },
})
