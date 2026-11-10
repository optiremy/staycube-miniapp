const api = require('../api')

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
    const result = await api.stats(key)
    this.setData({
      label: `${this.cursor.getFullYear()}年${this.cursor.getMonth() + 1}月`,
      units: result.units,
      remainder: result.remainder,
      isCurrent: key === monthKey(new Date()),
      days: result.days.map((day) => ({
        label: dayLabel(day.date),
        units: day.units,
        entries: day.entries.map((entry) => ({ title: entry.title, kind: entry.kind, amount: entry.pieces ? `${entry.pieces} 件` : `${entry.units}` })),
      })),
    })
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
