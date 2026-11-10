// 保洁端纯逻辑：列表分组、提交条件、工作量折算。不依赖 wx，可在 node 下测试。
// 规则见 plans/housekeeping.md。

const CATEGORIES = [
  { key: 'checkout', name: '退房' },
  { key: 'change', name: '更换' },
  { key: 'move', name: '平移' },
]

const OPEN = ['pending', 'doing', 'rejected']

// 只显示未提交的任务；每类一张卡片（没有任务也保留，数量为 0）；优先的在前，再按生成顺序
function groupTasks(tasks) {
  const open = (tasks || []).filter((task) => OPEN.includes(task.status))
  return CATEGORIES.map((category) => {
    const items = open
      .filter((task) => task.category === category.key)
      .sort((a, b) => {
        const pa = a.priorityRank == null ? Infinity : a.priorityRank
        const pb = b.priorityRank == null ? Infinity : b.priorityRank
        return pa - pb || a.seq - b.seq
      })
    return { key: category.key, name: category.name, count: items.length, tasks: items }
  })
}

// 「回收」组不是必做；其他清单项和全部拍照点齐了才能完成
function missing(task) {
  let items = 0
  ;(task.groups || []).forEach((group) => {
    if (group.optional) return
    group.items.forEach((item) => { if (!item.checked) items += 1 })
  })
  const photos = (task.photos || []).filter((photo) => !photo.path).length
  return { items, photos }
}

function canSubmit(task) {
  if (!task || !['doing', 'rejected'].includes(task.status)) return false
  const left = missing(task)
  return left.items === 0 && left.photos === 0
}

// 工作量：整套任务按床位数计；部分更换按件累计，每 3 件计 1，余数带到下个月
function workload(entries, carryIn = 0) {
  let units = 0
  let pieces = carryIn
  ;(entries || []).forEach((entry) => {
    if (entry.pieces) pieces += entry.pieces
    else units += entry.units || 0
  })
  units += Math.floor(pieces / 3)
  return { units, remainder: pieces % 3 }
}

module.exports = { CATEGORIES, groupTasks, missing, canSubmit, workload }
