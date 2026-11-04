// 留言板时段色调：早晨 05–10、中午 10–16、傍晚 16–19、夜晚 19–05。
// 品牌蓝固定用于文字、图标和按钮，时段只改变背景氛围；每个时段另有七种卡片颜色，卡片亮度按回应数计算。
const COLORS = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'white']

const SLOTS = {
  dawn: {
    dark: false, nav: '#d8e6fb',
    sky: 'radial-gradient(100% 26% at 50% 104%, #ffd6bf 0%, transparent 72%), linear-gradient(180deg, #d8e6fb 0%, #e8f0fb 62%, #f4eef2 100%)',
    text: '#063884', sub: '#586b80', faint: '#8799ad', line: 'rgba(6,56,132,.1)', card: '255,255,255', cardA: 0.6, accent: '23,107,232', onAccent: '#ffffff',
    hues: { red: '226,104,104', orange: '226,136,72', yellow: '200,160,40', green: '72,160,108', blue: '72,128,214', purple: '136,108,214', white: '150,150,170' },
  },
  noon: {
    dark: false, nav: '#eef6ff',
    sky: 'radial-gradient(80% 30% at 88% -4%, #ffefb0 0%, transparent 72%), linear-gradient(180deg, #eef6ff 0%, #f7fbff 45%, #ffffff 100%)',
    text: '#063884', sub: '#586b80', faint: '#8799ad', line: 'rgba(6,56,132,.1)', card: '255,255,255', cardA: 0.82, accent: '23,107,232', onAccent: '#ffffff',
    hues: { red: '214,72,72', orange: '222,122,40', yellow: '196,150,10', green: '36,150,90', blue: '23,107,232', purple: '118,84,214', white: '140,152,170' },
  },
  dusk: {
    dark: true, nav: '#2a2457',
    sky: 'radial-gradient(110% 40% at 50% 105%, #ff9466 0%, transparent 65%), linear-gradient(180deg, #2a2457 0%, #5a3473 45%, #a24a6e 80%, #d9665e 100%)',
    text: '#fff1ea', sub: '#e6c3c4', faint: '#b98e9e', line: 'rgba(255,255,255,.12)', card: '42,36,87', cardA: 0.35, accent: '124,196,255', onAccent: '#06101f',
    hues: { red: '255,140,130', orange: '255,184,120', yellow: '255,224,150', green: '150,226,176', blue: '150,196,255', purple: '206,164,255', white: '255,240,232' },
  },
  night: {
    dark: true, nav: '#0c1426',
    sky: 'radial-gradient(120% 60% at 50% -10%, #14234a 0%, transparent 60%), linear-gradient(180deg, #0c1426, #070b16 55%)',
    text: '#e7edf7', sub: '#9aa8bd', faint: '#5d6b82', line: 'rgba(255,255,255,.08)', card: '255,255,255', cardA: 0.04, accent: '124,196,255', onAccent: '#06101f',
    hues: { red: '255,138,138', orange: '255,176,112', yellow: '255,222,128', green: '128,220,160', blue: '124,196,255', purple: '182,156,255', white: '226,232,244' },
  },
}

function slotOf(date = new Date()) {
  const hour = date.getHours()
  if (hour >= 5 && hour < 10) return 'dawn'
  if (hour >= 10 && hour < 16) return 'noon'
  if (hour >= 16 && hour < 19) return 'dusk'
  return 'night'
}

function pageStyle(slot) {
  const t = SLOTS[slot]
  return `background:${t.sky};color:${t.text};--text:${t.text};--sub:${t.sub};--faint:${t.faint};--line:${t.line};--accent:rgb(${t.accent});--accent-soft:rgba(${t.accent},.14);--on-accent:${t.onAccent};--card:rgba(${t.card},${t.cardA});--nav:${t.nav};`
}

// 亮度 0.12–1，回应越多越亮
function luminance(count, max) {
  const ratio = max > 0 ? Math.min(1, count / max) : 0
  return 0.12 + 0.88 * Math.pow(ratio, 0.8)
}

function noteStyle(slot, color, lum) {
  const t = SLOTS[slot]
  const hue = t.hues[color] || t.hues.blue
  const borderA = (0.12 + lum * 0.5).toFixed(2)
  const glow = Math.round(lum * 34)
  const bg = (t.cardA + lum * 0.05).toFixed(3)
  return `background:rgba(${t.card},${bg});border-color:rgba(${hue},${borderA});box-shadow:0 0 ${glow}rpx ${Math.round(-lum * 4)}rpx rgba(${hue},${t.dark ? 0.55 : 0.35});`
}

function hue(slot, color) {
  const t = SLOTS[slot]
  return `rgb(${t.hues[color] || t.hues.blue})`
}

function applyNavigationBar(slot) {
  const t = SLOTS[slot]
  wx.setNavigationBarColor({ frontColor: t.dark ? '#ffffff' : '#000000', backgroundColor: t.nav, animation: { duration: 0 } })
}

module.exports = { COLORS, SLOTS, slotOf, pageStyle, luminance, noteStyle, hue, applyNavigationBar }
