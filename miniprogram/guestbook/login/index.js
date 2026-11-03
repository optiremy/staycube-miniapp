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
  data: { welcome: null, agreed: false, loading: false },

  // 欢迎图小程序码以 scene 参数带入凭证
  onLoad(options) {
    const scene = options.scene ? decodeURIComponent(options.scene) : ''
    this._scene = scene
    api.resolveWelcome(scene).then((welcome) => this.setData({ welcome }))
  },

  onShow() { themed(this) },
  toggleAgree() { this.setData({ agreed: !this.data.agreed }) },

  login() {
    if (!this.data.agreed) { wx.showToast({ title: '请先阅读并同意', icon: 'none' }); return }
    this.setData({ loading: true })
    api.login(this._scene).then(({ result }) => {
      if (result === 'taken') { this.setData({ loading: false, taken: true }); return }
      if (result === 'unbound' || result === 'invalid') { wx.redirectTo({ url: '/guestbook/entry/index' }); return }
      wx.redirectTo({ url: '/guestbook/index/index' })
    })
      .catch(() => { this.setData({ loading: false }); wx.showToast({ title: '登录失败，请重试', icon: 'none' }) })
  },
})
