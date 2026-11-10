// 保洁端示例数据：后端（plans/housekeeping-implementation.md）上线前，api.js 用这份数据走通页面。
// 清单结构与正式接口一致：groups[{ title, optional, items[{ id, name, right, checked }] }]、photos[{ id, name, path }]。

const DORM_PHOTO = '拉开帘子，拍整理好的床位'

function linen(prefix, right, names) {
  return (names || ['床笠', '被套', '枕套']).map((name, index) => ({ id: `${prefix}-${index}`, name, right, checked: false }))
}

function list(prefix, rows) {
  return rows.map(([name, right], index) => ({ id: `${prefix}-${index}`, name, right: right || '', checked: false }))
}

function photo(id, name) {
  return { id, name, path: '' }
}

function tasks() {
  return [
    {
      id: 't-qujiang', seq: 1, category: 'checkout', title: '曲江', priorityRank: 1, status: 'pending', units: 2,
      groups: [
        { title: '回收', optional: true, items: list('qj-r', [['毛巾', '×2'], ['浴巾', '×2'], ['地巾', '×1']]) },
        { title: '布草', items: [...linen('qj-l', '换新', ['大床笠', '大被罩']), { id: 'qj-l-2', name: '枕套', right: '×4 换新', checked: false }] },
        { title: '房间', items: list('qj-room', [['浴巾', '×2'], ['抽纸', '×2']]) },
        { title: '卫生间', items: list('qj-bath', [['毛巾', '×2'], ['一次性牙具', '×2'], ['梳子', '×1'], ['卷纸', '×1'], ['地巾', '×1']]) },
        { title: 'minibar', items: list('qj-bar', [['可乐', '×1'], ['雪碧', '×1'], ['350ml 怡宝', '×4']]) },
      ],
      photos: [photo('qj-p0', '房间全景'), photo('qj-p1', '卫生间全景')],
    },
    {
      id: 't-yanta-f', seq: 2, category: 'checkout', title: '雁塔 F', priorityRank: 2, status: 'pending', units: 1,
      groups: [
        { title: '借用物品', optional: true, items: list('ytf-b', [['被芯', '×1'], ['被套', '×1'], ['枕芯', '×1'], ['枕套', '×1']]) },
        { title: '布草', items: linen('ytf-l', '换新') },
        { title: '储物柜', items: list('ytf-c', [['黑色衣架', '×3'], ['隔音耳塞', '×1']]) },
      ],
      photos: [photo('ytf-p0', DORM_PHOTO)],
    },
    {
      id: 't-weiyang-e', seq: 3, category: 'checkout', title: '未央 E', priorityRank: null, status: 'rejected', units: 1,
      rejectReason: '储物柜少一个衣架',
      groups: [
        { title: '布草', items: linen('wye-l', '换新').map((item) => ({ ...item, checked: true })) },
        { title: '储物柜', items: list('wye-c', [['黑色衣架', '×3'], ['隔音耳塞', '×1']]).map((item) => ({ ...item, checked: true })) },
      ],
      photos: [{ id: 'wye-p0', name: DORM_PHOTO, path: '' }],
    },
    {
      id: 't-lianhu-b', seq: 4, category: 'change', title: '莲湖 B', priorityRank: null, status: 'pending', pieces: 1,
      groups: [{ title: '布草', items: linen('lhb-l', '换新', ['枕套']) }],
      photos: [photo('lhb-p0', DORM_PHOTO)],
    },
    {
      id: 't-bashang', seq: 5, category: 'change', title: '灞上', priorityRank: null, status: 'pending', units: 1,
      groups: [{ title: '布草', items: linen('bs-l', '换新') }],
      photos: [photo('bs-p0', '房间全景')],
    },
    {
      id: 't-move-hc', seq: 6, category: 'move', title: '汉城 A → 秦都 C', priorityRank: null, status: 'pending', units: 1,
      groups: [
        { title: '秦都 C', items: linen('mv-c', '用 汉城 A 的') },
        { title: '汉城 A', items: linen('mv-a', '换新') },
      ],
      photos: [photo('mv-p0', '秦都 C 床位'), photo('mv-p1', '汉城 A 床位')],
    },
  ]
}

// 本月已通过的任务（按天）。pieces 为部分更换的件数，其余按 units 计
function approved() {
  return [
    { date: '2026-11-08', title: '秦都 A', kind: '退房', units: 1 },
    { date: '2026-11-08', title: '秦都 B', kind: '退房', units: 1 },
    { date: '2026-11-08', title: '汉城 D → 碑林 B', kind: '平移', units: 1 },
    { date: '2026-11-08', title: '曲江', kind: '更换', units: 2 },
    { date: '2026-11-08', title: '长安 B', kind: '更换', pieces: 1 },
    { date: '2026-11-07', title: '未央 C', kind: '退房', units: 1 },
    { date: '2026-11-07', title: '灞上', kind: '退房', units: 1 },
    { date: '2026-11-07', title: '莲湖 A', kind: '更换', pieces: 1 },
    { date: '2026-11-06', title: '雁塔 B', kind: '退房', units: 1 },
    { date: '2026-11-06', title: '碑林 C', kind: '更换', units: 1 },
  ]
}

module.exports = { tasks, approved, CARRY_IN: { '2026-11': 1 }, BIND_TOKENS: { demo: '王阿姨' } }
