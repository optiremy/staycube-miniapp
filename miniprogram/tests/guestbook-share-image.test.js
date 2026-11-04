const assert = require('assert')
const { wrapText, fitText, WIDTH, HEIGHT } = require('../utils/guestbook-share-image')

// 中文按字号计宽，足以验证折行和缩放规则
const ctx = { font: '', measureText(text) { return { width: Array.from(text).length * parseInt(this.font.match(/(\d+)px/)[1], 10) } } }

ctx.font = '400 40px sans'
assert.deepStrictEqual(wrapText(ctx, '一二三四五', 80), ['一二', '三四', '五'])
assert.deepStrictEqual(wrapText(ctx, '一\n二', 80), ['一', '二'])

assert.deepStrictEqual(wrapText(ctx, '一二，三', 80), ['一二，', '三'])

assert.strictEqual(WIDTH, 1080)
assert.strictEqual(HEIGHT, 1304)
const longText = '留'.repeat(120)
const fit = fitText(ctx, longText, true, 848, 400)
assert.ok(fit.height <= 400, '120 字有图时放得下')
const lines = fitText(ctx, Array(60).fill('字').join('\n'), false, 848, 300)
assert.strictEqual(lines.size, 24, '换行过多时缩到最小字号')
console.log('guestbook share image assertions passed')
