const api = require('../api')
const logic = require('../logic')

Page({
  data: { task: null, groups: [], photos: [], editable: false, canStart: false, canSubmit: false, busy: false },

  onLoad(options) {
    this.id = options.id
    this.load()
  },

  async show(detail) {
    this.detail = detail
    this.setData(logic.taskView(detail, this.urls))
    const paths = (detail.photoPoints || []).flatMap((point) => (point.photos || []).map((photo) => photo.path)).filter((path) => !(this.urls || {})[path])
    if (paths.length) {
      this.urls = { ...(this.urls || {}), ...(await api.photoUrls(paths)) }
      if (this.detail === detail) this.setData(logic.taskView(detail, this.urls))
    }
  },

  async load() {
    try {
      const task = await api.task(this.id)
      wx.setNavigationBarTitle({ title: task.title })
      await this.show(task)
    } catch (error) {
      wx.showToast({ title: logic.errorText(error, '读取失败，请返回重试'), icon: 'none' })
    }
  },

  async run(work) {
    if (this.data.busy) return
    this.setData({ busy: true })
    try {
      await this.show(await work())
    } catch (error) {
      wx.showToast({ title: logic.errorText(error), icon: 'none' })
      if (error.code !== 'NETWORK') this.load()
    } finally {
      this.setData({ busy: false })
    }
  },

  start() {
    if (!this.data.canStart) return
    this.run(() => api.start(this.id))
  },

  toggle(event) {
    if (!this.data.editable) return
    const { id, checked } = event.currentTarget.dataset
    this.run(() => api.check(this.id, id, !checked))
  },

  shoot(event) {
    if (!this.data.editable || this.data.busy) return
    const { id, photo } = event.currentTarget.dataset
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['camera'],
      sizeType: ['compressed'],
      success: (result) => {
        const path = result.tempFiles && result.tempFiles[0] && result.tempFiles[0].tempFilePath
        if (!path) return
        wx.showLoading({ title: '正在上传', mask: true })
        this.run(() => api.addPhoto(this.id, id, path, photo || '')).then(() => wx.hideLoading())
      },
    })
  },

  async submit() {
    if (!this.data.canSubmit || this.data.busy) return
    this.setData({ busy: true })
    try {
      await api.submit(this.id)
      wx.showToast({ title: '已提交', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 600)
    } catch (error) {
      this.setData({ busy: false })
      wx.showToast({ title: logic.errorText(error, '提交失败，请重试'), icon: 'none' })
      if (error.code !== 'NETWORK') this.load()
    }
  },
})
