// 保洁端纯逻辑：列表分组、详情显示、提交条件。不依赖 wx，可在 node 下测试。
// 数据来自 CloudBase 的 housekeeping_* 函数（stayCube 仓库 cloudbase/compat/20261109150000_cloudbase_housekeeping.sql）。
// 规则见 plans/housekeeping.md。

const CATEGORIES = [
  { key: 'checkout', name: '退房' },
  { key: 'linen', name: '更换' },
  { key: 'transfer', name: '平移' },
]
const KIND_NAMES = { checkout: '退房', linen: '更换', transfer: '平移' }
const OPEN = ['pending', 'in_progress']

// 每类一张卡片（没有任务也保留，数量为 0）；只显示未提交的；优先的在前，再按日期和生成顺序（服务端已排好）
function groupTasks(tasks) {
  const open = (tasks || []).filter((task) => OPEN.includes(task.status))
  return CATEGORIES.map((category) => {
    const items = open
      .map((task, index) => ({ ...task, order: index }))
      .filter((task) => task.kind === category.key)
      .sort((a, b) => {
        const pa = a.priorityRank == null ? Infinity : a.priorityRank
        const pb = b.priorityRank == null ? Infinity : b.priorityRank
        return pa - pb || a.order - b.order
      })
      .map((task) => ({
        id: task.id,
        title: task.title,
        priority: task.priorityRank != null,
        rejected: task.status === 'in_progress' && !!task.rejectReason,
        rejectReason: task.rejectReason || '',
        other: task.assigneeName && !task.mine ? task.assigneeName : '',
      }))
    return { key: category.key, name: category.name, count: items.length, tasks: items }
  })
}

function itemRight(item) {
  const qty = Number(item.qty) > 1 ? `×${item.qty}` : ''
  return [qty, item.note || ''].filter(Boolean).join(' ')
}

// 详情：分组清单、拍照点；editable 只在自己整理中的任务上为 true
function taskView(task, photoUrls) {
  const urls = photoUrls || {}
  const editable = task.status === 'in_progress' && !!task.mine
  const groups = (task.groups || []).map((group) => ({
    id: group.id,
    title: group.title,
    optional: !!group.optional,
    done: group.items.filter((item) => item.checked).length,
    items: group.items.map((item) => ({ id: item.id, name: item.text, right: itemRight(item), checked: !!item.checked })),
  }))
  const photos = (task.photoPoints || []).map((point) => {
    const latest = (point.photos || [])[(point.photos || []).length - 1]
    return { id: point.id, name: point.text, photoId: latest ? latest.id : '', path: latest ? latest.path : '', url: latest ? urls[latest.path] || '' : '' }
  })
  return {
    task: { id: task.id, title: task.title, status: task.status, priority: task.priorityRank != null, rejectReason: task.rejectReason || '', blockedBy: task.blockedBy || '', other: task.assigneeName && !task.mine ? task.assigneeName : '' },
    kind: KIND_NAMES[task.kind] || '',
    editable,
    groups,
    photos,
    photoDone: photos.filter((photo) => photo.path).length,
    canStart: task.status === 'pending' && !task.blockedBy && !(task.assigneeName && !task.mine),
    canSubmit: canSubmit(task),
  }
}

// 「回收」「借用物品」组不是必做；其他必做项和全部拍照点齐了才能完成
function missing(task) {
  let items = 0
  ;(task.groups || []).forEach((group) => {
    if (group.optional) return
    group.items.forEach((item) => { if (item.required !== false && !item.checked) items += 1 })
  })
  const photos = (task.photoPoints || []).filter((point) => !(point.photos || []).length).length
  return { items, photos }
}

function canSubmit(task) {
  if (!task || task.status !== 'in_progress' || !task.mine || task.blockedBy) return false
  const left = missing(task)
  return left.items === 0 && left.photos === 0
}

// 本月工作量：部分更换按件显示，不足 3 件的余数由服务端带到下个月
function statsView(result) {
  return {
    units: result.units,
    remainder: result.remainder,
    days: (result.days || []).map((day) => ({
      date: day.date,
      units: day.units,
      entries: day.entries.map((entry) => ({ title: entry.title, kind: KIND_NAMES[entry.kind] || '', amount: entry.pieces ? `${entry.pieces} 件` : `${entry.units}` })),
    })),
  }
}

// 服务端错误码 → 保洁员看到的提示
const MESSAGES = {
  NOT_BOUND: '这个微信还没有绑定，请联系员工。',
  LOGIN_REQUIRED: '请先微信登录。',
  TOKEN_INVALID: '绑定码已失效，请联系员工重新生成。',
  WECHAT_IN_USE: '这个微信已绑定其他保洁员，请联系员工。',
  NOT_PENDING: '任务已开始或已变化，请返回刷新。',
  NOT_ASSIGNEE: '这条任务已指派给其他人。',
  NOT_IN_PROGRESS: '任务不在整理中，请返回刷新。',
  NOT_YET: '还没到这条任务的日期。',
  INCOMPLETE: '还有没勾选的项目或没拍的照片。',
  PHOTO_LIMIT: '这个拍照点最多 3 张。',
  INVALID_PHOTO: '照片上传失败，请重拍。',
  UPLOAD_FAILED: '照片上传失败，请检查网络后重拍。',
  NOT_FOUND: '任务已取消或不存在。',
  NETWORK: '网络不好，请稍后重试。',
}
function errorText(error, fallback) {
  const code = error && error.code
  if (code === 'BLOCKED') return `先完成 ${error.detail || '目标床位'} 退房`
  return MESSAGES[code] || fallback || '操作失败，请重试。'
}

module.exports = { CATEGORIES, KIND_NAMES, groupTasks, taskView, missing, canSubmit, statsView, errorText }
