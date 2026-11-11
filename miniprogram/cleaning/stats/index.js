const api = require('../api')
const logic = require('../logic')

const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function dayLabel(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return `${m}月${d}日 ${WEEK[new Date(y, m - 1, d).getDay()]}`
}

Page({
  data: { label: '', units: 0, remainder: 0, days: [], isCurrent: true },

  onLoad() {
    this.cursor = new Date()
    this.cursor.setDate(1)
    this.load()
  },

  async load() {
    const key = monthKey(this.cursor)
    this.setData({ label: `${this.cursor.getFullYear()}年${this.cursor.getMonth() + 1}月`, isCurrent: key === monthKey(new Date()) })
    try {
      const result = logic.statsView(await api.stats(key))
      if (key !== monthKey(this.cursor)) return
      this.setData({ units: result.units, remainder: result.remainder, days: result.days.map((day) => ({ ...day, label: dayLabel(day.date) })) })
    } catch (error) {
      wx.showToast({ title: logic.errorText(error, '读取失败，请重试'), icon: 'none' })
    }
  },

  prev() {
    this.cursor.setMonth(this.cursor.getMonth() - 1)
    this.load()
  },

  next() {
    if (this.data.isCurrent) return
    this.cursor.setMonth(this.cursor.getMonth() + 1)
    this.load()
  },
})
