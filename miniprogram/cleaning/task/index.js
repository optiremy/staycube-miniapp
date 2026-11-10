const api = require('../api')
const logic = require('../logic')

const KIND = { checkout: '退房', change: '更换', move: '平移' }

function view(task) {
  const editable = task.status === 'doing' || task.status === 'rejected'
  const groups = task.groups.map((group) => ({
    ...group,
    done: group.items.filter((item) => item.checked).length,
  }))
  return {
    task,
    kind: KIND[task.category],
    editable,
    groups,
    photoDone: task.photos.filter((photo) => photo.path).length,
    canSubmit: logic.canSubmit(task),
  }
}

Page({
  data: { task: null, groups: [], editable: false, canSubmit: false, busy: false },

  onLoad(options) {
    this.id = options.id
    this.load()
  },

  async load() {
    try {
      const task = await api.task(this.id)
      wx.setNavigationBarTitle({ title: task.title })
      this.setData(view(task))
    } catch (error) {
      wx.showToast({ title: '任务不存在', icon: 'none' })
    }
  },

  async start() {
    this.setData(view(await api.start(this.id)))
  },

  async toggle(event) {
    if (!this.data.editable) return
    const { id, checked } = event.currentTarget.dataset
    this.setData(view(await api.check(this.id, id, !checked)))
  },

  shoot(event) {
    if (!this.data.editable) return
    const photoId = event.currentTarget.dataset.id
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['camera'],
      sizeType: ['compressed'],
      success: async (result) => {
        const path = result.tempFiles && result.tempFiles[0] && result.tempFiles[0].tempFilePath
        if (path) this.setData(view(await api.setPhoto(this.id, photoId, path)))
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
      wx.showToast({ title: '提交失败，请重试', icon: 'none' })
    }
  },
})
