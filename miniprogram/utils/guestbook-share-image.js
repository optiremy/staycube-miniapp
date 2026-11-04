// 留言分享图：1080 × 1304，发光磁贴样式；卡片内右下角为署名和数码日期，相纸下方宽边左侧为门店名、右侧为 logo。
// draw 只依赖 Canvas 2D 接口，本地预览 previews/guestbook-share-image-preview.html 使用同一份代码。
const WIDTH = 1080
const HEIGHT = 1304 // 卡片 952 × 1000，接近方形；整图比例接近真实拍立得相纸
const PAD = 64
const FOOT = 62
const STRIP = 240 // 相纸下方宽边，上左右留边为 PAD
const BODY_X = 52
const BODY_Y = 44
const LINE = 1.6
const PHOTO_MIN = 340
const FONT = '-apple-system, "PingFang SC", sans-serif'
const STAMP = '#ffffff'
const SLANT = 0.2
const FOOT_TEXT = 22
const META = 52 // 署名和日期两行的高度
const META_GAP = 24
const BRAND = '肆方空间 · 静眠旅宿'
const BRANCH = '西安体育场地铁站店'

// 七段数码管：a 上、b 右上、c 右下、d 下、e 左下、f 左上、g 中
const SEGMENTS = { 0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg' }

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

// 中文按字折行，保留旅客输入的换行；句末标点不落在行首
const NO_LINE_START = '，。！？、；：）》」』”’,.!?;:)'
function wrapText(ctx, text, maxWidth) {
  const lines = []
  String(text).split('\n').forEach((paragraph) => {
    let line = ''
    Array.from(paragraph).forEach((char) => {
      if (line && !NO_LINE_START.includes(char) && ctx.measureText(line + char).width > maxWidth) { lines.push(line); line = char } else line += char
    })
    lines.push(line)
  })
  return lines
}

// 字号按字数选择，放不下时继续缩小
function fitText(ctx, text, hasPhoto, maxWidth, maxHeight) {
  const count = Array.from(String(text)).length
  const weight = hasPhoto ? 400 : 600
  let size = hasPhoto ? (count > 60 ? 40 : count > 20 ? 46 : 54) : (count > 60 ? 46 : count > 20 ? 60 : 72)
  let lines = []
  for (; size >= 24; size -= 2) {
    ctx.font = `${weight} ${size}px ${FONT}`
    lines = wrapText(ctx, text, maxWidth)
    if (lines.length * size * LINE <= maxHeight) break
  }
  return { size: Math.max(size, 24), weight, lines, height: lines.length * Math.max(size, 24) * LINE }
}

function drawBackground(ctx) {
  const base = ctx.createLinearGradient(0, 0, 0, HEIGHT)
  base.addColorStop(0, '#0c1426')
  base.addColorStop(0.6, '#070b16')
  base.addColorStop(1, '#070b16')
  ctx.fillStyle = base
  ctx.fillRect(0, 0, WIDTH, HEIGHT)
  const glow = ctx.createRadialGradient(WIDTH / 2, -140, 0, WIDTH / 2, -140, 900)
  glow.addColorStop(0, '#14234a')
  glow.addColorStop(1, 'rgba(20,35,74,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, WIDTH, HEIGHT)
}

function drawCover(ctx, image, x, y, w, h) {
  const scale = Math.max(w / image.width, h / image.height)
  const sw = w / scale
  const sh = h / scale
  ctx.drawImage(image, (image.width - sw) / 2, (image.height - sh) / 2, sw, sh, x, y, w, h)
}

function drawTile(ctx, { text, photo, hue, author, date }) {
  const x = PAD
  const y = PAD
  const w = WIDTH - PAD * 2
  const h = HEIGHT - PAD - STRIP
  const r = 0 // 深色背景是相纸，卡片是成像区，成像区为直角
  const maxText = (photo ? h - PHOTO_MIN : h) - BODY_Y * 2 - META - META_GAP
  const fit = fitText(ctx, text, !!photo, w - BODY_X * 2, maxText)

  ctx.save()
  ctx.shadowColor = `rgba(${hue},.6)`
  ctx.shadowBlur = 90
  ctx.fillStyle = '#10182c'
  roundRect(ctx, x, y, w, h, r)
  ctx.fill()
  ctx.restore()

  ctx.save()
  roundRect(ctx, x, y, w, h, r)
  ctx.clip()
  const bodyHeight = fit.height + BODY_Y * 2 + META + META_GAP
  if (photo) drawCover(ctx, photo, x, y, w, h - bodyHeight)
  ctx.fillStyle = '#e7edf7'
  ctx.font = `${fit.weight} ${fit.size}px ${FONT}`
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  const lineHeight = fit.size * LINE
  const top = photo ? y + h - bodyHeight + BODY_Y : y + (h - META - META_GAP - fit.height) / 2
  fit.lines.forEach((line, index) => ctx.fillText(line, x + BODY_X, top + lineHeight * (index + 0.5)))
  drawMeta(ctx, author, date, x + w - BODY_X, y + h - BODY_Y)
  ctx.restore()

  ctx.strokeStyle = `rgba(${hue},.75)`
  ctx.lineWidth = 4
  roundRect(ctx, x, y, w, h, r)
  ctx.stroke()
  return fit
}

function drawSegment(ctx, x, y, w, h, t, name) {
  const m = h / 2
  const rect = {
    a: [x + t, y, w - t * 2, t], g: [x + t, y + m - t / 2, w - t * 2, t], d: [x + t, y + h - t, w - t * 2, t],
    f: [x, y + t, t, m - t * 1.5], b: [x + w - t, y + t, t, m - t * 1.5],
    e: [x, y + m + t / 2, t, m - t * 1.5], c: [x + w - t, y + m + t / 2, t, m - t * 1.5],
  }[name]
  ctx.fillRect(rect[0], rect[1], rect[2], rect[3])
}

// 日期从右向左排，原点在右下角
function drawStamp(ctx, value) {
  const w = 13
  const h = FOOT_TEXT
  const t = 3
  const gap = 5
  ctx.fillStyle = STAMP
  ctx.shadowColor = 'rgba(255,255,255,.45)'
  ctx.shadowBlur = 8
  let x = 0
  Array.from(String(value)).reverse().forEach((char) => {
    if (SEGMENTS[char]) {
      x -= w
      SEGMENTS[char].split('').forEach((name) => drawSegment(ctx, x, -h, w, h, t, name))
      x -= gap
    } else if (char === '.') {
      x -= t
      ctx.fillRect(x, -t, t, t)
      x -= gap
    }
  })
}

// 署名和日期统一按相同角度倾斜，不依赖字体自带的斜体
function drawMeta(ctx, author, date, right, bottom) {
  ctx.save()
  ctx.translate(right, bottom)
  ctx.transform(1, 0, -SLANT, 1, 0, 0)
  drawStamp(ctx, date)
  ctx.shadowColor = 'rgba(255,255,255,.35)'
  ctx.shadowBlur = 8
  ctx.textAlign = 'right'
  ctx.textBaseline = 'alphabetic'
  ctx.font = `500 ${FOOT_TEXT}px ${FONT}`
  ctx.fillText(author, 0, -33)
  ctx.restore()
}

function drawPin(ctx, x, y) {
  const r = 13
  ctx.fillStyle = STAMP
  ctx.beginPath()
  ctx.arc(x, y + r, r, Math.PI * 0.85, Math.PI * 0.15)
  ctx.lineTo(x, y + 34)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#070b16'
  ctx.beginPath()
  ctx.arc(x, y + r, 5, 0, Math.PI * 2)
  ctx.fill()
}

// 逐字绘制以增加字距；Canvas 的 letterSpacing 在部分机型不可用
function drawSpaced(ctx, text, x, y, spacing) {
  let left = x
  Array.from(text).forEach((char) => {
    ctx.fillText(char, left, y)
    left += ctx.measureText(char).width + spacing
  })
}

// 相纸下方宽边：左侧门店名对齐卡片左边框，右侧 logo 对齐卡片右边框，都在宽边内上下居中
function drawFoot(ctx, logo) {
  const middle = HEIGHT - STRIP / 2
  ctx.save()
  drawPin(ctx, PAD + 13, middle - 17)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = STAMP
  ctx.font = `600 26px ${FONT}`
  drawSpaced(ctx, BRAND, PAD + 46, middle - 10, 2)
  ctx.fillStyle = 'rgba(255,255,255,.72)'
  ctx.font = `400 22px ${FONT}`
  drawSpaced(ctx, BRANCH, PAD + 46, middle + 30, 1.5)
  // logo 图片上下有透明留白，按可见部分居中
  if (logo) {
    const width = FOOT * logo.width / logo.height
    ctx.drawImage(logo, WIDTH - PAD - width, middle - 29, width, FOOT)
  }
  ctx.restore()
}

// note：{ text, author, date, hue, photo, logo }；photo、logo 为已加载的图片
function draw(ctx, note) {
  ctx.clearRect(0, 0, WIDTH, HEIGHT)
  drawBackground(ctx)
  const fit = drawTile(ctx, note)
  drawFoot(ctx, note.logo)
  return fit
}

function loadImage(canvas, src) {
  return new Promise((resolve, reject) => {
    const image = canvas.createImage()
    image.onload = () => resolve(image)
    image.onerror = reject
    image.src = src
  })
}

// 出错时标记步骤，便于定位
function step(name, promise) {
  return promise.catch((error) => { throw Object.assign(new Error(`${name}: ${(error && (error.errMsg || error.message)) || 'unknown'}`), { step: name }) })
}

// 照片经 wx.request 取回（网关已在 request 合法域名内），写入本地后再绘制
function downloadPhoto(url) {
  return new Promise((resolve, reject) => wx.request({
    url,
    responseType: 'arraybuffer',
    timeout: 30000,
    success(response) {
      if (response.statusCode !== 200) { reject(new Error(`HTTP ${response.statusCode}`)); return }
      const filePath = `${wx.env.USER_DATA_PATH}/guestbook-share-${Date.now()}.jpg`
      wx.getFileSystemManager().writeFile({ filePath, data: response.data, success: () => resolve(filePath), fail: reject })
    },
    fail: reject,
  }))
}

function removeFile(filePath) {
  if (filePath) wx.getFileSystemManager().unlink({ filePath, fail() {} })
}

// 在页面的 canvas 上生成分享图，返回临时文件路径
function create(page, canvasId, note) {
  return new Promise((resolve, reject) => {
    wx.createSelectorQuery().in(page).select(`#${canvasId}`).fields({ node: true }).exec(async (result) => {
      let photoFile = null
      try {
        const canvas = result[0].node
        canvas.width = WIDTH
        canvas.height = HEIGHT
        const logo = await step('logo', loadImage(canvas, '/assets/sifang-white.png'))
        if (note.photoUrl) photoFile = await step('download', downloadPhoto(note.photoUrl))
        const photo = photoFile ? await step('photo', loadImage(canvas, photoFile)) : null
        draw(canvas.getContext('2d'), { ...note, logo, photo })
        const path = await step('export', new Promise((done, fail) => wx.canvasToTempFilePath({
          canvas, fileType: 'jpg', quality: 0.92, destWidth: WIDTH, destHeight: HEIGHT,
          success: (file) => done(file.tempFilePath),
          fail,
        })))
        resolve(path)
      } catch (error) { reject(error) } finally { removeFile(photoFile) }
    })
  })
}

module.exports = { WIDTH, HEIGHT, wrapText, fitText, draw, create }
