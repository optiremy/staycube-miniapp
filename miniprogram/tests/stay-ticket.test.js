// 首页身份：静默登录后按微信身份查询在住票卡和保洁员身份；自助入住提交凭证只用于认领一次；
// 登录或接口不可用时退回用本机凭证匿名查询。
const assert = require('node:assert/strict')
const path = require('node:path')

const storage = {}
let responses = []
const requests = []
global.wx = {
  getStorageSync: (key) => storage[key],
  setStorageSync: (key, value) => { storage[key] = value },
  removeStorageSync: (key) => { delete storage[key] },
  request(options) {
    requests.push(options)
    const next = responses.shift()
    if (next instanceof Error) options.fail({ errMsg: next.message })
    else if (next && next.__status) options.success({ statusCode: next.__status, data: {} })
    else options.success({ statusCode: 200, data: next })
  },
  setNavigationBarColor() {},
  getStorageInfoSync: () => ({ keys: [] }),
}

// 登录：saved 为本机已有凭证；signIn 可用时静默登录得到新凭证
const login = { saved: null, signInWorks: true, signIns: 0, cleared: 0 }
require.cache[path.join(__dirname, '../utils/cloudbase-auth.js')] = { id: 'auth', filename: 'auth', loaded: true, exports: {
  accessToken: async () => login.saved,
  signIn: async () => { login.signIns += 1; if (!login.signInWorks) throw new Error('LOGIN_FAILED'); login.saved = 'wx-token'; return { accessToken: 'wx-token' } },
  read: () => (login.saved ? { accessToken: login.saved } : null),
  clear: () => { login.cleared += 1; login.saved = null },
} }

const stayTicket = require('../utils/stay-ticket')
const token = 'ab'.repeat(16)
const names = () => requests.map((request) => request.url.replace(/^.*\/rpc\//, ''))
const reset = () => { requests.length = 0; responses = [] }
const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

async function run() {
  // 普通旅客第一次打开：静默登录，只调 guest_home；不是保洁员、没有票卡，本机不留东西
  responses.push({ cleaner: false, ticket: null })
  assert.equal(await stayTicket.refresh(), null)
  assert.equal(login.signIns, 1)
  assert.deepEqual(names(), ['guest_home'])
  assert.equal(requests[0].header.Authorization, 'Bearer wx-token')
  assert.equal(stayTicket.cachedCleaner(), false)
  assert.equal(storage['stay-ticket'], undefined)

  // 已登录过：不再登录
  reset(); responses.push({ cleaner: false, ticket: null })
  await stayTicket.refresh()
  assert.equal(login.signIns, 1)

  // 提交入住后：记下凭证并立即认领到当前微信名下；认领只做一次
  reset()
  stayTicket.remember('not-a-token')
  assert.equal(storage['stay-ticket'], undefined)
  responses.push({ state: 'claimed' }, { cleaner: false, ticket: null })
  stayTicket.remember(token.toUpperCase())
  await stayTicket.refresh()
  assert.deepEqual(names(), ['guest_claim_checkin', 'guest_home'])
  assert.deepEqual(requests[0].data, { p_token: token })
  assert.equal(storage['stay-ticket'].claimed, true)

  reset(); responses.push({ cleaner: false, ticket: { state: 'staying', room: '长安', bed: 'B', slipper: '12', nights: 2 } })
  assert.deepEqual(await stayTicket.refresh(), { state: 'staying', room: '长安', bed: 'B', slipper: '12', nights: 2 })
  assert.deepEqual(names(), ['guest_home'])
  assert.equal(stayTicket.cached().room, '长安')

  // 网络失败：保留上次结果（退路的匿名查询也失败）
  reset(); responses.push(new Error('network'), new Error('network'))
  assert.equal((await stayTicket.refresh()).bed, 'B')
  assert.deepEqual(names(), ['guest_home', 'guest_stay_ticket'])

  // 换手机、清缓存：本机什么都没有，仍按微信身份认出在住旅客和保洁员
  delete storage['stay-ticket']
  reset(); responses.push({ cleaner: true, ticket: { state: 'staying', room: '雁塔', bed: 'A', slipper: '', nights: 1 } })
  assert.equal((await stayTicket.refresh()).room, '雁塔')
  assert.equal(stayTicket.cachedCleaner(), true)

  // 退房、解绑：后台说了算，缓存跟着清掉
  reset(); responses.push({ cleaner: false, ticket: null })
  assert.equal(await stayTicket.refresh(), null)
  assert.equal(stayTicket.cached(), null)
  assert.equal(stayTicket.cachedCleaner(), false)

  // 登录凭证被拒：清掉凭证，下次重新登录
  reset(); responses.push({ __status: 401 })
  await stayTicket.refresh()
  assert.equal(login.cleared, 1)

  // 登录不可用：退回用本机凭证匿名查询；退房后清除凭证
  delete storage['stay-ticket']
  login.saved = null; login.signInWorks = false
  reset(); responses.push({ state: 'staying', room: '碑林', bed: 'C', slipper: '', nights: 1 })
  stayTicket.remember(token)
  assert.equal((await stayTicket.refresh()).room, '碑林')
  assert.deepEqual(names(), ['guest_stay_ticket'])
  assert.equal(storage['stay-ticket'].claimed, false)
  reset(); responses.push({ state: 'left' })
  assert.equal(await stayTicket.refresh(), null)
  assert.equal(storage['stay-ticket'], undefined)
  // 没有凭证也登录不了：不发请求
  reset()
  assert.equal(await stayTicket.refresh(), null)
  assert.equal(requests.length, 0)
  login.signInWorks = true

  // 同时多次调用只跑一次
  reset(); responses.push({ cleaner: false, ticket: null })
  await Promise.all([stayTicket.refresh(), stayTicket.refresh()])
  assert.deepEqual(names(), ['guest_home'])

  assert.equal(stayTicket.formatBed('长安', 'B', 'zh-CN'), '长安 B')
  assert.equal(stayTicket.formatBed('曲江', null, 'en-US'), 'Qujiang')

  // 首页：在住时显示票卡、行李寄存排第一；保洁员多一个入口排最前
  reset(); responses.push({ cleaner: false, ticket: { state: 'staying', room: '临潼', bed: 'A', slipper: '', nights: 3 } })
  await stayTicket.refresh()
  let definition
  global.Page = (value) => { definition = value }
  require('../pages/home/index')
  const page = { ...definition, data: { ...definition.data }, setData(changes) { this.data = { ...this.data, ...changes } } }
  page.applyLocale('en-US')
  assert.deepEqual(page.data.ticket, { bedLabel: 'LinTong A', nightParts: ['Night ', ''], nights: 3, slipper: '' })
  assert.equal(page.data.services[0].key, 'luggage-storage')
  assert.equal(page.data.services.some((service) => service.key === 'cleaning'), false)
  assert.equal(page.data.copy.board, undefined)

  reset(); responses.push({ cleaner: true, ticket: null })
  await stayTicket.refresh()
  page.applyLocale('zh-CN')
  assert.deepEqual(page.data.services[0], { key: 'cleaning', title: '保洁任务', path: '/cleaning/index/index' })
  assert.equal(page.data.services.length, 6)
  await tick()
  console.log('stay-ticket ok')
}

run().catch((error) => { console.error(error); process.exit(1) })
