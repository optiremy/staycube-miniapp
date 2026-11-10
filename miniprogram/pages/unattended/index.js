// 早到自助寄存（非值守）：服务选择 → 填写信息 → 确认须知 → 支付押金 → 开门密码与拍照登记 → 完成。
// 服务开放与否只看员工后台开关；所有资格、付款、开门密码与登记均由服务端按申请凭证校验。
const copyData = require('../../data/unattended-copy')
const paymentCopyData = require('../../data/self-checkin-payment-copy')
const appConfig = require('../../config')
const guide = require('../../data/unattended-guide')
const globalCopy = require('../../data/global-copy')
const appLocale = require('../../utils/app-locale')
const { COUNTRY_CODES, DEFAULT_COUNTRY_CODE, isValidPhone, formatPhone } = require('../../utils/phone-input')
const { compressImageToLimit } = require('../../utils/image-processing')
const { luggageStorageApi } = require('../../utils/luggage-storage-api')
const { UnattendedApiError, unattendedApi, demoEnabled, secureRecoveryToken } = require('../../utils/unattended-api')
const share = require('../../utils/share')
const timeTheme = require('../../utils/guestbook-theme')

const SESSION_KEY = 'unattended_session'
const PENDING_KEY = 'unattended_pending'
const ENTRY_STATUSES = ['paid', 'entry_pending', 'arrival_pending_photo']
const STEP_SCREENS = ['details', 'notice', 'payment', 'entry']
// 小程序内押金优先用微信支付；“使用其他方式支付”为收款码备注姓名、自动核对。
const wechatAvailable = appConfig.nativePaymentEnabled === true

function readStorage(key) {
  try {
    const value = wx.getStorageSync(key)
    return value && typeof value === 'object' ? value : null
  } catch { return null }
}
function writeStorage(key, value) {
  try { value ? wx.setStorageSync(key, value) : wx.removeStorageSync(key) } catch {}
}

function shanghaiTime(iso) {
  const time = Date.parse(iso)
  if (!Number.isFinite(time)) return ''
  const local = new Date(time + 8 * 3600000)
  return `${String(local.getUTCHours()).padStart(2, '0')}:${String(local.getUTCMinutes()).padStart(2, '0')}`
}

function localized(value, locale) {
  return value ? (locale === 'zh-CN' ? value.zh : value.en) : ''
}

function guideFor(locale, text) {
  const walk = minutes => text.walkTemplate.replace('{n}', String(minutes))
  return {
    breakfast: guide.breakfast.map((item, index) => ({ index, name: localized(item.name, locale), meta: [localized(item.specialty, locale), walk(item.walkMinutes), item.hours].filter(Boolean).join(' · '), hasMap: Number.isFinite(item.latitude) && item.latitude !== 0 })),
    places: guide.places.map((item, index) => ({ index, name: localized(item.name, locale), meta: [localized(item.kind, locale), item.hours, walk(item.walkMinutes)].filter(Boolean).join(' · '), amenities: (item.amenities || []).map(tag => localized(tag, locale)), hasMap: Number.isFinite(item.latitude) && item.latitude !== 0 })),
  }
}

const defaultForm = () => ({ name: '', contactMethod: 'phone', countryCode: DEFAULT_COUNTRY_CODE, contact: '' })

Page(share.withShare('pages/unattended/index', 'unattended', {
  data: {
    locale: 'zh-CN',
    text: copyData['zh-CN'],
    paymentCopy: paymentCopyData['zh-CN'],
    stepTitles: [],
    stepIndex: -1,
    paymentChannel: wechatAvailable ? 'wechat' : 'other',
    paymentStatus: 'not_started',
    paymentBusy: false,
    wechatAvailable,
    globalText: globalCopy['zh-CN'],
    screen: 'service',
    configState: 'loading',
    arrivalEnabled: false,
    pickupEnabled: false,
    form: defaultForm(),
    countryCodes: COUNTRY_CODES,
    noticeChecked: [],
    allAccepted: false,
    session: null,
    deadlineText: '',
    possibleUnmarked: false,
    entry: { state: 'idle', code: '' },
    photoPath: '',
    photoProcessing: false,
    busy: false,
    errorText: '',
    messageText: '',
    inactiveStatus: '',
    areaMap: guide.areaMap,
    guideItems: { breakfast: [], places: [] },
    demo: false,
    placeholderItems: [],
    guideOpen: { breakfast: false, places: false },
  },

  onLoad() {
    this._photoState = {}
    this._busy = false
    this.applyLocale(appLocale.getLocale())
    this.setData({ demo: demoEnabled() })
    const session = readStorage(SESSION_KEY)
    if (session && session.requestId && session.token) this.resume(session)
    else this.loadConfig()
  },

  onShow() {
    this.setData(timeTheme.themeData())
    // 旅客从相册扫码付款后回到小程序：只核对一次，不做常驻轮询。
    if (this._shown && this.data.screen === 'payment' && this.data.session) {
      if (this.data.paymentChannel === 'other') this.verifyPayment(true)
      else if (this.data.paymentStatus === 'pending') this.refreshWechatStatus()
    }
    this._shown = true
  },

  applyLocale(locale) {
    const text = copyData[locale] || copyData['zh-CN']
    const changes = { locale, text, paymentCopy: paymentCopyData[locale] || paymentCopyData['zh-CN'], stepTitles: [text.stepDetails, text.stepNotice, text.stepPayment, text.stepEntry], globalText: globalCopy[locale] || globalCopy['zh-CN'], guideItems: guideFor(locale, text), placeholderItems: [1, 2].map(index => ({ index, name: `${text.placeholder} ${index}`, meta: text.walkTemplate.replace('{n}', '5'), amenities: [], hasMap: false })), errorText: '' }
    // 中文界面只接受大陆 11 位手机号（与网页及服务端一致）。
    if (locale === 'zh-CN') Object.assign(changes, { 'form.contactMethod': 'phone', 'form.countryCode': DEFAULT_COUNTRY_CODE })
    this.setData(changes)
    if (this.data.session) this.setData({ deadlineText: text.paymentDeadline + shanghaiTime(this.data.session.paymentDeadline) })
    if (typeof wx !== 'undefined' && wx.setNavigationBarTitle) wx.setNavigationBarTitle({ title: text.arrival })
  },

  changeLocale(event) {
    if (this.data.busy) return
    this.applyLocale(event.detail.locale)
  },

  // 统一切换页面：同步步骤条位置。
  show(screen, extra = {}) {
    this.setData({ screen, stepIndex: STEP_SCREENS.indexOf(screen), ...extra })
  },

  messageFor(error) {
    const { text, locale } = this.data
    if (!(error instanceof UnattendedApiError)) return text.genericError
    if (error.code === 'NETWORK') return text.networkError
    if (error.code === 'ENTRY_CODE_UNAVAILABLE') return text.unavailableBeforePayment
    if (error.code === 'ENTRY_CODE_READ_FAILED') return text.codeReadFailed
    if (locale === 'zh-CN' && error.message && error.message !== error.code) return error.message
    return text.genericError
  },

  async run(work) {
    if (this._busy) return undefined
    this._busy = true
    this.setData({ busy: true, errorText: '', messageText: '' })
    try { return await work() }
    catch (error) { this.setData({ errorText: this.messageFor(error) }); return undefined }
    finally { this._busy = false; this.setData({ busy: false }) }
  },

  async loadConfig() {
    this.setData({ configState: 'loading' })
    this.show('service')
    try {
      const config = await unattendedApi().config()
      this.setData({ configState: 'ready', arrivalEnabled: config.arrivalEnabled === true, pickupEnabled: config.pickupEnabled === true })
    } catch (error) {
      this.setData({ configState: 'error', errorText: this.messageFor(error) })
    }
  },

  chooseArrival() {
    if (!this.data.arrivalEnabled) return
    this.show('details', { errorText: '' })
  },

  backToService() {
    if (this.data.busy) return
    this.show('service', { errorText: '' })
    this.loadConfig()
  },

  updateName(event) { this.setData({ 'form.name': event.detail.value, errorText: '' }) },
  updateContact(event) { this.setData({ 'form.contact': event.detail.value, errorText: '' }) },
  updateContactMethod(event) {
    const method = event.detail.value
    if (['phone', 'email'].includes(method)) this.setData({ 'form.contactMethod': method, 'form.contact': '', errorText: '' })
  },
  updateCountryCode(event) {
    const code = COUNTRY_CODES[Number(event.detail.value)]
    if (code) this.setData({ 'form.countryCode': code, errorText: '' })
  },

  contactValue() {
    const { form } = this.data
    if (form.contactMethod === 'email') return form.contact.trim()
    return formatPhone(form.countryCode, form.contact)
  },

  detailsError() {
    const { form, text, locale } = this.data
    if (!form.name.trim()) return text.nameHint
    if (form.contactMethod === 'email') return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contact.trim()) ? '' : text.invalidEmail
    if (locale === 'zh-CN') return /^1\d{10}$/.test(form.contact.trim()) ? '' : text.invalidPhone
    return isValidPhone(form.countryCode, form.contact) ? '' : text.invalidPhone
  },

  submitDetails() {
    const error = this.detailsError()
    if (error) { this.setData({ errorText: error }); return }
    const { form, locale } = this.data
    return this.run(async () => {
      await unattendedApi().checkEligibility('arrival', form.name.trim(), form.contactMethod, this.contactValue(), locale)
      this.show('notice', { noticeChecked: [], allAccepted: false })
    })
  },

  updateNotice(event) {
    const checked = (event.detail.value || []).map(Number)
    const noticeChecked = this.data.text.notice.map((_, index) => checked.includes(index))
    this.setData({ noticeChecked, allAccepted: noticeChecked.every(Boolean), errorText: '' })
  },

  backToDetails() {
    if (this.data.busy) return
    this.show('details', { errorText: '' })
  },

  createRequest() {
    if (!this.data.allAccepted) return
    const { form, locale } = this.data
    return this.run(async () => {
      const pending = readStorage(PENDING_KEY)
      const token = pending && pending.token ? pending.token : await secureRecoveryToken()
      const intent = { kind: 'arrival', name: form.name.trim(), contactMethod: form.contactMethod, contact: this.contactValue(), locale, token }
      // 先保存申请意图：响应丢失后用同一凭证恢复原申请，避免重复付款。
      writeStorage(PENDING_KEY, intent)
      const created = await unattendedApi().create(intent.kind, intent.name, intent.contactMethod, intent.contact, intent.locale, intent.token)
      const session = { requestId: created.requestId, token: created.token, kind: 'arrival', name: intent.name, paymentDeadline: created.paymentDeadline }
      writeStorage(SESSION_KEY, session)
      writeStorage(PENDING_KEY, null)
      this.openSession(session, created.status)
    })
  },

  async resume(session) {
    this.setData({ session })
    this.show('loading')
    try {
      const status = await unattendedApi().status(session.requestId, session.token)
      this.openSession(session, status.status)
    } catch (error) {
      if (error instanceof UnattendedApiError && error.code === 'INVALID_SESSION') { this.clearSession(); return }
      this.show('resume-error', { errorText: this.messageFor(error) })
    }
  },

  retryResume() {
    const session = this.data.session
    if (session) this.resume(session)
  },

  openSession(session, status) {
    const base = { session, deadlineText: this.data.text.paymentDeadline + shanghaiTime(session.paymentDeadline) }
    if (status === 'awaiting_payment') {
      this.show('payment', base)
      if (this.data.paymentChannel === 'wechat') this.refreshWechatStatus()
    }
    else if (ENTRY_STATUSES.includes(status)) { this.show('entry', base); return this.loadEntryCode() }
    else if (status === 'completed') this.show('done', base)
    else this.show('inactive', { ...base, inactiveStatus: status === 'cancelled' ? 'cancelled' : 'expired' })
    return undefined
  },

  // 微信支付：服务端下单、调起支付、再以服务端查询结果为准（不以支付弹窗回调判断到账）。
  async payWechat() {
    const session = this.data.session
    if (!session || this.data.paymentBusy || !wechatAvailable) return
    this.setData({ paymentBusy: true, errorText: '', messageText: '' })
    try {
      const api = unattendedApi()
      const order = await api.wechatCreate(session.requestId, session.token)
      if (order.status !== 'paid') {
        this.setData({ paymentStatus: 'pending' })
        let cancelled = false
        try { await api.requestPayment(order.requestPayment) } catch (error) { cancelled = /cancel/i.test(String(error && error.errMsg || '')) }
        const paid = await this.refreshWechatStatus()
        if (!paid) this.setData({ errorText: cancelled ? this.data.paymentCopy.cancelled : this.data.paymentCopy.pending })
        return
      }
      await this.refreshWechatStatus()
    } catch {
      this.setData({ errorText: this.data.paymentCopy.payError })
    } finally { this.setData({ paymentBusy: false }) }
  },

  async refreshWechatStatus() {
    const session = this.data.session
    if (!session) return false
    try {
      const result = await unattendedApi().wechatStatus(session.requestId, session.token)
      if (result.status === 'paid') {
        this.setData({ paymentStatus: 'paid' })
        const status = await unattendedApi().status(session.requestId, session.token)
        await this.openSession(session, status.status)
        return true
      }
      this.setData({ paymentStatus: result.status === 'uncertain' ? 'uncertain' : result.status === 'not_started' ? 'not_started' : 'pending' })
    } catch { this.setData({ paymentStatus: this.data.paymentStatus === 'not_started' ? 'not_started' : 'uncertain' }) }
    return false
  },

  async checkWechatStatus() {
    if (this.data.paymentBusy) return
    this.setData({ paymentBusy: true, errorText: '' })
    try {
      const paid = await this.refreshWechatStatus()
      if (!paid) this.setData({ errorText: this.data.paymentCopy.pending })
    } finally { this.setData({ paymentBusy: false }) }
  },

  // 改用其他方式前先关闭未付款的微信订单，避免同一笔押金付两次。
  async useOtherPayment() {
    const session = this.data.session
    if (!session || this.data.paymentBusy) return
    this.setData({ paymentBusy: true, errorText: '' })
    try {
      const result = await unattendedApi().wechatSwitch(session.requestId, session.token)
      if (result.status !== 'other_available') throw new Error('PAYMENT_STATE_UNCERTAIN')
      this.setData({ paymentChannel: 'other', paymentStatus: 'not_started' })
    } catch {
      this.setData({ errorText: this.data.paymentCopy.switchError })
    } finally { this.setData({ paymentBusy: false }) }
  },

  chooseWechatPayment() {
    if (!wechatAvailable || this.data.busy) return
    this.setData({ paymentChannel: 'wechat', errorText: '', messageText: '' })
  },

  verifyPayment(silent) {
    const session = this.data.session
    if (!session) return
    return this.run(async () => {
      const result = await unattendedApi().confirmPayment(session.requestId, session.token)
      if (result.status === 'confirmed') {
        this.show('entry', { possibleUnmarked: false })
        await this.loadEntryCode()
        return
      }
      const status = await unattendedApi().status(session.requestId, session.token).catch(() => null)
      if (status && status.status !== 'awaiting_payment') { this.openSession(session, status.status); return }
      if (silent === true) return
      const { text } = this.data
      this.setData({ possibleUnmarked: result.possibleUnmarked === true, messageText: result.status === 'ambiguous' ? text.ambiguous : text.paymentPending })
    })
  },

  checkPayment() { return this.verifyPayment(false) },

  cancelRequest() {
    const session = this.data.session
    if (!session || this.data.busy) return
    wx.showModal({
      content: this.data.text.cancelConfirm,
      success: (result) => {
        if (!result.confirm) return
        this.run(async () => {
          // 微信订单未关闭时服务端不允许取消，先关单。
          if (wechatAvailable) {
            const closed = await unattendedApi().wechatSwitch(session.requestId, session.token)
            if (closed.status !== 'other_available') throw new UnattendedApiError('PAYMENT_STATE_UNCERTAIN', '')
          }
          await unattendedApi().cancel(session.requestId, session.token)
          this.show('inactive', { inactiveStatus: 'cancelled', messageText: this.data.text.cancelSaved })
        })
      },
    })
  },

  previewQr() {
    wx.previewImage({ current: '/assets/unattended-deposit.png', urls: ['/assets/unattended-deposit.png'], showmenu: true })
  },

  async loadEntryCode() {
    const session = this.data.session
    if (!session) return
    this.setData({ entry: { state: 'loading', code: this.data.entry.code } })
    try {
      const result = await unattendedApi().entryCode(session.requestId, session.token)
      this.setData({ entry: result.status === 'available' && result.code ? { state: 'available', code: result.code } : { state: 'unavailable', code: '' } })
    } catch (error) {
      if (this.data.entry.state !== 'available') this.setData({ entry: { state: 'error', code: '' } })
    }
  },

  retryEntryCode() { this.loadEntryCode() },

  getPhotoCanvas() {
    return new Promise((resolve, reject) => {
      wx.createSelectorQuery().in(this).select('#photo-processing-canvas').fields({ node: true }).exec((result) => {
        const canvas = result && result[0] && result[0].node
        if (canvas) resolve(canvas)
        else reject(new Error('image-processing-failed'))
      })
    })
  },

  choosePhoto() {
    if (this.data.busy || this.data.photoProcessing) return
    wx.chooseImage({
      count: 1, sizeType: ['compressed'], sourceType: ['camera', 'album'],
      success: async (result) => {
        this.setData({ photoProcessing: true, errorText: '' })
        try {
          const context = this.data.demo ? { maxPhotoBytes: 1024 * 1024 } : await luggageStorageApi.getPublicContext()
          const canvas = await this.getPhotoCanvas()
          const path = await compressImageToLimit(result.tempFilePaths[0], context.maxPhotoBytes, { canvas, maxLongEdge: 1800, minLongEdge: 720 })
          this._photoState = { draft: this._photoState.draft, uploadId: Date.now() }
          this.setData({ photoPath: path })
        } catch {
          this.setData({ errorText: this.data.text.genericError })
        } finally {
          this.setData({ photoProcessing: false })
        }
      },
    })
  },

  previewPhoto() {
    if (this.data.photoPath) wx.previewImage({ current: this.data.photoPath, urls: [this.data.photoPath] })
  },

  submitPhoto() {
    const session = this.data.session
    if (!session || !this.data.photoPath) return
    return this.run(async () => {
      await unattendedApi().completeArrivalPhoto(session.requestId, session.token, this.data.photoPath, this.data.locale, this._photoState)
      this.show('done', { photoPath: '' })
    })
  },

  // 早餐与休息场所为展开卡片，默认收起。
  toggleGuide(event) {
    const list = event.currentTarget.dataset.list
    if (!['breakfast', 'places'].includes(list)) return
    this.setData({ [`guideOpen.${list}`]: !this.data.guideOpen[list] })
  },

  openGuideMap(event) {
    const { list, index } = event.currentTarget.dataset
    const item = (guide[list] || [])[Number(index)]
    if (!item || !Number.isFinite(item.latitude)) return
    wx.openLocation({ latitude: item.latitude, longitude: item.longitude, name: localized(item.name, this.data.locale), address: item.address || '', scale: 17 })
  },

  clearSession() {
    writeStorage(SESSION_KEY, null)
    writeStorage(PENDING_KEY, null)
    this._photoState = {}
    this.show('service')
    this.setData({ session: null, paymentChannel: wechatAvailable ? 'wechat' : 'other', paymentStatus: 'not_started', form: defaultForm(), noticeChecked: [], allAccepted: false, entry: { state: 'idle', code: '' }, photoPath: '', errorText: '', messageText: '', possibleUnmarked: false })
    this.applyLocale(this.data.locale)
    this.loadConfig()
  },

  startAgain() { this.clearSession() },
}))
