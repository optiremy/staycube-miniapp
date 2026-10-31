// 页面分享：转发给好友 / 分享到朋友圈。
// 只分享页面入口，不带入住码(code/scene)、草稿 id 等个人参数，避免把他人入住信息转发出去。
const globalCopy = require('../data/global-copy')

const BRAND = 'stayCube'

function shareTitle(key, locale) {
  const copy = globalCopy[locale] || globalCopy['zh-CN']
  const name = key && copy.home && copy.home[key]
  return name ? `${BRAND} · ${name}` : BRAND
}

function enableShareMenu(api = typeof wx === 'undefined' ? null : wx) {
  if (!api || typeof api.showShareMenu !== 'function') return
  api.showShareMenu({ withShareTicket: true, menus: ['shareAppMessage', 'shareTimeline'] })
}

// route: 页面路径（不带开头斜杠）；titleKey: global-copy 中 home 下的标题键，首页传 null
function withShare(route, titleKey, options) {
  const originOnLoad = options.onLoad
  return Object.assign({}, options, {
    onLoad(query) {
      enableShareMenu()
      if (typeof originOnLoad === 'function') return originOnLoad.call(this, query)
    },
    onShareAppMessage() {
      return { title: shareTitle(titleKey, this.data && this.data.locale), path: `/${route}` }
    },
    onShareTimeline() {
      return { title: shareTitle(titleKey, this.data && this.data.locale), query: '' }
    },
  })
}

module.exports = { withShare, shareTitle, enableShareMenu }
