const assert = require('node:assert/strict')
const { taskView, groupTasks } = require('../cleaning/logic')
const task = { id: 'demo', kind: 'checkout', status: 'pending', title: '碑林 C', staffNote: '被子放回前台\n重点清洁床下', groups: [], photoPoints: [] }
assert.equal(taskView(task).task.staffNote, task.staffNote)
assert.equal(groupTasks([task])[0].tasks[0].staffNote, task.staffNote)
assert.equal(taskView({ ...task, staffNote: undefined }).task.staffNote, '')
console.log('保洁备注展示逻辑通过')
assert.equal(taskView({ ...task, staffNoteDisplay: '合并来源备注' }).task.staffNote, '合并来源备注')

// 真实页面生命周期：操作后的新状态不能被旧读取覆盖，隐藏后不更新页面。
const vm = require('node:vm')
const fs = require('node:fs')
let pageDef
let resolveRead
const oldTask = { ...task, title: '旧读取' }
const newTask = { ...task, title: '操作后' }
const api = { task: () => new Promise(resolve => { resolveRead = resolve }), photoUrls: async () => ({}) }
vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname, '../cleaning/task/index.js'), 'utf8'), {
  Page: def => { pageDef = def },
  require: name => name === '../api' ? api : require('../cleaning/logic'),
  wx: { setNavigationBarTitle() {}, showToast() {} }, setTimeout,
})
const page = { ...pageDef, data: { ...pageDef.data }, id: 'demo', active: true, setData(v) { this.data = { ...this.data, ...v } } }
;(async () => {
  const read = page.load()
  await page.run(async () => newTask)
  resolveRead(oldTask)
  await read
  assert.equal(page.data.task.title, '操作后')
  const hiddenRead = page.load()
  page.onHide()
  resolveRead(oldTask)
  await hiddenRead
  assert.equal(page.data.task.title, '操作后')
  console.log('保洁详情乱序读取与隐藏回归通过')
})().catch(e => { console.error(e); process.exitCode = 1 })
