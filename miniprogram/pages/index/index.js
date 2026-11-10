const copyData = require('../../data/self-checkin-copy')
const guestbookApi = require('../../utils/guestbook-api')
const paymentCopies = require('../../data/self-checkin-payment-copy')
const appConfig = require('../../config')
const testModeConfig = require('../../utils/test-mode')
const selfCheckinDrafts = require('../../utils/self-checkin-drafts')
const { compressImageToLimit } = require('../../utils/image-processing')
const { SelfCheckinApiError, selfCheckinApi } = require('../../utils/self-checkin-api')
const paymentApi = require('../../utils/self-checkin-payment')
const {
  normalizeAccessCode,
  isSixDigitCode,
  validateSelfCheckinStep,
  buildSelfCheckinPayload,
} = require('../../utils/self-checkin-flow')
const globalCopy = require('../../data/global-copy')
const appLocale = require('../../utils/app-locale')
const { COUNTRY_CODES, DEFAULT_COUNTRY_CODE, parsePhone } = require('../../utils/phone-input')
const share = require('../../utils/share')
const timeTheme = require('../../utils/guestbook-theme')

const locales = Object.keys(copyData.locales)
const imageMaxBytes = 2 * 1024 * 1024
const nativePaymentEnabled = appConfig.nativePaymentEnabled === true

Page(share.withShare('pages/index/index', 'checkin', {
  data: {
    screen: 'code',
    locale: 'zh-CN',
    globalText: globalCopy['zh-CN'],
    countryCodes: COUNTRY_CODES,
    documentType: '',
    docTypeConfirmed: false,
    text: copyData.locales['zh-CN'],
    foreignCopy: null,
    depositCopy: null,
    paymentCopy: paymentCopies['zh-CN'],
    lookupCopy: null,
    lookupErrorTitle: '',
    lookupErrorMessage: '',
    lookupRetryLabel: '',
    accessCode: '',
    testMode: testModeConfig.enabled,
    errorText: '',
    loading: false,
    context: null,
    rules: null,
    step: 0,
    ruleIndex: 0,
    readingSeconds: 3,
    ruleActionLabel: '',
    confirmedRuleIds: [],
    rulesFinalConfirmed: false,
    form: {
      guest_name: '',
      country_code: DEFAULT_COUNTRY_CODE,
      contact: '',
      guest_note: '',
      police_code: '',
      police_completed_confirmed: false,
    },
    signatureReady: false,
    passportPhoto: '',
    visaOrEntryPhoto: '',
    depositProofPhoto: '',
    paymentChannel: nativePaymentEnabled ? 'wechat' : 'other',
    paymentAvailable: nativePaymentEnabled,
    paymentStatus: 'not_started',
    paymentBusy: false,
    signatureLocalPath: '',
    submitting: false,
    photoProcessing: false,
  },

  onLoad(options) {
    this.lookupTimer = null
    this.lookupTask = null
    this._signatureHasInk = false
    this._signatureSize = null
    this._uploaded = {}
    this._uploadIds = { signature: Date.now(), passport: Date.now(), 'visa-or-entry': Date.now(), deposit: Date.now() }
    this._draftTargetId = options && options.draft ? String(options.draft) : ''
    const scene = options && options.scene ? decodeURIComponent(options.scene) : ''
    const code = normalizeAccessCode((options && options.code) || scene)
    // 草稿按登记时的语言恢复（入住须知按语言下发）；其他情况用全局语言。
    const queryLocale = options && options.locale && locales.includes(options.locale) ? options.locale : ''
    const locale = queryLocale || appLocale.getLocale()
    if (this._draftTargetId) {
      this.setData({ ...this.localeData(queryLocale || 'zh-CN'), screen: 'loading' }, () => this.resumeTargetDraft())
      return
    }
    this.setData({ ...this.localeData(locale), screen: 'code', accessCode: code && isSixDigitCode(code) ? code : '' })
  },

  localeData(locale) {
    return {
      locale,
      text: copyData.locales[locale],
      globalText: globalCopy[locale],
      foreignCopy: copyData.foreignDocuments[locale],
      depositCopy: copyData.depositProof[locale],
      paymentCopy: paymentCopies[locale],
      lookupCopy: copyData.lookupErrors[locale],
    }
  },

  // 只在输入入住码/查询失败页可切换；进入登记后入住须知已按语言加载。
  changeLocale(event) {
    const locale = event.detail.locale
    if (!locales.includes(locale) || !['code', 'lookupError'].includes(this.data.screen)) return
    const update = { ...this.localeData(locale), errorText: '' }
    if (this.data.screen === 'lookupError') {
      const copy = update.lookupCopy && update.lookupCopy[this.data.lookupErrorKind]
      if (copy) Object.assign(update, { lookupErrorTitle: copy.title, lookupErrorMessage: copy.message, lookupRetryLabel: copy.retryLabel })
    }
    this.setData(update)
  },

  returnHome() {
    this.stopRuleTimer()
    if (getCurrentPages().length > 1) wx.navigateBack()
    else wx.reLaunch({ url: '/pages/home/index' })
  },

  updateCountryCode(event) {
    const countryCode = COUNTRY_CODES[Number(event.detail.value)]
    if (!countryCode) return
    this.setData({ 'form.country_code': countryCode, errorText: '' })
    this.queueDraftSave()
  },

  selectDocumentType(event) {
    const documentType = event.currentTarget.dataset.type
    if (!['mainland_id', 'passport'].includes(documentType)) return
    this.setData({ documentType, errorText: '' })
    this.queueDraftSave()
  },

  onShow() {
    this.setData(timeTheme.themeData())
    if (this.data.step === 1 && this.data.screen === 'form') this.startRuleTimer()
    if (this.data.step === 4 && this.data.screen === 'form' && this.data.paymentChannel === 'wechat' && !this.data.testMode) this.refreshPaymentStatus()
  },

  onHide() {
    this.stopRuleTimer()
    this.persistDraftSnapshot()
  },

  onUnload() {
    this.stopRuleTimer()
    this.persistDraftSnapshot()
  },

  resumeTargetDraft() {
    const draft = selfCheckinDrafts.getDraft(this._draftTargetId)
    const accessCode = normalizeAccessCode(draft && draft.accessCode)
    if (!isSixDigitCode(accessCode)) {
      this._draftTargetId = ''
      this.setData({ screen: 'code', accessCode: '', errorText: this.data.text.accessCodeInvalidError })
      return
    }
    this.setData({ accessCode, screen: 'loading' }, () => this.loadContext(accessCode, false))
  },

  changeCode(event) {
    this.setData({ accessCode: normalizeAccessCode(event.detail.value), errorText: '' })
  },

  async submitCode() {
    const accessCode = normalizeAccessCode(this.data.accessCode)
    if (!isSixDigitCode(accessCode)) {
      this.setData({ accessCode, errorText: this.data.text.accessCodeInvalidError })
      return
    }
    if (this.lookupTask) return
    if (testModeConfig.enabled && accessCode === appConfig.developmentSelfCheckinTestCode) {
      await this.loadTestContext(accessCode)
      return
    }
    await this.loadContext(accessCode, false)
  },

  async loadTestContext(accessCode) {
    this.lookupTask = true
    this.setData({ loading: true, screen: 'loading', errorText: '' })
    try {
      const context = await selfCheckinApi.getPublicEntryContext(this.data.locale)
      this._uploaded = {}
      this.setData({
        context: { ...context, id: null, token: null },
        rules: context.rules_locale,
        screen: 'form',
        loading: false,
        testMode: true,
        accessCode,
        step: 0,
        ruleIndex: 0,
        confirmedRuleIds: [],
        rulesFinalConfirmed: false,
        signatureReady: false,
        passportPhoto: '',
        visaOrEntryPhoto: '',
        depositProofPhoto: '',
        paymentChannel: nativePaymentEnabled ? 'wechat' : 'other',
        paymentStatus: nativePaymentEnabled ? 'paid' : 'not_started',
        signatureLocalPath: '',
        submissionUncertain: false,
        errorText: '',
        documentType: '',
        docTypeConfirmed: false,
        form: {
          guest_name: '',
          country_code: DEFAULT_COUNTRY_CODE,
          contact: '',
          guest_note: '',
          police_code: '',
          police_completed_confirmed: false,
        },
      })
    } catch (error) {
      const kind = error instanceof SelfCheckinApiError ? error.kind : 'service'
      this.setLookupError(kind)
    } finally {
      this.lookupTask = null
      if (this.data.loading) this.setData({ loading: false })
    }
  },

  async loadContext(accessCode, reconciliation) {
    this.lookupTask = true
    this.setData({ loading: true, screen: reconciliation ? this.data.screen : 'loading', errorText: '' })
    try {
      const lookup = await selfCheckinApi.getPublicContextByAccessCode(accessCode, this.data.locale)
      if (lookup.state === 'expired') {
        this.setLookupError('expired')
        return null
      }
      if (lookup.state === 'not_found') {
        this.setLookupError('code')
        return null
      }
      const context = lookup.context
      if (context.signature_record_id) {
        selfCheckinDrafts.removeDraft(context.id)
        this.setData({ context, screen: 'submitted', loading: false, submissionUncertain: false,
          })
        return context
      }
      if (!reconciliation) {
        if (this._draftTargetId && context.id !== this._draftTargetId) {
          this.setData({ loading: false, screen: 'code', errorText: this.data.text.draftMismatch })
          return null
        }
        this._uploaded = {}
        this.setData({
          testMode: testModeConfig.enabled,
          context,
          rules: context.rules_locale,
          screen: 'form',
          loading: false,
          step: 0,
          ruleIndex: 0,
          confirmedRuleIds: [],
          rulesFinalConfirmed: false,
          signatureReady: false,
          passportPhoto: '',
          visaOrEntryPhoto: '',
          depositProofPhoto: '',
          paymentChannel: nativePaymentEnabled ? 'wechat' : 'other',
          paymentStatus: 'not_started',
          signatureLocalPath: '',
          submissionUncertain: false,
          documentType: '',
          docTypeConfirmed: false,
          form: {
            guest_name: context.guest_name || '',
            country_code: parsePhone(context.contact).countryCode,
            contact: parsePhone(context.contact).number,
            guest_note: context.guest_note || '',
            police_code: '',
            police_completed_confirmed: false,
          },
        })
        const draft = selfCheckinDrafts.getDraft(context.id)
        if (draft) await this.offerDraftResume(context, draft, accessCode)
        else if (this._draftTargetId) this.setData({ errorText: this.data.text.draftNotFound })
      }
      return context
    } catch (error) {
      const kind = error instanceof SelfCheckinApiError ? error.kind : 'service'
      if (reconciliation) return null
      this.setLookupError(kind === 'expired' ? 'expired' : kind)
      return null
    } finally {
      this.lookupTask = null
      if (this.data.loading) this.setData({ loading: false })
    }
  },

  retryLookup() {
    if (this.lookupTask) return
    // 入住码失效或不存在时，重新查询同一个码没有意义，回到输入页。
    if (['expired', 'code'].includes(this.data.lookupErrorKind)) {
      this.returnToCode()
      return
    }
    this.loadContext(this.data.accessCode, false)
  },

  offerDraftResume(context, draft, accessCode) {
    const targeted = Boolean(this._draftTargetId)
    return new Promise((resolve) => {
      const resume = () => {
        this._draftTargetId = ''
        this.restoreDraft(context, draft)
        resolve(context)
      }
      if (targeted) {
        resume()
        return
      }
      const state = draft.state || {}
      const savedName = String(state.form && state.form.guest_name || '').trim()
      const guestName = savedName || this.data.text.draftGuestFallback
      wx.showModal({
        title: this.data.text.draftResumeTitle,
        content: this.data.text.draftResumeContent.replace('{name}', guestName).replace('{code}', String(accessCode)),
        confirmText: this.data.text.draftResumeConfirm,
        cancelText: this.data.text.draftResumeRestart,
        success: (result) => {
          if (result.confirm) resume()
          else {
            selfCheckinDrafts.removeDraft(context.id)
            this._draftTargetId = ''
            resolve(context)
          }
        },
        fail: () => resolve(context),
      })
    })
  },

  async restoreDraft(context, draft) {
    const state = draft.state || {}
    const files = draft.files || {}
    const [signatureExists, passportExists, visaExists, depositExists] = await Promise.all([
      selfCheckinDrafts.fileExists(files.signature),
      selfCheckinDrafts.fileExists(files.passport),
      selfCheckinDrafts.fileExists(files.visaOrEntry),
      selfCheckinDrafts.fileExists(files.depositProof),
    ])
    const rulesChanged = draft.rulesVersion !== context.rules_version
    this._uploaded = { ...(draft.uploaded || {}) }
    if (rulesChanged) this._uploaded.signaturePath = ''
    this._restoreSignaturePath = !rulesChanged && signatureExists ? files.signature : ''
    if (rulesChanged && files.signature) selfCheckinDrafts.removeDraftFile(files.signature, context.id)
    let step = Math.max(0, Math.min(4, Number(draft.step) || 0))
    let confirmedRuleIds = rulesChanged ? [] : state.confirmedRuleIds || []
    let rulesFinalConfirmed = rulesChanged ? false : Boolean(state.rulesFinalConfirmed)
    if (!rulesFinalConfirmed) step = Math.min(step, 1)
    if (rulesFinalConfirmed && !signatureExists && !this._uploaded.signaturePath) step = Math.min(step, 2)
    const restoredFiles = {
      passportPhoto: passportExists ? files.passport : '',
      visaOrEntryPhoto: visaExists ? files.visaOrEntry : '',
      depositProofPhoto: depositExists ? files.depositProof : '',
      signatureLocalPath: !rulesChanged && signatureExists ? files.signature : '',
    }
    this.setData({
      form: { ...this.data.form, ...(state.form || {}) },
      documentType: state.documentType || '',
      docTypeConfirmed: Boolean(state.documentType && state.docTypeConfirmed),
      step,
      ruleIndex: rulesChanged ? 0 : Math.max(0, Number(state.ruleIndex) || 0),
      confirmedRuleIds,
      rulesFinalConfirmed,
      ...restoredFiles,
      paymentChannel: state.paymentChannel || (depositExists || !nativePaymentEnabled ? 'other' : 'wechat'),
      paymentStatus: 'not_started',
      errorText: '',
    }, () => {
      if (this.data.step === 1) this.startRuleTimer()
      if (this.data.step === 2 && this.data.rulesFinalConfirmed) this.initSignatureCanvas()
      if (this.data.step === 4 && this.data.paymentChannel === 'wechat' && !this.data.testMode) this.refreshPaymentStatus()
      this.persistDraftSnapshot()
    })
    if (rulesChanged) this.setData({ errorText: this.data.text.rulesChanged })
  },

  queueDraftSave() {
    if (this.draftSaveTimer) clearTimeout(this.draftSaveTimer)
    this.draftSaveTimer = setTimeout(() => {
      this.draftSaveTimer = null
      this.persistDraftSnapshot()
    }, 250)
  },

  persistDraftSnapshot() {
    const context = this.data.context
    if (!context || !context.id || this.data.testMode || this.data.screen !== 'form') return
    const state = {
      form: this.data.form,
      confirmedRuleIds: this.data.confirmedRuleIds,
      rulesFinalConfirmed: this.data.rulesFinalConfirmed,
      paymentChannel: this.data.paymentChannel,
      documentType: this.data.documentType,
      docTypeConfirmed: this.data.docTypeConfirmed,
    }
    const hasProgress = this.data.step > 0
      || Boolean(String(this.data.form.guest_name || '').trim())
      || Boolean(String(this.data.form.contact || '').trim())
      || Boolean(String(this.data.form.guest_note || '').trim())
      || this.data.confirmedRuleIds.length > 0
      || this.data.rulesFinalConfirmed
      || Boolean(this.data.passportPhoto || this.data.visaOrEntryPhoto || this.data.depositProofPhoto || this.data.signatureLocalPath)
    if (!hasProgress) return
    const saved = selfCheckinDrafts.saveDraft(context.id, {
      locale: this.data.locale,
      accessCode: this.data.accessCode,
      checkinDate: context.checkin_date || '',
      rulesVersion: context.rules_version,
      step: this.data.step,
      state,
      files: {
        signature: this.data.signatureLocalPath,
        passport: this.data.passportPhoto,
        visaOrEntry: this.data.visaOrEntryPhoto,
        depositProof: this.data.depositProofPhoto,
      },
      uploaded: this._uploaded,
    })
    if (!saved && !this._draftSaveFailed) {
      this._draftSaveFailed = true
      this.setData({ errorText: this.data.text.draftSaveFailed })
    } else if (saved) this._draftSaveFailed = false
  },

  async persistSignatureDraft() {
    const context = this.data.context
    if (!context || !context.id || !this._signatureHasInk || !this.signatureCanvas) return
    try {
      const tempPath = await this.canvasToTempFile()
      const persistentPath = await selfCheckinDrafts.copyFileToDraft(tempPath, context.id, 'signature')
      const oldPath = this.data.signatureLocalPath
      this.setData({ signatureLocalPath: persistentPath }, () => this.persistDraftSnapshot())
      if (oldPath && oldPath !== persistentPath) selfCheckinDrafts.removeDraftFile(oldPath, context.id)
    } catch {}
  },

  setLookupError(kind) {
    const copy = this.data.lookupCopy && this.data.lookupCopy[kind]
    this.setData({
      screen: 'lookupError',
      loading: false,
      lookupErrorKind: kind,
      lookupErrorTitle: copy ? copy.title : this.data.text.unavailableTitle,
      lookupErrorMessage: copy ? copy.message : this.data.text.unavailableMessage,
      lookupRetryLabel: copy ? copy.retryLabel : this.data.text.enterFlowLabel,
    })
  },

  updateForm(event) {
    const field = event.currentTarget.dataset.field
    if (!['contact', 'guest_note'].includes(field)) return
    this.setData({ [`form.${field}`]: event.detail.value, errorText: '' })
    this.queueDraftSave()
  },

  updatePoliceCode(event) {
    this.setData({ 'form.police_code': normalizeAccessCode(event.detail.value), errorText: '' })
    this.queueDraftSave()
  },

  togglePoliceComplete(event) {
    this.setData({ 'form.police_completed_confirmed': Array.isArray(event.detail.value) && event.detail.value.includes('complete'), errorText: '' })
    this.queueDraftSave()
  },

  currentState() {
    return {
      form: this.data.form,
      rules: this.data.rules,
      confirmedRuleIds: this.data.confirmedRuleIds,
      rulesFinalConfirmed: this.data.rulesFinalConfirmed,
      signaturePath: this._uploaded.signaturePath || (this.data.signatureLocalPath ? 'pending-signature' : '') || (this._signatureHasInk ? 'pending-signature' : ''),
      passportPath: this._uploaded.passportPath || (this.data.passportPhoto ? 'pending-passport' : ''),
      visaOrEntryPath: this._uploaded.visaOrEntryPath || (this.data.visaOrEntryPhoto ? 'pending-visa' : ''),
      depositProofPath: this._uploaded.depositProofPath || (this.data.depositProofPhoto ? 'pending-deposit-proof' : ''),
      paymentChannel: this.data.paymentChannel,
      paymentStatus: this.data.paymentStatus,
      documentType: this.data.documentType,
    }
  },

  validationMessage(key) {
    const { text, foreignCopy, depositCopy, globalText, form } = this.data
    const messages = {
      basicInfo: text.basicInfoError,
      guestNameMissing: text.nameMissingError,
      contactPhone: form.country_code === '+86' ? globalText.phone.invalidMainland : globalText.phone.invalid,
      documentType: globalText.documentType.required,
      rules: text.rulesIncompleteError,
      signature: text.signatureError,
      policeCode: text.policeCodeError,
      policeComplete: text.policeCompleteError,
      foreignDocuments: foreignCopy && foreignCopy.missingError,
      depositProof: depositCopy && depositCopy.missingError,
      depositPayment: ['pending', 'uncertain'].includes(this.data.paymentStatus) ? this.data.paymentCopy.pending : this.data.paymentCopy.required,
    }
    return messages[key] || text.submitError
  },

  async goNext() {
    if (this.data.step === 3 && !this.data.docTypeConfirmed) {
      if (!this.data.documentType) {
        this.setData({ errorText: this.data.globalText.documentType.required })
        return
      }
      this.setData({ docTypeConfirmed: true, errorText: '' }, () => this.persistDraftSnapshot())
      return
    }
    const key = validateSelfCheckinStep(this.data.step, this.data.documentType, this.currentState())
    if (key) {
      this.setData({ errorText: this.validationMessage(key) })
      return
    }
    if (this.data.step === 2 && this._signatureHasInk && !this.data.signatureLocalPath) await this.persistSignatureDraft()
    this.setData({ errorText: '', step: Math.min(4, this.data.step + 1) }, () => {
      if (this.data.step === 1) this.startRuleTimer()
      if (this.data.step === 2 && this.data.rulesFinalConfirmed) this.initSignatureCanvas()
      this.persistDraftSnapshot()
    })
  },

  goBack() {
    if (this.data.step === 3 && this.data.docTypeConfirmed) {
      this.setData({ docTypeConfirmed: false, errorText: '' }, () => this.persistDraftSnapshot())
      return
    }
    if (this.data.step === 3 && this.data.rulesFinalConfirmed) this._restoreSignaturePath = this.data.signatureLocalPath
    this.setData({ errorText: '', step: Math.max(0, this.data.step - 1) }, () => {
      if (this.data.step === 1) this.startRuleTimer()
      if (this.data.step === 2 && this.data.rulesFinalConfirmed) this.initSignatureCanvas()
      this.persistDraftSnapshot()
    })
  },

  returnToCode() {
    this.stopRuleTimer()
    this.setData({ screen: 'code', errorText: '', testMode: testModeConfig.enabled })
  },

  stopRuleTimer() {
    if (this.ruleTimer) clearInterval(this.ruleTimer)
    this.ruleTimer = null
  },

  startRuleTimer() {
    this.stopRuleTimer()
    const rule = this.data.rules && this.data.rules.items[this.data.ruleIndex]
    if (!rule) return
    const endAt = Date.now() + 3000
    const update = () => {
      const seconds = Math.max(0, Math.ceil((endAt - Date.now()) / 1000))
      const label = (this.data.rules && this.data.rules.confirmLabel) || this.data.text.nextRuleLabel
      this.setData({ readingSeconds: seconds, ruleActionLabel: seconds ? `${label} (${seconds}s)` : label })
      if (!seconds) this.stopRuleTimer()
    }
    update()
    this.ruleTimer = setInterval(update, 200)
  },

  previousRule() {
    if (this.data.ruleIndex === 0) {
      this.stopRuleTimer()
      this.goBack()
      return
    }
    this.setData({ ruleIndex: this.data.ruleIndex - 1 }, () => this.startRuleTimer())
  },

  confirmRule() {
    if (this.data.readingSeconds > 0) return
    const rule = this.data.rules.items[this.data.ruleIndex]
    const confirmedRuleIds = this.data.confirmedRuleIds.filter((id) => id !== rule.id).concat(rule.id)
    if (this.data.ruleIndex < this.data.rules.items.length - 1) {
      this.setData({ confirmedRuleIds, ruleIndex: this.data.ruleIndex + 1 }, () => this.startRuleTimer())
      this.queueDraftSave()
      return
    }
    this.stopRuleTimer()
    this.setData({ confirmedRuleIds, step: 2, errorText: '' }, () => {
      if (this.data.rulesFinalConfirmed) this.initSignatureCanvas()
      this.persistDraftSnapshot()
    })
  },

  toggleRulesFinal(event) {
    const checked = Array.isArray(event.detail.value) && event.detail.value.includes('confirmed')
    this._uploaded.signaturePath = ''
    this._uploadIds.signature = Date.now()
    this._signatureHasInk = false
    this._signatureSize = null
    if (this.data.signatureLocalPath && this.data.context) selfCheckinDrafts.removeDraftFile(this.data.signatureLocalPath, this.data.context.id)
    this.setData({ rulesFinalConfirmed: checked, signatureReady: false, signatureLocalPath: '', errorText: '' }, () => {
      if (checked) this.initSignatureCanvas()
      this.queueDraftSave()
    })
  },

  initSignatureCanvas() {
    if (!this.data.rulesFinalConfirmed) return
    this.createSelectorQuery().select('#signature-canvas').fields({ node: true, size: true }).exec((result) => {
      const item = result && result[0]
      if (!item || !item.node) return
      const canvas = item.node
      const dpr = wx.getSystemInfoSync().pixelRatio || 1
      canvas.width = item.width * dpr
      canvas.height = item.height * dpr
      const ctx = canvas.getContext('2d')
      ctx.scale(dpr, dpr)
      ctx.lineWidth = 2.4
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.strokeStyle = '#0B1F44'
      this.signatureCanvas = canvas
      this.signatureContext = ctx
      this._signatureSize = { width: item.width, height: item.height }
      this._signatureHasInk = false
      this.setData({ signatureReady: true })
      if (this._restoreSignaturePath) {
        const image = canvas.createImage()
        const restorePath = this._restoreSignaturePath
        image.onload = () => {
          ctx.drawImage(image, 0, 0, item.width, item.height)
          this._signatureHasInk = true
          this._restoreSignaturePath = ''
        }
        image.onerror = () => { this._restoreSignaturePath = '' }
        image.src = restorePath
      }
    })
  },

  touchPoint(event) {
    const touch = event.changedTouches && event.changedTouches[0]
    if (!touch || !this._signatureSize) return null
    return { x: touch.x, y: touch.y }
  },

  signatureStart(event) {
    if (!this.signatureContext || !this.data.rulesFinalConfirmed) return
    const point = this.touchPoint(event)
    if (!point) return
    if (this._uploaded.signaturePath) {
      this._uploaded.signaturePath = ''
      this._uploadIds.signature = Date.now()
    }
    this.signatureContext.beginPath()
    this.signatureContext.moveTo(point.x, point.y)
    this._signatureHasInk = true
    this.setData({ errorText: '' })
  },

  signatureMove(event) {
    if (!this.signatureContext || !this._signatureHasInk) return
    const point = this.touchPoint(event)
    if (!point) return
    this.signatureContext.lineTo(point.x, point.y)
    this.signatureContext.stroke()
  },

  signatureEnd() {
    this.persistSignatureDraft()
  },

  clearSignature() {
    if (!this.signatureContext || !this._signatureSize) return
    this.signatureContext.clearRect(0, 0, this._signatureSize.width, this._signatureSize.height)
    this._signatureHasInk = false
    this._uploaded.signaturePath = ''
    this._uploadIds.signature = Date.now()
    if (this.data.signatureLocalPath && this.data.context) selfCheckinDrafts.removeDraftFile(this.data.signatureLocalPath, this.data.context.id)
    this.setData({ signatureReady: true, signatureLocalPath: '', errorText: '' }, () => this.persistDraftSnapshot())
  },

  canvasToTempFile() {
    return new Promise((resolve, reject) => {
      if (!this.signatureCanvas || !this._signatureHasInk) return reject(new Error('signature'))
      wx.canvasToTempFilePath({
        canvas: this.signatureCanvas,
        fileType: 'png',
        success: (result) => resolve(result.tempFilePath),
        fail: reject,
      })
    })
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
    if (this.data.photoProcessing || this.data.submitting) return
    const kind = event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.kind
    if (!['passport', 'visaOrEntry', 'depositProof'].includes(kind)) return
    const albumOnly = kind === 'depositProof'
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: albumOnly ? ['album'] : ['album', 'camera'],
      success: async (result) => {
        this.setData({ photoProcessing: true })
        try {
          wx.showLoading({ title: this.data.text.processingPhoto, mask: true })
          const canvas = await this.getPhotoCanvas()
          const path = await compressImageToLimit(result.tempFilePaths[0], imageMaxBytes, { canvas, maxLongEdge: 2600, minLongEdge: 1200 })
          const fileKind = kind === 'visaOrEntry' ? 'visa-or-entry' : kind === 'depositProof' ? 'deposit' : kind
          this._uploadIds[fileKind] = Date.now()
          const persistentPath = await selfCheckinDrafts.copyFileToDraft(path, this.data.context.id, fileKind)
          const patch = { errorText: '' }
          const field = kind === 'passport' ? 'passportPhoto' : kind === 'visaOrEntry' ? 'visaOrEntryPhoto' : 'depositProofPhoto'
          if (this.data[field]) selfCheckinDrafts.removeDraftFile(this.data[field], this.data.context.id)
          patch[field] = persistentPath
          this.setData(patch)
          if (kind === 'passport') this._uploaded.passportPath = ''
          if (kind === 'visaOrEntry') this._uploaded.visaOrEntryPath = ''
          if (kind === 'depositProof') this._uploaded.depositProofPath = ''
          this.persistDraftSnapshot()
        } catch {
          const message = kind === 'depositProof' ? this.data.depositCopy.compressionError : this.data.foreignCopy.compressionError
          this.setData({ errorText: message })
        } finally {
          this.setData({ photoProcessing: false })
          wx.hideLoading()
        }
      },
    })
  },

  previewPhoto(event) {
    const path = event.currentTarget.dataset.path
    if (path) wx.previewImage({ current: path, urls: [path] })
  },

  previewQrImage(event) {
    const imagePath = event.currentTarget.dataset.path
    if (!imagePath) return
    wx.previewImage({ current: imagePath, urls: [imagePath], showmenu: true })
  },

  async uploadIfNeeded(name, bucketKind, recordId, sourcePath) {
    if (this._uploaded[name]) return this._uploaded[name]
    let path
    try {
      if (bucketKind === 'signature') path = await selfCheckinApi.uploadGuestSignature(recordId, sourcePath, this._uploadIds.signature)
      else if (bucketKind === 'passport' || bucketKind === 'visa-or-entry') path = await selfCheckinApi.uploadGuestForeignDocument(recordId, bucketKind, sourcePath, this._uploadIds[bucketKind])
      else path = await selfCheckinApi.uploadGuestDepositProof(recordId, sourcePath, this._uploadIds.deposit)
    } catch (error) {
      // 超时的上传可能已落盘；重试换新路径，避免同名文件冲突导致一直失败。
      this._uploadIds[bucketKind] = Date.now()
      throw error
    }
    this._uploaded[name] = path
    this.persistDraftSnapshot()
    return path
  },

  async refreshPaymentStatus() {
    const token = this.data.context && this.data.context.token
    if (!token || this.data.testMode) return
    try {
      const result = await paymentApi.callPayment('status', token)
      this.setData({ paymentStatus: result.status || 'not_started' })
    } catch {
      this.setData({ paymentStatus: 'uncertain' })
    }
  },

  async payDeposit() {
    if (!nativePaymentEnabled || this.data.paymentBusy || this.data.testMode) return
    const token = this.data.context && this.data.context.token
    if (!token) return
    this.setData({ paymentBusy: true, errorText: '' })
    try {
      const loginCode = await paymentApi.loginCode()
      const order = await paymentApi.callPayment('create', token, { loginCode })
      if (order.status === 'paid') {
        this.setData({ paymentStatus: 'paid' })
        return
      }
      this.setData({ paymentStatus: 'pending' })
      let cancelled = false
      try { await paymentApi.requestPayment(order.requestPayment) } catch (error) {
        cancelled = /cancel/i.test(String(error && error.errMsg || ''))
      }
      await this.refreshPaymentStatus()
      if (this.data.paymentStatus !== 'paid') this.setData({ errorText: cancelled ? this.data.paymentCopy.cancelled : this.data.paymentCopy.pending })
    } catch {
      this.setData({ errorText: this.data.paymentCopy.payError })
    } finally { this.setData({ paymentBusy: false }) }
  },

  async checkPaymentStatus() {
    if (this.data.paymentBusy || this.data.testMode) return
    this.setData({ paymentBusy: true, errorText: '' })
    try {
      await this.refreshPaymentStatus()
      if (this.data.paymentStatus !== 'paid') this.setData({ errorText: this.data.paymentCopy.pending })
    } finally { this.setData({ paymentBusy: false }) }
  },

  async useOtherPayment() {
    if (this.data.paymentBusy) return
    if (this.data.testMode) {
      this.setData({ paymentChannel: 'other', paymentStatus: 'not_started' })
      return
    }
    this.setData({ paymentBusy: true, errorText: '' })
    try {
      const result = await paymentApi.callPayment('switch', this.data.context.token)
      if (result.status !== 'other_available') throw new Error('PAYMENT_STATE_UNCERTAIN')
      this.setData({ paymentChannel: 'other', paymentStatus: 'not_started' })
      this.queueDraftSave()
    } catch {
      this.setData({ errorText: this.data.paymentCopy.switchError })
    } finally { this.setData({ paymentBusy: false }) }
  },

  chooseWechatPayment() {
    if (!nativePaymentEnabled || this.data.paymentBusy) return
    this.setData({ paymentChannel: 'wechat', errorText: '' })
    this.queueDraftSave()
    this.refreshPaymentStatus()
  },

  async submitCheckin() {
    if (this.data.submitting) return
    if (this.data.submissionUncertain) {
      const context = await this.loadContext(this.data.accessCode, true)
      if (context && context.signature_record_id) return
      this.setData({ submissionUncertain: false, errorText: '' })
    }
    if (this.data.paymentChannel === 'wechat' && !this.data.testMode) await this.refreshPaymentStatus()
    for (let step = 0; step <= 4; step += 1) {
      const key = validateSelfCheckinStep(step, this.data.documentType, this.currentState())
      if (key) {
        if (step === 2 && this.data.rulesFinalConfirmed) this._restoreSignaturePath = this.data.signatureLocalPath
        this.setData({ step, errorText: this.validationMessage(key), ...(step === 3 && key === 'documentType' ? { docTypeConfirmed: false } : {}) }, () => {
          if (step === 2 && this.data.rulesFinalConfirmed) this.initSignatureCanvas()
        })
        if (step === 1) this.startRuleTimer()
        return
      }
    }

    if (testModeConfig.enabled) {
      this.setData({ screen: 'submitted', errorText: '', submissionUncertain: false })
      return
    }

    this.setData({ submitting: true, errorText: '' })
    try {
      const id = this.data.context.id
      let signaturePath = this._uploaded.signaturePath || ''
      if (!signaturePath) {
        const signatureFile = this.data.signatureLocalPath || await this.canvasToTempFile()
        signaturePath = await this.uploadIfNeeded('signaturePath', 'signature', id, signatureFile)
      }
      let passportPath
      let visaOrEntryPath
      if (this.data.documentType === 'passport') {
        passportPath = await this.uploadIfNeeded('passportPath', 'passport', id, this.data.passportPhoto)
        visaOrEntryPath = await this.uploadIfNeeded('visaOrEntryPath', 'visa-or-entry', id, this.data.visaOrEntryPhoto)
      }
      if (this.data.paymentChannel === 'wechat') {
        await this.refreshPaymentStatus()
        if (this.data.paymentStatus !== 'paid') throw new Error('PAYMENT_NOT_CONFIRMED')
      }
      const depositProofPath = this.data.paymentChannel === 'wechat' ? null : await this.uploadIfNeeded('depositProofPath', 'deposit', id, this.data.depositProofPhoto)
      const state = {
        ...this.currentState(),
        signaturePath,
        passportPath,
        visaOrEntryPath,
        depositProofPath,
      }
      const payload = buildSelfCheckinPayload(state, this.data.locale, this.data.context.phone_last4)
      const result = await selfCheckinApi.submitGuest(this.data.context.token, payload)
      this.setData({ screen: 'submitted', submitting: false, submissionUncertain: false,
        context: { ...this.data.context, signature_record_id: result.signature_record_id || this.data.context.signature_record_id },
        })
      selfCheckinDrafts.removeDraft(id)
      guestbookApi.linkSelfCheckin(this.data.context.token).catch(() => {})
    } catch (error) {
      const uncertain = error instanceof SelfCheckinApiError && ['network', 'timeout'].includes(error.kind)
      const limited = error instanceof SelfCheckinApiError && error.kind === 'limited'
      this.setData({ submitting: false, submissionUncertain: uncertain, errorText: limited ? this.data.text.submitLimited : this.data.text.submitError })
      if (uncertain) {
        const context = await this.loadContext(this.data.accessCode, true)
        if (context && context.signature_record_id) return
        this.setData({ submissionUncertain: true, errorText: this.data.text.submitError })
      }
    }
  },

}))
