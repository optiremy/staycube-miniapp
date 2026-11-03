const selfCheckinDrafts = require('../../utils/self-checkin-drafts')
const copyData = require('../../data/self-checkin-copy')
const globalCopy = require('../../data/global-copy')
const appLocale = require('../../utils/app-locale')
const share = require('../../utils/share')
const guestbookSession = require('../../utils/guestbook-session')
const guestbookTheme = require('../../utils/guestbook-theme')
const guestbookApi = require('../../utils/guestbook-api')

// 按入住前后排序；在住时行李寄存最常用，排在第一位。
function buildServices(home, staying) {
  const services = [
    { key: 'pre-arrival', title: home.preArrival, path: '/pages/pre-arrival/index' },
    { key: 'self-checkin', title: home.checkin, path: '/pages/index/index' },
    { key: 'luggage-storage', title: home.luggage, path: '/pages/luggage-storage/index' },
    { key: 'special-cancellation', title: home.specialCancellation, path: '/pages/special-cancellation/index' },
  ]
  if (!staying) return services
  return [services[2], services[0], services[1], services[3]]
}

function buildGuestbook(board, session) {
  const slot = guestbookTheme.slotOf()
  const view = { state: session.state, tone: ['dusk', 'night'].includes(slot) ? 'night' : 'day' }
  if (session.state !== 'staying') return view
  return {
    ...view,
    bed: session.bed,
    roomLabel: board.room.replace('{n}', session.room),
    nightParts: board.night.split('{n}'),
    nights: session.nights,
    slipper: session.slipper,
  }
}

function formatCheckinDate(locale, value, copy) {
  const parts = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!parts) return copy.checkinDateUnknown
  if (locale === 'zh-CN') return `${parts[1]}年${Number(parts[2])}月${Number(parts[3])}日`
  return `${parts[1]}-${parts[2]}-${parts[3]}`
}

const initialLocale = 'zh-CN'

Page(share.withShare('pages/home/index', null, {
  data: {
    locale: initialLocale,
    copy: globalCopy[initialLocale],
    services: buildServices(globalCopy[initialLocale].home, false),
    guestbook: { state: 'guest', tone: 'night' },
    drafts: [],
    draftModalVisible: false,
  },

  // 草稿弹窗只在首次打开首页和小程序回到前台（App.onShow）时自动弹出；
  // 从其他页面返回首页时保持旅客上次的选择，不再重复打扰。
  onShow() {
    this.applyLocale(appLocale.getLocale())
    guestbookApi.refreshState().then(() => this.applyLocale(this.data.locale)).catch(() => {})
    this.refreshDraftModal(this._draftPrompted === true)
    this._draftPrompted = true
  },

  // 留言板状态随时可能变化（登录、退房、时段），每次显示首页都重新计算。
  applyLocale(locale) {
    const copy = globalCopy[locale] || globalCopy['zh-CN']
    const session = guestbookSession.read()
    this.setData({
      locale,
      copy,
      services: buildServices(copy.home, session.state === 'staying'),
      guestbook: buildGuestbook(copy.board, session),
    })
  },

  changeLocale(event) {
    this.applyLocale(event.detail.locale)
    this.refreshDraftModal(true)
  },

  refreshDraftModal(keepVisibility) {
    const locale = this.data.locale
    const copy = this.data.copy.draft
    const drafts = selfCheckinDrafts.listDrafts().filter((draft) => /^\d{6}$/.test(String(draft.accessCode || ''))).map((draft) => {
      // 步骤名称按当前显示语言；草稿本身仍按登记时的语言恢复。
      const text = copyData.locales[locale] || copyData.locales['zh-CN']
      const updated = new Date(draft.updatedAt)
      const now = new Date()
      const sameDay = updated.getFullYear() === now.getFullYear() && updated.getMonth() === now.getMonth() && updated.getDate() === now.getDate()
      const time = `${String(updated.getHours()).padStart(2, '0')}:${String(updated.getMinutes()).padStart(2, '0')}`
      const otherDay = locale === 'zh-CN' ? `${updated.getMonth() + 1}月${updated.getDate()}日 ${time}` : `${String(updated.getMonth() + 1).padStart(2, '0')}-${String(updated.getDate()).padStart(2, '0')} ${time}`
      return {
        ...draft,
        guestName: draft.guestName || copy.nameMissing,
        checkinDateLabel: formatCheckinDate(locale, draft.checkinDate, copy),
        stepLabel: text.stepTitles[draft.step] || text.stepTitles[0],
        lastUpdatedLabel: sameDay ? `${copy.today} ${time}` : otherDay,
      }
    })
    const visible = keepVisibility === true ? this.data.draftModalVisible && drafts.length > 0 : drafts.length > 0
    this.setData({ drafts: drafts.slice(0, 3), activeDraft: drafts[0] || null, draftModalVisible: visible })
  },

  openService(event) {
    const path = event.currentTarget.dataset.path
    if (!path) return
    wx.navigateTo({ url: path })
  },

  openGuestbook(event) {
    const page = event.currentTarget.dataset.page || 'index'
    wx.navigateTo({ url: `/guestbook/${page}/index` })
  },

  resumeDraft(event) {
    this.setData({ draftModalVisible: false })
    const recordId = event.currentTarget.dataset.id
    const draft = selfCheckinDrafts.getDraft(recordId)
    if (!draft || !/^\d{6}$/.test(String(draft.accessCode || ''))) {
      this.refreshDraftModal()
      wx.showToast({ title: this.data.copy.draft.expired, icon: 'none' })
      return
    }
    const locale = encodeURIComponent(draft.locale || 'zh-CN')
    wx.navigateTo({ url: `/pages/index/index?draft=${encodeURIComponent(recordId)}&locale=${locale}` })
  },

  deleteDraft(event) {
    const recordId = event.currentTarget.dataset.id
    const copy = this.data.copy.draft
    wx.showModal({
      title: copy.removeTitle,
      content: copy.removeContent,
      confirmText: copy.remove,
      confirmColor: '#b42318',
      success: (result) => {
        if (!result.confirm) return
        selfCheckinDrafts.removeDraft(recordId)
        this.refreshDraftModal(true)
      },
    })
  },

  closeDraftModal() {
    this.setData({ draftModalVisible: false })
  },

  stopDraftModal(event) {
    if (event && event.stopPropagation) event.stopPropagation()
  },
}))
