const copyData = require('../../data/pre-arrival-copy')
const { PreArrivalApiError, preArrivalApi } = require('../../utils/pre-arrival-api')
const { createRequestId } = require('../../utils/guest-transport')
const { arrivalNotice } = require('../../utils/pre-arrival-flow')
const globalCopy = require('../../data/global-copy')
const appLocale = require('../../utils/app-locale')
const { COUNTRY_CODES, DEFAULT_COUNTRY_CODE, isValidPhone } = require('../../utils/phone-input')
const { openHostelLocation } = require('../../utils/pre-arrival-map')
const share = require('../../utils/share')
const timeTheme = require('../../utils/guestbook-theme')

const DEFAULT_FORM = () => ({ guestName: '', contactMethod: 'phone', countryCode: DEFAULT_COUNTRY_CODE, contactValue: '', arrivalTime: '18:00', bedPreference: 'all', guestNote: '' })

Page(share.withShare('pages/pre-arrival/index', 'preArrival', {
  data: {
    screen: 'form',
    countryCodes: COUNTRY_CODES,
    locale: 'zh-CN',
    globalText: globalCopy['zh-CN'],
    text: copyData.locales['zh-CN'],
    form: DEFAULT_FORM(),
    errorText: '',
    submitting: false,
    notice: '',
    guideImageFailed: false,
  },

  onShow() {
    this.setData(timeTheme.themeData())
  },

  onLoad() {
    this._submissionRequestId = createRequestId()
    this.applyLocale(appLocale.getLocale())
  },

  applyLocale(locale) {
    if (!copyData.locales[locale]) return
    this.setData({ locale, text: copyData.locales[locale], globalText: globalCopy[locale], errorText: '' })
    if (typeof wx !== 'undefined' && wx.setNavigationBarTitle) wx.setNavigationBarTitle({ title: globalCopy[locale].home.preArrival })
  },

  changeLocale(event) {
    if (this.data.submitting) return
    this.applyLocale(event.detail.locale)
  },

  updateCountryCode(event) {
    const countryCode = COUNTRY_CODES[Number(event.detail.value)]
    if (countryCode) this.setData({ 'form.countryCode': countryCode, errorText: '' })
  },

  contactError() {
    const { form, globalText } = this.data
    const value = String(form.contactValue || '').trim()
    if (form.contactMethod === 'email') return /^\S+@\S+\.\S+$/.test(value) ? '' : globalText.phone.emailInvalid
    const countryCode = form.countryCode || DEFAULT_COUNTRY_CODE
    if (isValidPhone(countryCode, value)) return ''
    return countryCode === '+86' ? globalText.phone.invalidMainland : globalText.phone.invalid
  },

  returnHome() {
    if (this.data.submitting) return
    if (getCurrentPages().length > 1) wx.navigateBack()
    else wx.reLaunch({ url: '/pages/home/index' })
  },

  updateForm(event) {
    const field = event.currentTarget.dataset.field
    if (!['guestName', 'contactValue', 'arrivalTime', 'guestNote'].includes(field)) return
    this.setData({ [`form.${field}`]: event.detail.value, errorText: '' })
  },

  changeContactMethod(event) {
    const contactMethod = event.detail.value
    if (!['phone', 'email'].includes(contactMethod)) return
    this.setData({ 'form.contactMethod': contactMethod, 'form.contactValue': '', errorText: '' })
  },

  changeBedPreference(event) {
    const bedPreference = event.detail.value
    if (!['upper', 'lower', 'all'].includes(bedPreference)) return
    this.setData({ 'form.bedPreference': bedPreference })
  },

  onGuideImageError() {
    this.setData({ guideImageFailed: true })
  },

  previewGuideImage() {
    if (this.data.guideImageFailed) return
    const path = '/assets/pre-arrival-daytime-guide.jpg'
    wx.previewImage({ current: path, urls: [path] })
  },

  async submit() {
    if (this.data.submitting) return
    if (!String(this.data.form.guestName || '').trim()) {
      this.setData({ errorText: this.data.text.required })
      return
    }
    const contactError = this.contactError()
    if (contactError) {
      this.setData({ errorText: contactError })
      return
    }
    this.setData({ submitting: true, errorText: '' })
    try {
      await preArrivalApi.submit({ requestId: this._submissionRequestId, locale: this.data.locale, ...this.data.form })
      this.setData({ screen: 'result', notice: arrivalNotice(this.data.form.arrivalTime) })
    } catch (error) {
      const text = this.data.text
      const message = error instanceof PreArrivalApiError && error.kind === 'validation' ? text.required : error instanceof PreArrivalApiError && error.kind === 'uncertain' ? text.uncertain : text.genericError
      this.setData({ errorText: message })
    } finally {
      this.setData({ submitting: false })
    }
  },

  openMap() {
    openHostelLocation(wx).catch(() => {
      wx.showToast({ title: this.data.text.mapOpenFailed, icon: 'none' })
    })
  },

  newSubmission() {
    this._submissionRequestId = createRequestId()
    this.setData({ screen: 'form', form: DEFAULT_FORM(), errorText: '', notice: '', guideImageFailed: false })
  },
}))
