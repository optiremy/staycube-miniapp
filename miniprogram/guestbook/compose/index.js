const theme = require('../../utils/guestbook-theme')
const session = require('../../utils/guestbook-session')
const api = require('../api')

function themed(page) {
  const slot = theme.slotOf()
  theme.applyNavigationBar(slot)
  page.setData({ slot, pageStyle: theme.pageStyle(slot) })
  return slot
}

const NAMES = { red: '红', orange: '橙', yellow: '黄', green: '绿', blue: '蓝', purple: '紫', white: '白' }

Page({
  data: { mode: 'wall', content: '', color: 'blue', signature: 'room', colors: [], photos: [], limit: 120, maxPhotos: 1, submitting: false, editorStyle: '' },

  onLoad(options) {
    if (options.mode === 'book') this.setData({ mode: 'book', limit: 300, maxPhotos: 3, color: 'purple' })
  },

  onShow() {
    const slot = themed(this)
    const current = session.read()
    this.setData({ room: current.room || '', bed: current.bed || '', colors: theme.COLORS.map((key) => ({ key, name: NAMES[key], hue: theme.hue(slot, key) })) })
    this.updateEditor()
  },

  updateEditor() {
    const hue = theme.hue(this.data.slot, this.data.color)
    this.setData({ editorStyle: `border-color:${hue};box-shadow:0 0 68rpx -20rpx ${hue};` })
  },

  setMode(event) { this.setData({ mode: event.currentTarget.dataset.mode, limit: event.currentTarget.dataset.mode === 'book' ? 300 : 120, maxPhotos: event.currentTarget.dataset.mode === 'book' ? 3 : 1, photos: [] }) },
  input(event) { this.setData({ content: event.detail.value }) },
  pickColor(event) { this.setData({ color: event.currentTarget.dataset.key }); this.updateEditor() },
  pickSignature(event) { this.setData({ signature: event.currentTarget.dataset.value }) },

  choosePhoto() {
    const left = this.data.maxPhotos - this.data.photos.length
    if (left <= 0) return
    wx.chooseMedia({ count: left, mediaType: ['image'], sizeType: ['compressed'], success: (result) => {
      this.setData({ photos: this.data.photos.concat(result.tempFiles.map((file) => file.tempFilePath)) })
    } })
  },

  removePhoto(event) {
    const photos = this.data.photos.slice()
    photos.splice(event.currentTarget.dataset.index, 1)
    this.setData({ photos })
  },

  submit() {
    const content = this.data.content.trim()
    if (!content || this.data.submitting) return
    this.setData({ submitting: true })
    const request = this.data.mode === 'book'
      ? api.saveBookEntry({ content, signature: this.data.signature })
      : api.createNote({ content, color: this.data.color, signature: this.data.signature })
    request.then(() => wx.redirectTo({ url: `/guestbook/done/index?color=${this.data.color}&text=${encodeURIComponent(content)}&mode=${this.data.mode}` }))
      .catch((error) => { this.setData({ submitting: false }); wx.showToast({ title: error.code === 'TOO_FREQUENT' ? '操作太频繁，请稍后再试' : '提交失败，请重试', icon: 'none' }) })
  },
})
