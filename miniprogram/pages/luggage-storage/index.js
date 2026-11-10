const copyData = require('../../data/luggage-storage-copy')
const { LuggageStorageApiError, luggageStorageApi } = require('../../utils/luggage-storage-api')
const { compressImageToLimit } = require('../../utils/image-processing')
const globalCopy = require('../../data/global-copy')
const appLocale = require('../../utils/app-locale')
const { COUNTRY_CODES, DEFAULT_COUNTRY_CODE, isValidPhone, formatPhone } = require('../../utils/phone-input')
const { createRequestId } = require('../../utils/guest-transport')
const share = require('../../utils/share')
const timeTheme = require('../../utils/guestbook-theme')

const claimTimeOptions = Array.from({ length: 51 }, (_, index) => {
  const totalMinutes = 10 * 60 + index * 15
  const hour = Math.floor(totalMinutes / 60)
  const minute = totalMinutes % 60
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
})
const defaultForm = () => ({
  guest_name: '',
  contact_method: 'phone',
  country_code: DEFAULT_COUNTRY_CODE,
  contact: '',
  claim_date: '',
  claim_time: '10:00',
  fee_acknowledged: false,
  claim_hours_acknowledged: false,
  unclaimed_policy_acknowledged: false,
  no_valuables_acknowledged: false,
  privacy_accepted: false,
})

function shanghaiToday() {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function shanghaiNow() {
  const local = new Date(Date.now() + 8 * 60 * 60 * 1000)
  return { date: local.toISOString().slice(0, 10), minutes: local.getUTCHours() * 60 + local.getUTCMinutes() }
}

function defaultClaim() {
  const now = shanghaiNow()
  const next = Math.floor(now.minutes / 15) + 1
  if (next > 90) {
    const tomorrow = new Date(Date.now() + 8 * 60 * 60 * 1000 + 86400000).toISOString().slice(0, 10)
    return { date: tomorrow, index: 0 }
  }
  return { date: now.date, index: Math.max(0, next - 40) }
}

function claimTimeIsPast(form) {
  const now = shanghaiNow()
  if (form.claim_date !== now.date) return false
  const [hour, minute] = String(form.claim_time).split(':').map(Number)
  return hour * 60 + minute <= now.minutes
}

Page(share.withShare('pages/luggage-storage/index', 'luggage', {
  data: {
    screen: 'form',
    formStep: 0,
    claimTimeOptions,
    claimTimeIndex: 0,
    countryCodes: COUNTRY_CODES,
    locale: 'zh-CN',
    globalText: globalCopy['zh-CN'],
    text: copyData.locales['zh-CN'],
    photoActions: copyData.photoActions['zh-CN'],
    errorCopy: copyData.errorCopy['zh-CN'],
    form: defaultForm(),
    today: '',
    photoPath: '',
    photoName: '',
    errorText: '',
    loading: false,
    submitting: false,
    photoProcessing: false,
  },

  onShow() {
    this.setData(timeTheme.themeData())
  },

  onLoad() {
    this._draftRequestId = createRequestId()
    this._photoUploadId = Date.now()
    this._context = null
    this._draft = null
    this._photoStoragePath = ''
    this._submitTask = false
    const today = shanghaiToday()
    const claim = defaultClaim()
    this.setData({ today, 'form.claim_date': claim.date, 'form.claim_time': claimTimeOptions[claim.index], claimTimeIndex: claim.index })
    this.applyLocale(appLocale.getLocale())
    this.loadPublicContext()
  },

  async loadPublicContext() {
    this.setData({ loading: true, errorText: '' })
    try {
      const context = await luggageStorageApi.getPublicContext()
      const previousToday = this.data.today
      this._context = context
      this.setData({
        today: context.today,
        ...((!this.data.form.claim_date || this.data.form.claim_date === previousToday)
          ? { 'form.claim_date': context.today }
          : {}),
        errorText: '',
      })
    } catch (error) {
      this.setData({ errorText: this.messageFor(error, this.data.errorCopy.service) })
    } finally {
      this.setData({ loading: false })
    }
  },

  applyLocale(locale) {
    this.setData({ locale, text: copyData.locales[locale], globalText: globalCopy[locale], photoActions: copyData.photoActions[locale], errorCopy: copyData.errorCopy[locale], errorText: '' })
    if (typeof wx !== 'undefined' && wx.setNavigationBarTitle) wx.setNavigationBarTitle({ title: globalCopy[locale].home.luggage })
  },

  changeLocale(event) {
    if (this.data.submitting) return
    this.applyLocale(event.detail.locale)
  },

  returnHome() {
    if (this.data.submitting) return
    if (getCurrentPages().length > 1) wx.navigateBack()
    else wx.reLaunch({ url: '/pages/home/index' })
  },

  editRegistration() {
    if (this.data.submitting) return
    wx.reLaunch({ url: '/pages/home/index' })
  },

  nextFormStep() {
    const { form, text, today } = this.data
    if (!form.guest_name.trim() || !form.contact.trim() || !form.claim_date || !form.claim_time) {
      this.setData({ errorText: text.missingFieldsError })
      return
    }
    const contactError = this.contactError()
    if (contactError) {
      this.setData({ errorText: contactError })
      return
    }
    if (form.claim_date < today) {
      this.setData({ errorText: text.dateError })
      return
    }
    if (form.claim_time < '10:00' || form.claim_time > '22:30') {
      this.setData({ errorText: text.timeError })
      return
    }
    if (claimTimeIsPast(form)) { this.setData({ errorText: text.pastTimeError }); return }
    this.setData({ formStep: 1, errorText: '' })
  },

  previousFormStep() {
    if (this.data.submitting) return
    this.setData({ formStep: 0, errorText: '' })
  },

  updateFeeAcknowledgement(event) {
    this.setData({ 'form.fee_acknowledged': (event.detail.value || []).includes('fee'), errorText: '' })
  },

  updateForm(event) {
    const field = event.currentTarget.dataset.field
    if (!field || !Object.prototype.hasOwnProperty.call(this.data.form, field)) return
    this.setData({ [`form.${field}`]: event.detail.value, errorText: '' })
  },

  updateContactMethod(event) {
    const method = event.detail.value
    if (!['phone', 'email'].includes(method)) return
    this.setData({ 'form.contact_method': method, 'form.contact': '', errorText: '' })
  },

  updateCountryCode(event) {
    const countryCode = COUNTRY_CODES[Number(event.detail.value)]
    if (countryCode) this.setData({ 'form.country_code': countryCode, errorText: '' })
  },

  contactError() {
    const { form, globalText } = this.data
    if (form.contact_method === 'email') return /^\S+@\S+\.\S+$/.test(form.contact.trim()) ? '' : globalText.phone.emailInvalid
    const countryCode = form.country_code || DEFAULT_COUNTRY_CODE
    if (isValidPhone(countryCode, form.contact)) return ''
    return countryCode === '+86' ? globalText.phone.invalidMainland : globalText.phone.invalid
  },

  updateClaimDate(event) {
    this.setData({ 'form.claim_date': event.detail.value, errorText: '' })
  },

  updateClaimTime(event) {
    const index = Number(event.detail.value)
    const time = claimTimeOptions[index]
    if (time) this.setData({ 'form.claim_time': time, claimTimeIndex: index, errorText: '' })
  },

  updateAcknowledgements(event) {
    const checked = event.detail.value || []
    this.setData({
      'form.claim_hours_acknowledged': checked.includes('claim_hours'),
      'form.unclaimed_policy_acknowledged': checked.includes('unclaimed_policy'),
      'form.no_valuables_acknowledged': checked.includes('no_valuables'),
      errorText: '',
    })
  },

  updatePrivacy(event) {
    this.setData({ 'form.privacy_accepted': (event.detail.value || []).includes('privacy'), errorText: '' })
  },

  getPhotoCanvas() {
    return new Promise((resolve, reject) => {
      wx.createSelectorQuery().in(this).select('#photo-processing-canvas').fields({ node: true }).exec((result) => {
        const canvas = result && result[0] && result[0].node
        if (canvas) resolve(canvas)
        else reject(new Error('image-processing-failed'))
      })
    })
  },

  choosePhoto(event) {
    if (this.data.submitting || this.data.photoProcessing) return
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: async (result) => {
        this.setData({ photoProcessing: true, errorText: '' })
        try {
          if (!this._context) this._context = await luggageStorageApi.getPublicContext()
          const canvas = await this.getPhotoCanvas()
          const path = await compressImageToLimit(result.tempFilePaths[0], this._context.maxPhotoBytes, {
            canvas,
            maxLongEdge: 1800,
            minLongEdge: 720,
          })
          const name = (result.tempFiles && result.tempFiles[0] && result.tempFiles[0].path || result.tempFilePaths[0]).split('/').pop() || 'luggage.jpg'
          this._photoStoragePath = ''
          this._photoUploadId = Date.now()
          this.setData({ photoPath: path, photoName: name, errorText: '' })
        } catch (error) {
          const fallback = this.data.errorCopy.photo
          this.setData({ errorText: this.messageFor(error, fallback) })
        } finally {
          this.setData({ photoProcessing: false })
        }
      },
    })
  },

  previewPhoto() {
    if (this.data.photoPath) wx.previewImage({ current: this.data.photoPath, urls: [this.data.photoPath] })
  },

  removePhoto() {
    if (this.data.submitting) return
    this._photoStoragePath = ''
    this.setData({ photoPath: '', photoName: '', errorText: '' })
  },

  validate() {
    const { form, text, photoPath, today } = this.data
    if (!form.guest_name.trim() || !form.contact.trim() || !form.claim_date || !form.claim_time
      || !form.fee_acknowledged
      || !form.claim_hours_acknowledged || !form.unclaimed_policy_acknowledged
      || !form.no_valuables_acknowledged || !form.privacy_accepted) return text.missingFieldsError
    const contextToday = this._context && this._context.today ? this._context.today : ''
    if (form.claim_date < (today || contextToday)) return text.dateError
    if (!claimTimeOptions.includes(form.claim_time)) return text.timeError
    if (claimTimeIsPast(form)) return text.pastTimeError
    if (!photoPath) return text.photoRequiredError
    return this.contactError()
  },

  messageFor(error, fallback) {
    if (error && error.kind === 'date') return error.message
    if (error instanceof Error && ['image-too-large', 'image-processing-failed'].includes(error.message)) return this.data.errorCopy.photo
    if (error instanceof LuggageStorageApiError && error.kind === 'uncertain') return this.data.errorCopy.uncertain
    if (error instanceof LuggageStorageApiError && error.kind === 'network') return this.data.errorCopy.network
    if (error instanceof LuggageStorageApiError && error.kind === 'timeout') return this.data.errorCopy.timeout
    if (error instanceof LuggageStorageApiError && error.kind === 'limited') return this.data.errorCopy.limited
    if (error instanceof LuggageStorageApiError && error.kind === 'upload') return this.data.errorCopy.upload
    if (error instanceof LuggageStorageApiError && error.kind === 'service') return this.data.errorCopy.service
    return fallback
  },

  async submit() {
    if (this._submitTask || this.data.submitting) return
    const validationError = this.validate()
    if (validationError) {
      this.setData({ errorText: validationError })
      return
    }
    this._submitTask = true
    this.setData({ submitting: true, errorText: '' })
    try {
      if (!this._context) this._context = await luggageStorageApi.getPublicContext()
      if (this.data.form.claim_date < this._context.today) throw Object.assign(new Error(this.data.text.dateError), { kind: 'date' })
      if (claimTimeIsPast(this.data.form)) throw Object.assign(new Error(this.data.text.pastTimeError), { kind: 'date' })
      if (!this._draft) this._draft = await luggageStorageApi.createDraft(this._draftRequestId)
      if (!this._photoStoragePath) this._photoStoragePath = await luggageStorageApi.uploadPhoto(this._draft.id, this.data.photoPath, this._photoUploadId)
      const form = this.data.form
      const payload = {
        locale: this.data.locale,
        guest_name: form.guest_name.trim(),
        contact_method: form.contact_method,
        contact: form.contact_method === 'phone' ? formatPhone(form.country_code || DEFAULT_COUNTRY_CODE, form.contact) : form.contact.trim(),
        claim_date: form.claim_date,
        claim_time: form.claim_time,
        photo_storage_path: this._photoStoragePath,
        claim_hours_acknowledged: form.claim_hours_acknowledged,
        unclaimed_policy_acknowledged: form.unclaimed_policy_acknowledged,
        no_valuables_acknowledged: form.no_valuables_acknowledged,
        privacy_accepted: form.privacy_accepted,
      }
      await luggageStorageApi.submit(this._draft.token, payload)
      this.setData({ screen: 'success', submitting: false, errorText: '' })
    } catch (error) {
      // 照片上传超时可能已落盘；重试换新路径，避免同名文件冲突导致一直失败。
      if (!this._photoStoragePath) this._photoUploadId = Date.now()
      this.setData({ errorText: this.messageFor(error, this.data.errorCopy.service) })
    } finally {
      this._submitTask = false
      this.setData({ submitting: false })
    }
  },
}))
