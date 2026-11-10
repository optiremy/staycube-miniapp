const api = require('../api')

// 扫员工生成的小程序码进入，scene 为一次性绑定码；没有绑定码或无效时显示「已失效 / 未绑定」
Page({
  data: { state: 'loading', name: '', busy: false },

  async onLoad(options) {
    this.token = decodeURIComponent(options.scene || options.token || '')
    if (!this.token) {
      this.setData({ state: api.worker() ? 'bound' : 'unbound', name: (api.worker() || {}).name || '' })
      return
    }
    const preview = await api.bindPreview(this.token)
    this.setData(preview ? { state: 'ready', name: preview.name } : { state: 'invalid' })
  },

  async bind() {
    if (this.data.busy) return
    this.setData({ busy: true })
    try {
      const worker = await api.bind(this.token)
      this.setData({ state: 'bound', name: worker.name, busy: false })
    } catch (error) {
      this.setData({ state: 'invalid', busy: false })
    }
  },

  openTasks() {
    wx.reLaunch({ url: '/cleaning/index/index' })
  },
})
