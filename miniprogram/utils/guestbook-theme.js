// 留言板时段色调：早晨 05–10、中午 10–16、傍晚 16–19、夜晚 19–05。
// 每个时段一套页面色值和七种卡片颜色；卡片亮度按回应数计算。
const COLORS = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'white']

const SLOTS = {
  dawn: {
    dark: false, nav: '#d9def4',
    sky: 'radial-gradient(90% 45% at 50% 108%, #ffd6bf 0%, transparent 70%), linear-gradient(180deg, #d9def4 0%, #ecdff0 45%, #fbe4d8 100%)',
    text: '#2b2d4a', sub: '#6b6a86', faint: '#9a97ad', line: 'rgba(60,50,90,.1)', card: '255,255,255', cardA: 0.5, accent: '255,138,110', onAccent: '#ffffff',
    hues: { red: '226,104,104', orange: '226,136,72', yellow: '200,160,40', green: '72,160,108', blue: '72,128,214', purple: '136,108,214', white: '150,150,170' },
  },
  noon: {
    dark: false, nav: '#d8ebff',
    sky: 'radial-gradient(70% 35% at 85% -5%, #fff6d8 0%, transparent 70%), linear-gradient(180deg, #d8ebff 0%, #eef6ff 50%, #f7fbff 100%)',
    text: '#0b1f44', sub: '#586b80', faint: '#8799ad', line: 'rgba(11,31,68,.09)', card: '255,255,255', cardA: 0.66, accent: '23,107,232', onAccent: '#ffffff',
    hues: { red: '214,72,72', orange: '222,122,40', yellow: '196,150,10', green: '36,150,90', blue: '23,107,232', purple: '118,84,214', white: '140,152,170' },
  },
  dusk: {
    dark: true, nav: '#2a2457',
    sky: 'radial-gradient(110% 40% at 50% 105%, #ff9466 0%, transparent 65%), linear-gradient(180deg, #2a2457 0%, #5a3473 45%, #a24a6e 80%, #d9665e 100%)',
    text: '#fff1ea', sub: '#e6c3c4', faint: '#b98e9e', line: 'rgba(255,255,255,.12)', card: '255,240,235', cardA: 0.07, accent: '255,180,120', onAccent: '#3a1630',
    hues: { red: '255,140,130', orange: '255,184,120', yellow: '255,224,150', green: '150,226,176', blue: '150,196,255', purple: '206,164,255', white: '255,240,232' },
  },
  night: {
    dark: true, nav: '#0c1426',
    sky: 'radial-gradient(120% 60% at 50% -10%, #14234a 0%, transparent 60%), linear-gradient(180deg, #0c1426, #070b16 55%)',
    text: '#e7edf7', sub: '#9aa8bd', faint: '#5d6b82', line: 'rgba(255,255,255,.08)', card: '255,255,255', cardA: 0.03, accent: '124,196,255', onAccent: '#06101f',
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
  return `background:${t.sky};color:${t.text};--text:${t.text};--sub:${t.sub};--faint:${t.faint};--line:${t.line};--accent:rgb(${t.accent});--accent-soft:rgba(${t.accent},.14);--on-accent:${t.onAccent};--card:rgba(${t.card},${t.cardA});`
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
