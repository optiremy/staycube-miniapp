// 保洁端接口。后端未上线前使用 sample.js 的示例数据（状态保存在内存，重新编译后复原）；
// 接入 CloudBase 后只替换本文件，方法名与 plans/housekeeping-implementation.md 第 3 节的 RPC 一一对应。
const sample = require('./sample')
const logic = require('./logic')

const BOUND_KEY = 'cleaning-worker'
let store = null

function state() {
  if (!store) store = { tasks: sample.tasks(), approved: sample.approved(), submittedToday: [] }
  return store
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function find(id) {
  const task = state().tasks.find((item) => item.id === id)
  if (!task) throw new Error('NOT_FOUND')
  return task
}

function today() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const api = {
  worker() {
    try { return wx.getStorageSync(BOUND_KEY) || null } catch (error) { return null }
  },

  async bindPreview(token) {
    const name = sample.BIND_TOKENS[token]
    return name ? { name } : null
  },

  async bind(token) {
    const name = sample.BIND_TOKENS[token]
    if (!name) throw new Error('TOKEN_INVALID')
    const worker = { name }
    try { wx.setStorageSync(BOUND_KEY, worker) } catch (error) {}
    return worker
  },

  async tasks() {
    const done = state().submittedToday
    return { groups: logic.groupTasks(clone(state().tasks)), todayUnits: 3 + logic.workload(done).units }
  },

  async task(id) {
    return clone(find(id))
  },

  async start(id) {
    const task = find(id)
    if (task.status === 'pending') task.status = 'doing'
    return clone(task)
  },

  async check(id, itemId, checked) {
    const task = find(id)
    task.groups.forEach((group) => group.items.forEach((item) => { if (item.id === itemId) item.checked = checked }))
    return clone(task)
  },

  async setPhoto(id, photoId, path) {
    const task = find(id)
    task.photos.forEach((photo) => { if (photo.id === photoId) photo.path = path })
    return clone(task)
  },

  async submit(id) {
    const task = find(id)
    if (!logic.canSubmit(task)) throw new Error('INCOMPLETE')
    task.status = 'submitted'
    state().submittedToday.push({ units: task.units, pieces: task.pieces })
    return clone(task)
  },

  async stats(month) {
    const entries = state().approved.filter((entry) => entry.date.startsWith(month))
    const total = logic.workload(entries, sample.CARRY_IN[month] || 0)
    const days = []
    entries.forEach((entry) => {
      let day = days.find((item) => item.date === entry.date)
      if (!day) { day = { date: entry.date, entries: [] }; days.push(day) }
      day.entries.push(entry)
    })
    days.forEach((day) => { day.units = logic.workload(day.entries).units })
    return { month, units: total.units, remainder: total.remainder, days, today: today() }
  },
}

module.exports = api
