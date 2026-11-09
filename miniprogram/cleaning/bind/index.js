const api = require('../api')
const logic = require('../logic')

// 扫员工生成的小程序码进入，scene 为一次性绑定码。没有绑定码时查看当前微信是否已绑定。
Page({
  data: { state: 'loading', name: '', message: '', busy: false },

  async onLoad(options) {
    this.token = decodeURIComponent(options.scene || options.token || '').trim()
    if (this.token) {
      this.setData({ state: 'ready' })
      return
    }
    try {
      const me = await api.me()
      this.setData({ state: 'bound', name: me.name })
    } catch (error) {
      this.setData(error.code === 'NOT_BOUND' || error.code === 'LOGIN_REQUIRED' ? { state: 'unbound' } : { state: 'error', message: logic.errorText(error, '服务暂时不可用，请稍后再试。') })
    }
  },

  async bind() {
    if (this.data.busy) return
    this.setData({ busy: true, message: '' })
    try {
      const worker = await api.bind(this.token)
      this.setData({ state: 'bound', name: worker.name, busy: false })
    } catch (error) {
      if (error.code === 'TOKEN_INVALID') this.setData({ state: 'invalid', busy: false })
      else this.setData({ busy: false, message: logic.errorText(error, '绑定失败，请重试。') })
    }
  },

  openTasks() {
    wx.reLaunch({ url: '/cleaning/index/index' })
  },
})
