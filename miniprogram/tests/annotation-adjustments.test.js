const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const copyData = require('../data/self-checkin-copy')
const preArrivalCopy = require('../data/pre-arrival-copy')

const projectRoot = path.resolve(__dirname, '..')
const selfCheckinMarkup = readFileSync(path.join(projectRoot, 'pages/index/index.wxml'), 'utf8')
const luggageMarkup = readFileSync(path.join(projectRoot, 'pages/luggage-storage/index.wxml'), 'utf8')
const preArrivalMarkup = readFileSync(path.join(projectRoot, 'pages/pre-arrival/index.wxml'), 'utf8')
const selfCheckinPreview = readFileSync(path.join(projectRoot, '../previews/self-checkin-annotation-preview.html'), 'utf8')
const luggagePreview = readFileSync(path.join(projectRoot, '../previews/luggage-storage-annotation-preview.html'), 'utf8')
const preArrivalPreview = readFileSync(path.join(projectRoot, '../previews/pre-arrival-annotation-preview.html'), 'utf8')

function loadSelfCheckinPage() {
  let definition
  global.Page = (value) => { definition = value }
  const modulePath = require.resolve('../pages/index/index')
  delete require.cache[modulePath]
  require(modulePath)
  return {
    ...definition,
    data: { ...definition.data, text: copyData.locales['zh-CN'] },
  }
}

async function run() {
  assert.match(selfCheckinMarkup, /class="qr-image"[^>]*data-path="\/assets\/police-registration-qr\.png"[^>]*bindtap="previewQrImage"/, 'police QR opens the native image preview on tap')
  assert.match(selfCheckinMarkup, /class="deposit-qr-image"[^>]*data-path="\/assets\/self-checkin-deposit\.png"[^>]*bindtap="previewQrImage"/, 'deposit QR opens the native image preview on tap')
  assert.match(selfCheckinMarkup, /class="qr-image"[^>]*mode="aspectFit"/, 'police QR uses a fixed square display box')
  assert.match(selfCheckinMarkup, /class="deposit-qr-image"[^>]*mode="aspectFit"/, 'deposit QR uses the same fixed square display box')
  const selfCheckinStyles = readFileSync(path.join(projectRoot, 'pages/index/index.wxss'), 'utf8')
  assert.match(selfCheckinStyles, /\.qr-image\s*\{[^}]*width:\s*320rpx;[^}]*height:\s*320rpx;/s, 'police QR is 320rpx square')
  assert.match(selfCheckinStyles, /\.deposit-qr-image\s*\{[^}]*width:\s*320rpx;[^}]*height:\s*320rpx;/s, 'deposit QR is also 320rpx square')
  assert.doesNotMatch(selfCheckinMarkup, /openQrShareMenu|openShareControl|show-menu-by-longpress|qr-save-button/, 'QRs no longer use the separate share API or an explicit save button')
  assert.match(selfCheckinMarkup, /wx:if="\{\{readingSeconds === 0\}\}" class="button-arrow"/, 'rules arrow is shown only after the reading countdown')
  assert.match(selfCheckinMarkup, /class="keep-together">房间\/床位<\/text>/, 'room and bed stay together on the submitted screen')
  assert.match(selfCheckinMarkup, /class="keep-together">联系我们<\/text>/, 'contact-us phrase stays together on the submitted screen')
  assert.match(luggageMarkup, /class="keep-together">联系前台<\/text>/, 'front-desk phrase stays together on the luggage result screen')
  assert.match(preArrivalMarkup, /class="arrival-guide-image"[^>]*show-menu-by-longpress="\{\{true\}\}"[^>]*bindtap="previewGuideImage"/, 'arrival guide supports native save and tap preview')

  for (const [locale, text] of Object.entries(copyData.locales)) {
    assert.ok(text.depositQrInstruction, `${locale} has deposit QR instructions`)
    assert.ok(text.policeQrInstruction, `${locale} has police QR instructions`)
    assert.match(text.depositQrInstruction, /save|guard|speicher|enregistr|salva|저장|保存/i, `${locale} tells guests to save the deposit QR image`)
    if (locale === 'zh-CN') assert.match(text.depositQrInstruction, /支付宝扫一扫或其他支付工具/, `${locale} mentions Alipay and other payment tools`)
    else assert.match(text.depositQrInstruction, /WeChat|Weixin/i, `${locale} mentions WeChat scanning`)
    assert.match(text.depositQrInstruction, /Alipay|支付宝|アリペイ|알리페이/i, `${locale} mentions Alipay scanning`)
    assert.match(text.depositQrInstruction, /album|gallery|photo|相册|アルバム|앨범|Galerie|galerie|álbum/i, `${locale} tells guests to select the saved image from the album`)
    assert.match(text.depositQrInstruction, /pay|payment|pagar|bezahlen|zahlung|payer|pagare|pagamento|결제|支付|支払/i, `${locale} says the scan is for payment`)
    assert.doesNotMatch(text.depositQrInstruction, /another phone|zweites Handy|autre téléphone|otro teléfono|別の端末|다른 휴대전화|另一部手机/i, `${locale} no longer suggests scanning with another phone`)
    assert.doesNotMatch(text.depositQrInstruction, /Save QR code|保存二维码|QRコードを保存|QR 코드 저장|Guardar código QR|QR-Code speichern|Enregistrer le QR code|Salva codice QR/i, `${locale} does not refer to a removed save button`)
    assert.doesNotMatch(text.policeDescription, /screenshot|スクリーンショット|スクリーンショット|截图保存|captura|Screenshot|スクリーンショット/i, `${locale} does not require a police QR screenshot`)
  }

  for (const [locale, text] of Object.entries(preArrivalCopy.locales)) {
    assert.match(text.guideTitle, /save|保存|speichern|enregistrer|salva|guardar|저장|salvar/i, `${locale} suggests saving the arrival guide`)
    assert.match(text.guideTitle, /hold|press|maintenez|gedrückt|pulsada|premuta|長押し|길게|长按/i, `${locale} says to press and hold the guide image`)
  }

  assert.doesNotMatch(selfCheckinPreview, /轻点二维码打开图片预览，再长按/, 'self-check-in preview removes the previous long-press instructions')
  assert.match(selfCheckinPreview, /请保存图片，使用支付宝扫一扫从相册中选择并识别二维码，完成公安登记。/, 'self-check-in preview uses the requested police QR instruction')
  assert.match(selfCheckinPreview, /请保存图片，使用支付宝扫一扫或其他支付工具从相册中选择并识别二维码完成支付。/, 'self-check-in preview uses the requested deposit QR instruction')
  assert.match(selfCheckinPreview, /\.police-qr\s*\{[^}]*width:\s*180px;[^}]*height:\s*180px;/s, 'police QR preview uses a fixed square display box')
  assert.match(selfCheckinPreview, /\.deposit-qr\s*\{[^}]*width:\s*180px;[^}]*height:\s*180px;/s, 'deposit QR preview matches the police QR size')
  assert.doesNotMatch(selfCheckinPreview, /保存二维码/, 'self-check-in preview has no explicit QR save buttons')
  assert.match(selfCheckinPreview, /<span class="keep-together">房间\/床位<\/span>/, 'self-check-in preview keeps the room and bed phrase together')
  assert.match(selfCheckinPreview, /<span class="keep-together">联系我们<\/span>/, 'self-check-in preview keeps the contact phrase together')
  assert.match(luggagePreview, /keep-together/, 'luggage preview keeps the front-desk phrase together')
  assert.match(luggagePreview, /完成寄存/, 'luggage preview uses the completion action')
  assert.match(preArrivalPreview, /到达指引（长按图片保存）/, 'pre-arrival preview states that the guide image can be saved by long-pressing')
  assert.match(preArrivalPreview, /长按图片可保存/, 'pre-arrival preview explains long-press save')

  const page = loadSelfCheckinPage()
  const originalWx = global.wx
  const previewCalls = []
  global.wx = {
    previewImage(options) { previewCalls.push(options) },
  }
  page.previewQrImage({ currentTarget: { dataset: { path: '/assets/police-registration-qr.png' } } })
  page.previewQrImage({ currentTarget: { dataset: { path: '/assets/self-checkin-deposit.png' } } })
  assert.deepEqual(previewCalls, [
    { current: '/assets/police-registration-qr.png', urls: ['/assets/police-registration-qr.png'], showmenu: true },
    { current: '/assets/self-checkin-deposit.png', urls: ['/assets/self-checkin-deposit.png'], showmenu: true },
  ], 'each QR opens its own image in the native preview with the long-press menu enabled')
  global.wx = originalWx

  console.log('annotation adjustment assertions passed')
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
