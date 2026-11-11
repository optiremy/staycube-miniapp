// 首页住宿票卡：自助入住提交凭证记在本机，首页凭它查询在住信息；退房或凭证无效后清除。
const assert = require('node:assert/strict')

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
    else options.success({ statusCode: 200, data: next })
  },
  setNavigationBarColor() {},
  getStorageInfoSync: () => ({ keys: [] }),
}

const stayTicket = require('../utils/stay-ticket')
const token = 'ab'.repeat(16)

async function run() {
  // 没有凭证：不发请求
  assert.equal(await stayTicket.refresh(), null)
  assert.equal(requests.length, 0)

  stayTicket.remember('not-a-token')
  assert.equal(storage['stay-ticket'], undefined)

  stayTicket.remember(token.toUpperCase())
  responses.push({ state: 'staying', room: '长安', bed: 'B', slipper: '12', nights: 2 })
  assert.deepEqual(await stayTicket.refresh(), { state: 'staying', room: '长安', bed: 'B', slipper: '12', nights: 2 })
  assert.match(requests[0].url, /\/rpc\/guest_stay_ticket$/)
  assert.deepEqual(requests[0].data, { p_token: token })
  assert.equal(stayTicket.cached().room, '长安')

  // 网络失败保留上次结果
  responses.push(new Error('network'))
  assert.equal((await stayTicket.refresh()).bed, 'B')

  // 待入住：无票卡，凭证保留
  responses.push({ state: 'pending' })
  assert.equal(await stayTicket.refresh(), null)
  assert.ok(storage['stay-ticket'])

  // 退房：清除凭证
  responses.push({ state: 'left' })
  assert.equal(await stayTicket.refresh(), null)
  assert.equal(storage['stay-ticket'], undefined)

  assert.equal(stayTicket.formatBed('长安', 'B', 'zh-CN'), '长安 B')
  assert.equal(stayTicket.formatBed('曲江', null, 'en-US'), 'Qujiang')

  // 首页显示票卡，在住时行李寄存排第一
  stayTicket.remember(token)
  responses.push({ state: 'staying', room: '临潼', bed: 'A', slipper: '', nights: 3 })
  await stayTicket.refresh()
  let definition
  global.Page = (value) => { definition = value }
  require('../pages/home/index')
  const page = { ...definition, data: { ...definition.data }, setData(changes) { this.data = { ...this.data, ...changes } } }
  page.applyLocale('en-US')
  assert.deepEqual(page.data.ticket, { bedLabel: 'LinTong A', nightParts: ['Night ', ''], nights: 3, slipper: '' })
  assert.equal(page.data.services[0].key, 'luggage-storage')
  assert.equal(page.data.copy.board, undefined)
  console.log('stay-ticket ok')
}

run().catch((error) => { console.error(error); process.exit(1) })
