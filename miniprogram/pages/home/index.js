const selfCheckinDrafts = require('../../utils/self-checkin-drafts')
const copyData = require('../../data/self-checkin-copy')
const globalCopy = require('../../data/global-copy')
const appLocale = require('../../utils/app-locale')
const share = require('../../utils/share')

function buildServices(home) {
  return [
    { key: 'self-checkin', title: home.checkin, path: '/pages/index/index' },
    { key: 'luggage-storage', title: home.luggage, path: '/pages/luggage-storage/index' },
    { key: 'pre-arrival', title: home.preArrival, path: '/pages/pre-arrival/index' },
    { key: 'special-cancellation', title: home.specialCancellation, path: '/pages/special-cancellation/index' },
  ]
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
    services: buildServices(globalCopy[initialLocale].home),
    drafts: [],
    draftModalVisible: false,
  },

  onShow() {
    this.applyLocale(appLocale.getLocale())
    this.refreshDraftModal()
  },

  applyLocale(locale) {
    const copy = globalCopy[locale] || globalCopy['zh-CN']
    if (locale === this.data.locale && this.data.services.length) return
    this.setData({ locale, copy, services: buildServices(copy.home) })
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
        checkinDateLabel: formatCheckinDate(locale, draft.checkinDate, copy),
        stepLabel: text.stepTitles[draft.step] || text.stepTitles[0],
        lastUpdatedLabel: sameDay ? `${copy.today} ${time}` : otherDay,
      }
    })
    const visible = keepVisibility === true ? this.data.draftModalVisible && drafts.length > 0 : drafts.length > 0
    this.setData({ drafts, activeDraft: drafts[0] || null, draftModalVisible: visible })
  },

  openService(event) {
    const path = event.currentTarget.dataset.path
    if (!path) return
    wx.navigateTo({ url: path })
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
        this.refreshDraftModal()
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
