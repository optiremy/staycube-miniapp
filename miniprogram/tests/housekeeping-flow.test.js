const assert = require('node:assert/strict')
const path = require('node:path')

// 保洁端：列表分组、详情显示、提交条件、错误提示，以及接口请求（wx.request 用本地模拟，数据结构与
// stayCube 仓库 cloudbase/compat/20261109150000_cloudbase_housekeeping.sql 返回一致；数据库行为见该仓库
// scripts/assert-housekeeping-db.mjs）。
const requests = []
let reply = () => ({ statusCode: 200, data: null })
global.wx = {
  request(options) { requests.push(options); const r = reply(options); r.network ? options.fail({ errMsg: 'request:fail' }) : options.success(r) },
  uploadFile(options) { requests.push({ ...options, upload: true }); options.success({ statusCode: 200 }) },
  compressImage(options) { options.success({ tempFilePath: `${options.src}.small` }) },
  getStorageSync: () => '', setStorageSync() {}, removeStorageSync() {},
}
let signedIn = 0
require.cache[path.join(__dirname, '../utils/cloudbase-auth.js')] = { id: 'auth', filename: 'auth', loaded: true, exports: {
  signIn: async () => { signedIn += 1 }, accessToken: async () => 'token-wang', read: () => ({ sub: 'sub-wang' }), clear() {},
} }
const logic = require('../cleaning/logic')
const api = require('../cleaning/api')

// 三张卡片固定顺序，没有任务也保留；优先在前；被打回的显示原因；别人在做的显示名字
assert.deepEqual(logic.groupTasks([]).map((g) => [g.name, g.count]), [['退房', 0], ['更换', 0], ['平移', 0]])
const grouped = logic.groupTasks([
  { id: 'a', kind: 'checkout', status: 'pending', priorityRank: null, title: '汉城 C' },
  { id: 'b', kind: 'checkout', status: 'in_progress', priorityRank: 1, title: '曲江', mine: true },
  { id: 'c', kind: 'checkout', status: 'submitted', title: '碑林 D' },
  { id: 'd', kind: 'transfer', status: 'in_progress', rejectReason: '少一个衣架', title: '汉城 A → 秦都 C', mine: true },
  { id: 'e', kind: 'linen', status: 'pending', assigneeName: '李阿姨', mine: false, title: '莲湖 B' },
])
assert.deepEqual(grouped[0].tasks.map((t) => t.id), ['b', 'a'])
assert.equal(grouped[0].tasks[0].priority, true)
assert.deepEqual([grouped[2].tasks[0].rejected, grouped[2].tasks[0].rejectReason], [true, '少一个衣架'])
assert.equal(grouped[1].tasks[0].other, '李阿姨')

// 详情：布草件右侧写数量和来源；回收组可不勾；照片齐了、必做项勾全才能完成
const detail = {
  id: 't1', kind: 'transfer', title: '雁塔 A → 秦都 C', status: 'in_progress', mine: true, priorityRank: null, blockedBy: null,
  groups: [
    { id: 't0recycle', title: '秦都 C 回收', optional: true, items: [{ id: 'r1', text: '毛巾', qty: 1, checked: false }] },
    { id: 't0linen', title: '秦都 C', optional: false, items: [{ id: 'l1', text: '枕套', qty: 4, note: '用 雁塔 A 的', checked: true }] },
    { id: 'hg', title: '雁塔 A 储物柜', optional: false, items: [{ id: 'c1', text: '黑色衣架', qty: 3, required: true, checked: true }] },
  ],
  photoPoints: [{ id: 'b0', text: '秦都 C 床位', photos: [{ id: 'ph1', path: 't1/b0/x.jpg' }] }],
}
const view = logic.taskView(detail, { 't1/b0/x.jpg': 'https://signed' })
assert.equal(view.kind, '平移')
assert.equal(view.groups[1].items[0].right, '×4 用 雁塔 A 的')
assert.equal(view.photos[0].url, 'https://signed')
assert.equal(view.photos[0].photoId, 'ph1')
assert.equal(view.canSubmit, true)
assert.equal(logic.canSubmit({ ...detail, photoPoints: [{ id: 'b0', photos: [] }] }), false)
assert.equal(logic.canSubmit({ ...detail, blockedBy: '秦都 C' }), false)
assert.equal(logic.canSubmit({ ...detail, mine: false }), false, '别人的任务不能提交')
assert.equal(logic.taskView({ ...detail, status: 'pending', assigneeName: '李阿姨', mine: false }).canStart, false)
assert.equal(logic.taskView({ ...detail, status: 'pending', blockedBy: '秦都 C' }).canStart, false)
assert.equal(logic.errorText({ code: 'BLOCKED', detail: '秦都 C' }), '先完成 秦都 C 退房')

;(async () => {
  // 请求：带本人凭证调用 housekeeping_*；服务端错误码转成提示码
  reply = () => ({ statusCode: 200, data: { me: { todayUnits: 3 }, tasks: [] } })
  const list = await api.list()
  assert.equal(list.me.todayUnits, 3)
  assert.match(requests[0].url, /housekeeping_list$/)
  assert.equal(requests[0].header.Authorization, 'Bearer token-wang')
  reply = () => ({ statusCode: 400, data: { message: 'BLOCKED:秦都 C' } })
  await assert.rejects(api.start('t1'), (error) => error.code === 'BLOCKED' && error.detail === '秦都 C')
  reply = () => ({ statusCode: 400, data: { message: 'NOT_BOUND' } })
  await assert.rejects(api.list(), (error) => error.code === 'NOT_BOUND')
  reply = () => ({ network: true })
  await assert.rejects(api.list(), (error) => error.code === 'NETWORK')

  // 绑定：先微信登录，再提交绑定码
  reply = () => ({ statusCode: 200, data: { name: '王阿姨' } })
  assert.equal((await api.bind('k3v9q2m8x7c4p1za')).name, '王阿姨')
  assert.equal(signedIn, 1)
  assert.deepEqual(requests[requests.length - 1].data, { p_token: 'k3v9q2m8x7c4p1za' })

  // 拍照：压缩后传到「任务/拍照点/随机名.jpg」，再登记；重拍时移除旧照片
  requests.length = 0
  reply = () => ({ statusCode: 200, data: detail })
  await api.addPhoto('t1', 'b0', 'wxfile://tmp.jpg', 'ph1')
  const upload = requests.find((r) => r.upload)
  assert.equal(upload.filePath, 'wxfile://tmp.jpg.small')
  const stored = upload.url.split('/housekeeping-photos/')[1]
  assert.match(stored, /^t1\/b0\/[a-z0-9]{32}\.jpg$/)
  assert.deepEqual(requests.filter((r) => !r.upload).map((r) => r.url.split('/').pop()), ['housekeeping_photo_add', 'housekeeping_photo_remove'])
  assert.equal(requests[1].data.p_path, stored)
  console.log('housekeeping-flow ok')
})().catch((error) => { console.error(error); process.exitCode = 1 })
