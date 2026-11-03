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
  data: { checking: true },

  onShow() {
    themed(this)
    api.detect().then((state) => {
      if (state === 'staying' || state === 'left') { wx.redirectTo({ url: '/guestbook/index/index' }); return }
      this.setData({ checking: false })
    })
  },

  // 扫欢迎图上的小程序码（相机或相册），取出其中的凭证再进入登录页
  scan() {
    wx.scanCode({ scanType: ['wxCode', 'qrCode'], success: (result) => {
      const match = String(result.path || result.result || '').match(/scene=([^&]+)/)
      if (!match) { wx.showToast({ title: '未识别到欢迎图二维码', icon: 'none' }); return }
      wx.redirectTo({ url: `/guestbook/login/index?scene=${match[1]}` })
    } })
  },

})
