const assert = require('node:assert/strict')

// 保洁端：列表分组、提交条件、工作量折算（规则见 plans/housekeeping.md）
const storage = new Map()
global.wx = { getStorageSync: (k) => storage.get(k) || '', setStorageSync: (k, v) => storage.set(k, v) }
const logic = require('../cleaning/logic')
const api = require('../cleaning/api')

// 三张卡片固定顺序，没有任务也保留；已提交的不显示；优先在前
const empty = logic.groupTasks([])
assert.deepEqual(empty.map((g) => [g.name, g.count]), [['退房', 0], ['更换', 0], ['平移', 0]])
const grouped = logic.groupTasks([
  { id: 'a', seq: 1, category: 'checkout', status: 'pending', priorityRank: null },
  { id: 'b', seq: 2, category: 'checkout', status: 'doing', priorityRank: 1 },
  { id: 'c', seq: 3, category: 'checkout', status: 'submitted', priorityRank: null },
  { id: 'd', seq: 4, category: 'move', status: 'rejected', priorityRank: null },
])
assert.deepEqual(grouped[0].tasks.map((t) => t.id), ['b', 'a'])
assert.equal(grouped[2].count, 1)

// 回收组可不勾；其余项与照片齐了才能完成；未开始不能完成
const task = { status: 'doing', groups: [{ optional: true, items: [{ checked: false }] }, { items: [{ checked: true }] }], photos: [{ path: 'x' }] }
assert.equal(logic.canSubmit(task), true)
assert.equal(logic.canSubmit({ ...task, photos: [{ path: '' }] }), false)
assert.equal(logic.canSubmit({ ...task, status: 'pending' }), false)

// 部分更换按件累计，每 3 件计 1，余数带到下个月
assert.deepEqual(logic.workload([{ units: 2 }, { pieces: 1 }, { pieces: 1 }], 1), { units: 3, remainder: 0 })
assert.deepEqual(logic.workload([{ pieces: 2 }]), { units: 0, remainder: 2 })

;(async () => {
  assert.equal(await api.bindPreview('nope'), null)
  assert.equal((await api.bind('demo')).name, '王阿姨')
  assert.equal(api.worker().name, '王阿姨')
  const before = await api.tasks()
  assert.deepEqual(before.groups.map((g) => g.count), [3, 2, 1])
  await api.start('t-lianhu-b')
  await assert.rejects(api.submit('t-lianhu-b'))
  await api.check('t-lianhu-b', 'lhb-l-0', true)
  await api.setPhoto('t-lianhu-b', 'lhb-p0', 'tmp.jpg')
  await api.submit('t-lianhu-b')
  const after = await api.tasks()
  assert.deepEqual(after.groups.map((g) => g.count), [3, 1, 1])
  const stats = await api.stats('2026-11')
  assert.equal(stats.units, 10)
  assert.equal(stats.remainder, 0)
  console.log('housekeeping-flow ok')
})()
