const globalCopy = require('../../data/global-copy')
const appLocale = require('../../utils/app-locale')

const options = appLocale.SUPPORTED.map((locale) => ({ locale, label: globalCopy[locale].label }))

Component({
  properties: {
    locale: { type: String, value: 'zh-CN' },
    // 自助入住开始登记后，入住须知按语言下发，不能中途切换。
    locked: { type: Boolean, value: false },
  },

  data: { options, open: false, copy: globalCopy['zh-CN'].language, currentLabel: globalCopy['zh-CN'].label },

  observers: {
    locale(locale) {
      const copy = globalCopy[locale] || globalCopy['zh-CN']
      this.setData({ copy: copy.language, currentLabel: copy.label })
    },
  },

  methods: {
    openSheet() {
      if (this.data.locked) {
        wx.showToast({ title: this.data.copy.lockedHint, icon: 'none', duration: 2500 })
        return
      }
      this.setData({ open: true })
    },

    closeSheet() {
      this.setData({ open: false })
    },

    stop() {},

    choose(event) {
      const locale = event.currentTarget.dataset.locale
      this.setData({ open: false })
      if (!appLocale.setLocale(locale) || locale === this.data.locale) return
      this.triggerEvent('change', { locale })
    },
  },
})
