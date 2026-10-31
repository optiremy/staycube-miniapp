const assert = require('node:assert/strict')
const { withShare, shareTitle } = require('../utils/share')

let loaded = null
const page = withShare('pages/index/index', 'checkin', { data: { locale: 'zh-CN' }, onLoad(q) { loaded = q } })
const ctx = { data: { locale: 'zh-CN' } }
page.onLoad.call(ctx, { code: '123456' })
assert.deepEqual(loaded, { code: '123456' })
const msg = page.onShareAppMessage.call(ctx)
assert.equal(msg.path, '/pages/index/index') // 不带入住码
assert.ok(msg.title.startsWith('stayCube'))
assert.equal(page.onShareTimeline.call(ctx).query, '')
assert.equal(shareTitle(null, 'en-US'), 'stayCube')
console.log('share tests passed')
