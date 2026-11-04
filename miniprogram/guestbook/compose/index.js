const theme = require('../../utils/guestbook-theme')
const session = require('../../utils/guestbook-session')
const api = require('../api')
const i18n = require('../../utils/guestbook-i18n')

function themed(page) {
  const slot = theme.slotOf()
  theme.applyNavigationBar(slot)
  page.setData({ slot, pageStyle: theme.pageStyle(slot) })
  return slot
}

Page({
  data: { mode: 'wall', content: '', color: 'blue', signature: 'nickname', nickname: '', signatures: [], colors: [], photos: [], limit: 120, maxPhotos: 1, submitting: false, editorStyle: '' },

  onLoad(options) {
    const t = i18n.copy()
    this.setData({ t, nickname: session.read().nickname || '' })
    wx.setNavigationBarTitle({ title: options.mode === 'book' ? t.book : t.write })
    if (options.mode === 'book') this.setData({ mode: 'book', limit: 300, maxPhotos: 3, color: 'purple' })
    if (options.edit) this.loadEdit(options.edit)
    else if (options.mode === 'book') this.loadTodayEntry()
  },

  // 床位留言簿每天一条：当天写过就接着改这一条，不另起新的
  async loadTodayEntry() {
    const today = (await api.listMine().catch(() => [])).find((entry) => entry.kind === 'entry' && entry.editable)
    if (today) this.loadEdit(today.id)
  },

  // 修改：从“我的”取出这条留言，照片保留原路径
  async loadEdit(id) {
    const item = (await api.listMine().catch(() => [])).find((entry) => entry.id === id && entry.editable)
    if (!item) { wx.showToast({ title: this.data.t.cannotEdit, icon: 'none' }); return }
    const paths = item.kind === 'entry' ? (item.photoPaths || []) : [item.photoPath].filter(Boolean)
    const urls = await api.photoUrls(paths)
    this._originalPaths = paths
    this.setData({ editId: id, content: item.content, color: item.color || this.data.color, signature: item.signature, nickname: item.nickname || this.data.nickname, photos: paths.map((path) => ({ src: urls[path] || '', path })) })
    this.updateSignatures()
    this.updateEditor()
  },

  onShow() {
    const slot = themed(this)
    const t = this.data.t
    this.updateSignatures()
    this.setData({ colors: theme.COLORS.map((key) => ({ key, name: t.colors[key], hue: theme.hue(slot, key) })) })
    this.updateEditor()
  },

  // 署名：留言墙为昵称、床位（与自助入住写法一致，单间只有房间名）、匿名；床位留言簿为昵称、匿名
  updateSignatures() {
    const current = session.read()
    const t = this.data.t
    const bedLabel = current.room ? i18n.formatBed(current.room, current.bed, t.locale) : ''
    const signatures = [{ value: 'nickname', label: t.nickname }, this.data.mode !== 'book' && bedLabel && { value: 'bed', label: bedLabel }, { value: 'anonymous', label: t.anonymous }].filter(Boolean)
    const signature = signatures.some((item) => item.value === this.data.signature) ? this.data.signature : signatures[0].value
    this.setData({ signatures, signature })
  },

  updateEditor() {
    const hue = theme.hue(this.data.slot, this.data.color)
    this.setData({ editorStyle: `border-color:${hue};box-shadow:0 0 68rpx -20rpx ${hue};` })
  },

  input(event) { this.setData({ content: event.detail.value }) },
  pickColor(event) { this.setData({ color: event.currentTarget.dataset.key }); this.updateEditor() },
  pickSignature(event) { this.setData({ signature: event.currentTarget.dataset.value }) },
  inputNickname(event) { this.setData({ nickname: event.detail.value }) },

  choosePhoto() {
    const left = this.data.maxPhotos - this.data.photos.length
    if (left <= 0) return
    wx.chooseMedia({ count: left, mediaType: ['image'], sizeType: ['compressed'], success: (result) => {
      this.setData({ photos: this.data.photos.concat(result.tempFiles.map((file) => ({ src: file.tempFilePath, path: null }))) })
    } })
  },

  removePhoto(event) {
    const photos = this.data.photos.slice()
    photos.splice(event.currentTarget.dataset.index, 1)
    this.setData({ photos })
  },

  submit() {
    const content = this.data.content.trim()
    const nickname = this.data.nickname.trim()
    if (!content || this.data.submitting || (this.data.signature === 'nickname' && !nickname)) return
    this.setData({ submitting: true })
    const { mode, color, signature, photos, editId } = this.data
    const request = api.uploadPhotos(photos.filter((photo) => !photo.path).map((photo) => photo.src)).then((uploaded) => {
      const paths = photos.filter((photo) => photo.path).map((photo) => photo.path).concat(uploaded)
      const save = mode === 'book' ? api.saveBookEntry({ content, color, signature, nickname, photoPaths: paths })
        : editId ? api.updateNote({ id: editId, content, color, signature, nickname, photoPath: paths[0] || null })
        : api.createNote({ content, color, signature, nickname, photoPath: paths[0] || null })
      return save.then(() => api.removePhotos((this._originalPaths || []).filter((path) => !paths.includes(path))))
    })
    request.then(() => {
      // 记下最新昵称，下次发布直接带出
      if (signature === 'nickname') session.save({ ...session.read(), nickname })
      wx.redirectTo({ url: `/guestbook/done/index?color=${this.data.color}&text=${encodeURIComponent(content)}&mode=${this.data.mode}` })
    })
      .catch((error) => { this.setData({ submitting: false }); wx.showToast({ title: error.code === 'TOO_FREQUENT' ? this.data.t.tooFrequent : error.code === 'UPLOAD_FAILED' ? this.data.t.uploadFailed : this.data.t.submitFailed, icon: 'none' }) })
  },
})
