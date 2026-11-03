const copy = require('../../data/special-cancellation-copy')
const { specialCancellationApi, MAX_BYTES } = require('../../utils/special-cancellation-api')
const { compressImageToLimit } = require('../../utils/image-processing')
const { createRequestId } = require('../../utils/guest-transport')
const share = require('../../utils/share')

const MATERIAL_LIMIT = 5
const EDITABLE = ['awaiting_guest', 'need_more_info']
const blankRow = () => ({ id: createRequestId(), uploadId: createRequestId(), fileKey: '', description: '', purpose: 'supporting', purposeIndex: 0, attachment: null })
const rowFromAttachment = attachment => {
  const purpose = attachment.proof_purposes[0] || 'supporting'
  return { id: attachment.id, uploadId: createRequestId(), fileKey: '', description: attachment.description, purpose, purposeIndex: Math.max(0, copy.purposes.findIndex(item => item.value === purpose)), attachment }
}
const purposeText = purposes => purposes.map(purpose => (copy.purposes.find(item => item.value === purpose) || {}).label).filter(Boolean).join('、') || '证明材料'

function formatTime(value) {
  const date = new Date(value)
  if (!value || Number.isNaN(date.getTime())) return '—'
  const pad = number => String(number).padStart(2, '0')
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function getFileSize(filePath) {
  return new Promise((resolve, reject) => wx.getFileSystemManager().getFileInfo({ filePath, success: result => resolve(result.size), fail: reject }))
}

Page(share.withShare('pages/special-cancellation/index', 'specialCancellation', {
  data: {
    screen: 'access',
    code: '',
    checkingCode: false,
    item: null,
    step: 1,
    materials: [],
    materialCount: 0,
    reasonCategories: copy.reasonCategories,
    reasonCategoryIndex: -1,
    reasonSubcategories: [],
    reasonSubcategoryIndex: -1,
    transportModes: copy.transportModes,
    transportModeIndex: -1,
    purposeLabels: copy.purposes.map(item => item.label),
    declarations: copy.declarations.map((text, index) => ({ key: `d${index}`, text, checked: false })),
    signatureReady: false,
    hasSignature: false,
    canContinueBasic: false,
    canContinueReason: false,
    canSubmit: false,
    materialHint: '',
    submitHint: '',
    progress: null,
    saving: false,
    uploading: false,
    submitting: false,
    errorText: '',
  },

  onLoad() {
    this._accessCode = ''
    this._pending = {}
    this._busy = false
    this._signatureData = ''
    this._supplementUpload = { id: createRequestId(), fileKey: '' }
  },

  onHide() { this.saveDraft().catch(() => {}) },

  onUnload() { this.saveDraft().catch(() => {}) },

  returnHome() {
    if (this.data.submitting || this.data.uploading) return
    if (getCurrentPages().length > 1) wx.navigateBack()
    else wx.reLaunch({ url: '/pages/home/index' })
  },

  // —— 申请码 ——
  updateCode(event) {
    this.setData({ code: String(event.detail.value || '').replace(/\D/g, '').slice(0, 6), errorText: '' })
  },

  async verifyCode() {
    if (this.data.checkingCode) return
    const code = this.data.code
    if (!/^\d{6}$/.test(code)) { this.setData({ errorText: '请输入六位数字申请码。' }); return }
    this.setData({ checkingCode: true, errorText: '' })
    try {
      const found = await specialCancellationApi.getByAccessCode(code)
      if (!found) { this.setData({ errorText: '申请码不正确或已过期。' }); return }
      this._accessCode = code
      this._pending = {}
      this._signatureData = found.signature_data || ''
      this.loadItem(found)
    } catch (error) {
      this.setData({ errorText: error.message || '申请码验证失败。' })
    } finally {
      this.setData({ checkingCode: false })
    }
  },

  loadItem(item) {
    if (item.status !== 'awaiting_guest') {
      this.setData({ screen: 'progress', item, progress: this.buildProgress(item), errorText: '' })
      return
    }
    const materials = [...item.attachments.map(rowFromAttachment), ...(item.attachments.length < MATERIAL_LIMIT ? [blankRow()] : [])]
    this.setData({
      screen: 'form', step: 1, item, materials,
      declarations: copy.declarations.map((text, index) => ({ key: `d${index}`, text, checked: item.declarations[`d${index}`] === true })),
      hasSignature: Boolean(this._signatureData),
      errorText: '',
    }, () => this.refreshDerived())
  },

  buildProgress(item) {
    const currentRound = item.attachments.filter(attachment => attachment.supplement_round === item.supplement_round)
    return {
      statusLabel: copy.statusLabels[item.status] || item.status,
      decisionResult: item.decision ? (item.decision.result || copy.statusLabels[item.status] || '') : '',
      decisionNote: item.decision ? item.decision.note || '' : '',
      reason: [item.reason_category, item.reason_subcategory].filter(Boolean).join(' / ') || '—',
      submittedAt: item.submitted_at ? formatTime(item.submitted_at) : '—',
      attachments: item.attachments.map(attachment => ({
        id: attachment.id, name: attachment.original_name, purpose: purposeText(attachment.proof_purposes), description: attachment.description,
        isNew: item.supplement_round > 0 && attachment.supplement_round === item.supplement_round,
      })),
      events: item.review_events.map(event => ({
        id: event.id, time: formatTime(event.created_at), note: event.note,
        title: `${copy.actorLabels[event.actor_type] || '系统'} · ${copy.eventLabels[event.event_type] || '处理申请'}`,
      })),
      needMoreInfo: item.status === 'need_more_info',
      atLimit: item.guest_material_count >= item.guest_material_limit,
      canSupplement: item.status === 'need_more_info' && item.guest_can_supplement,
      currentRoundCount: currentRound.length,
    }
  },

  // —— 草稿 ——
  update(patch, extra = {}) {
    const item = this.data.item
    if (!item || !EDITABLE.includes(item.status)) return
    this._pending = { ...this._pending, ...patch }
    const next = { errorText: '', ...extra }
    Object.keys(patch).forEach(key => { next[`item.${key}`] = patch[key] })
    this.setData(next, () => this.refreshDerived())
  },

  refreshDerived() {
    const { item, materials } = this.data
    if (!item) return
    const subcategories = copy.reasonSubcategories[item.reason_category] || []
    const attachments = item.attachments
    const isTransport = item.reason_subcategory === '航班列车异常'
    const basicReady = Boolean(item.booking_number.trim() && item.guest_phone.trim())
    const transportFieldsReady = Boolean(item.transport_mode && item.transport_trip.trim() && item.transport_date)
    const hasDisruption = attachments.some(attachment => attachment.proof_purposes.includes('disruption'))
    const hasPassenger = attachments.some(attachment => attachment.proof_purposes.includes('passenger'))
    const transportReady = !isTransport || (transportFieldsReady && hasDisruption && hasPassenger)
    const declarationsReady = copy.declarations.every((_, index) => item.declarations[`d${index}`] === true)
    const needsAttachment = item.reason_category === '不可抗力' && attachments.length === 0
    // 列出提交前还缺的内容，避免提交按钮不可点却没有说明。
    const materialMissing = []
    if (isTransport && !transportFieldsReady) materialMissing.push('交通方式、班次和日期')
    if (isTransport && !hasDisruption) materialMissing.push('用途为“班次异常”的材料')
    if (isTransport && !hasPassenger) materialMissing.push('用途为“本人购买／乘坐”的材料')
    if (!isTransport && needsAttachment) materialMissing.push('至少一份证明材料')
    const submitMissing = []
    if (!basicReady) submitMissing.push('订单号和联系方式')
    if (materialMissing.length) submitMissing.push('上一步的申请原因与证明材料')
    if (!declarationsReady) submitMissing.push('勾选全部声明')
    if (!this._signatureData) submitMissing.push('手写签名')
    this.setData({
      materialHint: materialMissing.length ? `提交前还需补充：${materialMissing.join('、')}。` : '',
      submitHint: submitMissing.length ? `提交前请完成：${submitMissing.join('、')}。` : '',
      reasonCategoryIndex: copy.reasonCategories.indexOf(item.reason_category),
      reasonSubcategories: subcategories,
      reasonSubcategoryIndex: subcategories.indexOf(item.reason_subcategory),
      transportModeIndex: copy.transportModes.indexOf(item.transport_mode),
      materialCount: materials.filter(row => row.attachment).length,
      canContinueBasic: basicReady,
      canContinueReason: Boolean(item.reason_category && item.reason_subcategory),
      canSubmit: basicReady && Boolean(this._signatureData) && declarationsReady && !needsAttachment && transportReady,
    })
  },

  async saveDraft() {
    const item = this.data.item
    if (!item || !EDITABLE.includes(item.status)) return
    const queued = { ...this._pending }
    if (!Object.keys(queued).length) return
    this.setData({ saving: true })
    try {
      await specialCancellationApi.saveGuest(item.id, this._accessCode, queued)
      this._pending = Object.fromEntries(Object.entries(this._pending).filter(([key, value]) => queued[key] !== value))
    } finally {
      this.setData({ saving: false })
    }
  },

  async advanceStep(event) {
    const nextStep = Number(event.currentTarget.dataset.step)
    if (this._busy) return
    if (nextStep === 2 && !this.data.canContinueBasic) return
    if (nextStep === 3 && this.data.step === 2 && !this.data.canContinueReason) return
    this._busy = true
    this.setData({ errorText: '' })
    try {
      await this.saveDraft()
      this.setData({ step: nextStep }, () => { if (nextStep === 3) this.initSignatureCanvas() })
      wx.pageScrollTo({ scrollTop: 0, duration: 0 })
    } catch (error) {
      this.setData({ errorText: `保存失败：${error.message || '请重试。'}` })
    } finally {
      this._busy = false
    }
  },

  backToBasic() {
    if (this._busy) return
    this.setData({ step: 1, errorText: '' })
  },

  // —— 第 1、2 步字段 ——
  updateField(event) {
    const field = event.currentTarget.dataset.field
    if (!['booking_number', 'guest_phone', 'transport_trip', 'description'].includes(field)) return
    this.update({ [field]: event.detail.value })
  },

  updateReasonCategory(event) {
    const value = copy.reasonCategories[Number(event.detail.value)]
    if (value) this.update({ reason_category: value, reason_subcategory: '' })
  },

  updateReasonSubcategory(event) {
    const value = this.data.reasonSubcategories[Number(event.detail.value)]
    if (value) this.update({ reason_subcategory: value })
  },

  updateTransportMode(event) {
    const value = copy.transportModes[Number(event.detail.value)]
    if (value) this.update({ transport_mode: value })
  },

  updateTransportDate(event) {
    this.update({ transport_date: event.detail.value })
  },

  // —— 证明材料 ——
  updateMaterialPurpose(event) {
    const index = Number(event.currentTarget.dataset.index)
    const purposeIndex = Number(event.detail.value)
    const purpose = copy.purposes[purposeIndex]
    const row = this.data.materials[index]
    if (!purpose || !row) return
    const patch = { [`materials[${index}].purpose`]: purpose.value, [`materials[${index}].purposeIndex`]: purposeIndex }
    if (!row.attachment) {
      this.setData(patch)
      return
    }
    // 已上传的材料同步更新用途，随草稿保存，提交条件随之重新计算。
    const attachment = { ...row.attachment, proof_purposes: [purpose.value] }
    patch[`materials[${index}].attachment`] = attachment
    this.update({ attachments: this.data.item.attachments.map(entry => entry.id === attachment.id ? attachment : entry) }, patch)
  },

  updateMaterialDescription(event) {
    const index = Number(event.currentTarget.dataset.index)
    const row = this.data.materials[index]
    if (!row) return
    const description = event.detail.value
    this.setData({ [`materials[${index}].description`]: description })
    if (row.attachment) {
      this.update({ attachments: this.data.item.attachments.map(attachment => attachment.id === row.attachment.id ? { ...attachment, description } : attachment) })
    }
  },

  addMaterialRow() {
    if (this.data.uploading || this.data.materials.length >= MATERIAL_LIMIT) return
    this.setData({ materials: [...this.data.materials, blankRow()] })
  },

  getProcessingCanvas() {
    return new Promise((resolve, reject) => {
      wx.createSelectorQuery().in(this).select('#photo-processing-canvas').fields({ node: true }).exec(result => {
        const canvas = result && result[0] && result[0].node
        if (canvas) resolve(canvas)
        else reject(new Error('image-processing-failed'))
      })
    })
  },

  // 与 Web 端一致：图片压缩为 JPEG，PDF 原样上传，均需小于 5MB。
  pickFile() {
    return new Promise((resolve, reject) => {
      wx.showActionSheet({
        itemList: ['拍照或从相册选择', '从聊天记录选择 PDF'],
        success: ({ tapIndex }) => {
          if (tapIndex === 0) {
            wx.chooseMedia({
              count: 1, mediaType: ['image'], sizeType: ['original', 'compressed'], sourceType: ['album', 'camera'],
              success: result => { const file = result.tempFiles[0]; resolve({ kind: 'image', path: file.tempFilePath, size: file.size, name: file.tempFilePath.split('/').pop() || 'proof.jpg' }) },
              fail: () => resolve(null),
            })
          } else {
            wx.chooseMessageFile({
              count: 1, type: 'file', extension: ['pdf'],
              success: result => { const file = result.tempFiles[0]; resolve({ kind: 'pdf', path: file.path, size: file.size, name: file.name || 'proof.pdf' }) },
              fail: () => resolve(null),
            })
          }
        },
        fail: () => resolve(null),
      })
    }).then(source => source, error => { throw error })
  },

  async prepareFile(source) {
    if (source.kind === 'pdf' || /\.pdf$/i.test(source.name)) {
      if (!/\.pdf$/i.test(source.name)) throw new Error('请选择 JPG、PNG 图片或 PDF 文件。')
      if (source.size >= MAX_BYTES) throw new Error('PDF 压缩后仍需小于 5MB，请拆分或更换文件。')
      return { path: source.path, name: source.name, mimeType: 'application/pdf', size: source.size, originalBytes: source.size }
    }
    let path
    try {
      path = await compressImageToLimit(source.path, MAX_BYTES - 1, { canvas: await this.getProcessingCanvas(), maxLongEdge: 2200, minLongEdge: 720 })
    } catch (error) {
      throw new Error(error && error.message === 'image-too-large' ? '图片压缩后仍超过 5MB，请更换图片。' : '图片处理失败，请重新选择。')
    }
    const name = `${source.name.replace(/\.[^.]+$/, '') || 'proof'}.jpg`
    return { path, name, mimeType: 'image/jpeg', size: await getFileSize(path), originalBytes: source.size }
  },

  async chooseMaterial(event) {
    const index = Number(event.currentTarget.dataset.index)
    const item = this.data.item
    const row = this.data.materials[index]
    if (!item || !row || this._busy || !EDITABLE.includes(item.status)) return
    const source = await this.pickFile()
    if (!source) return
    this._busy = true
    this.setData({ uploading: true, errorText: '' })
    try {
      const fileKey = `${source.name}:${source.size}`
      const uploadId = row.fileKey === fileKey ? row.uploadId : createRequestId()
      this.setData({ [`materials[${index}].uploadId`]: uploadId, [`materials[${index}].fileKey`]: fileKey })
      await this.saveDraft()
      const file = await this.prepareFile(source)
      const attachment = await specialCancellationApi.uploadAttachment(item.id, this._accessCode, {
        proof_purposes: [row.purpose], description: row.description, is_sensitive: item.reason_subcategory === '突发疾病 / 住院',
      }, file, uploadId)
      const attachments = [...this.data.item.attachments.filter(entry => !row.attachment || entry.id !== row.attachment.id), attachment]
      // 重新选择时，被替换的旧材料随草稿一起从申请中移除。
      if (row.attachment) this.update({ attachments }, { [`materials[${index}].attachment`]: attachment })
      else this.setData({ 'item.attachments': attachments, [`materials[${index}].attachment`]: attachment }, () => this.refreshDerived())
    } catch (error) {
      this.setData({ errorText: error.message || '上传失败，请检查网络和文件后重试。' })
    } finally {
      this._busy = false
      this.setData({ uploading: false })
    }
  },

  // —— 第 3 步：声明与签名 ——
  updateDeclarations(event) {
    const checked = event.detail.value || []
    const declarations = { ...this.data.item.declarations }
    copy.declarations.forEach((_, index) => { declarations[`d${index}`] = checked.includes(`d${index}`) })
    this.update({ declarations }, { declarations: this.data.declarations.map(entry => ({ ...entry, checked: declarations[entry.key] })) })
  },

  initSignatureCanvas() {
    this.createSelectorQuery().select('#signature-canvas').fields({ node: true, size: true }).exec(result => {
      const node = result && result[0]
      if (!node || !node.node) return
      const canvas = node.node
      const dpr = wx.getSystemInfoSync().pixelRatio || 1
      canvas.width = node.width * dpr
      canvas.height = node.height * dpr
      const ctx = canvas.getContext('2d')
      ctx.scale(dpr, dpr)
      ctx.lineWidth = 2.4
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.strokeStyle = '#0B1F44'
      this.signatureCanvas = canvas
      this.signatureContext = ctx
      this._signatureSize = { width: node.width, height: node.height }
      this._signatureHasInk = false
      this.setData({ signatureReady: true })
      if (this._signatureData) {
        const image = canvas.createImage()
        image.onload = () => { ctx.drawImage(image, 0, 0, node.width, node.height); this._signatureHasInk = true }
        image.src = this._signatureData
      }
    })
  },

  signatureStart(event) {
    const touch = event.changedTouches && event.changedTouches[0]
    if (!this.signatureContext || !touch) return
    this.signatureContext.beginPath()
    this.signatureContext.moveTo(touch.x, touch.y)
    this._signatureHasInk = true
  },

  signatureMove(event) {
    const touch = event.changedTouches && event.changedTouches[0]
    if (!this.signatureContext || !this._signatureHasInk || !touch) return
    this.signatureContext.lineTo(touch.x, touch.y)
    this.signatureContext.stroke()
  },

  signatureEnd() {
    if (!this.signatureCanvas || !this._signatureHasInk) return
    this._signatureData = this.signatureCanvas.toDataURL('image/png')
    this.update({ signature_data: this._signatureData }, { hasSignature: true })
  },

  clearSignature() {
    if (!this.signatureContext || !this._signatureSize) return
    this.signatureContext.clearRect(0, 0, this._signatureSize.width, this._signatureSize.height)
    this._signatureHasInk = false
    this._signatureData = ''
    this.update({ signature_data: '' }, { hasSignature: false })
  },

  async submit() {
    const item = this.data.item
    if (!item || !this.data.canSubmit || this._busy) return
    this._busy = true
    this.setData({ submitting: true, errorText: '' })
    try {
      await this.saveDraft()
      const current = this.data.item
      const result = await specialCancellationApi.submit(item.id, this._accessCode, {
        ...current, ...this._pending,
        guest_phone: current.guest_phone.trim(), booking_number: current.booking_number.trim(),
        signature_data: this._signatureData, attachments: undefined,
        review_events: undefined, decision: undefined,
      })
      this._pending = {}
      this.setData({ screen: 'progress', item: result, progress: this.buildProgress(result) })
      wx.pageScrollTo({ scrollTop: 0, duration: 0 })
    } catch (error) {
      this.setData({ errorText: error.message || '提交失败。请检查必填内容和网络后重试。' })
    } finally {
      this._busy = false
      this.setData({ submitting: false })
    }
  },

  // —— 待补充材料 ——
  async addSupplementMaterial() {
    const item = this.data.item
    if (!item || item.status !== 'need_more_info' || !item.guest_can_supplement || this._busy) return
    if (item.guest_material_count >= item.guest_material_limit) { this.setData({ errorText: '材料已达上限，请联系前台。' }); return }
    const source = await this.pickFile()
    if (!source) return
    this._busy = true
    this.setData({ uploading: true, errorText: '' })
    try {
      const fileKey = `${source.name}:${source.size}`
      if (this._supplementUpload.fileKey !== fileKey) this._supplementUpload = { id: createRequestId(), fileKey }
      const file = await this.prepareFile(source)
      const attachment = await specialCancellationApi.uploadAttachment(item.id, this._accessCode, { proof_purposes: ['supporting'], description: '', is_sensitive: false }, file, this._supplementUpload.id)
      const next = { ...item, attachments: [...item.attachments, attachment], guest_material_count: item.guest_material_count + 1 }
      this._supplementUpload = { id: createRequestId(), fileKey: '' }
      this.setData({ item: next, progress: this.buildProgress(next) })
    } catch (error) {
      this.setData({ errorText: error.message || '上传失败，请检查网络和文件后重试。' })
    } finally {
      this._busy = false
      this.setData({ uploading: false })
    }
  },

  async submitSupplement() {
    const item = this.data.item
    if (!item || item.status !== 'need_more_info' || !item.guest_can_supplement || this._busy) return
    if (!item.attachments.some(attachment => attachment.supplement_round === item.supplement_round)) { this.setData({ errorText: '至少新增一份证明材料后才能提交。' }); return }
    this._busy = true
    this.setData({ submitting: true, errorText: '' })
    try {
      const refreshed = await specialCancellationApi.submitSupplement(item.id, this._accessCode, item.supplement_round)
      this.setData({ item: refreshed, progress: this.buildProgress(refreshed) })
    } catch (error) {
      this.setData({ errorText: error.message || '提交失败，请检查网络后重试。' })
    } finally {
      this._busy = false
      this.setData({ submitting: false })
    }
  },
}))
