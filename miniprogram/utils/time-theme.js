// 页面时段色调：早晨 05–10、中午 10–16、傍晚 16–19、夜晚 19–05。
// 品牌蓝固定用于文字、图标和按钮，时段只改变背景氛围。

const SLOTS = {
  dawn: {
    dark: false, nav: '#d8e6fb',
    sky: 'radial-gradient(100% 26% at 50% 104%, #ffd6bf 0%, transparent 72%), linear-gradient(180deg, #d8e6fb 0%, #e8f0fb 62%, #f4eef2 100%)',
    text: '#063884', sub: '#586b80', faint: '#8799ad', line: 'rgba(6,56,132,.1)', card: '255,255,255', cardA: 0.6, accent: '23,107,232', onAccent: '#ffffff',
  },
  noon: {
    dark: false, nav: '#eef6ff',
    sky: 'radial-gradient(80% 30% at 88% -4%, #ffefb0 0%, transparent 72%), linear-gradient(180deg, #eef6ff 0%, #f7fbff 45%, #ffffff 100%)',
    text: '#063884', sub: '#586b80', faint: '#8799ad', line: 'rgba(6,56,132,.1)', card: '255,255,255', cardA: 0.82, accent: '23,107,232', onAccent: '#ffffff',
  },
  dusk: {
    dark: true, nav: '#2a2457',
    sky: 'radial-gradient(110% 40% at 50% 105%, #ff9466 0%, transparent 65%), linear-gradient(180deg, #2a2457 0%, #5a3473 45%, #a24a6e 80%, #d9665e 100%)',
    text: '#fff1ea', sub: '#e6c3c4', faint: '#b98e9e', line: 'rgba(255,255,255,.12)', card: '42,36,87', cardA: 0.35, accent: '124,196,255', onAccent: '#06101f',
  },
  night: {
    dark: true, nav: '#0c1426',
    sky: 'radial-gradient(120% 60% at 50% -10%, #14234a 0%, transparent 60%), linear-gradient(180deg, #0c1426, #070b16 55%)',
    text: '#e7edf7', sub: '#9aa8bd', faint: '#5d6b82', line: 'rgba(255,255,255,.08)', card: '255,255,255', cardA: 0.04, accent: '124,196,255', onAccent: '#06101f',
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
  return `background:${t.sky};color:${t.text};--text:${t.text};--sub:${t.sub};--faint:${t.faint};--line:${t.line};--accent:rgb(${t.accent});--accent-soft:rgba(${t.accent},.14);--on-accent:${t.onAccent};--card:rgba(${t.card},${t.cardA});--nav:${t.nav};${formVars(t)}`
}

// 表单页（自助入住、寄存等）额外用到的输入框和浅底颜色。浅色时段保持白底输入框，深色时段改为半透明。
// 实心按钮：傍晚霞光上浅蓝发灰，改用品牌蓝白字；夜晚沿用浅蓝。
function formVars(t) {
  const button = t.nav === SLOTS.dusk.nav ? '--btn:#176be8;--on-btn:#ffffff;' : `--btn:rgb(${t.accent});--on-btn:${t.onAccent};`
  return button + (t.dark
    ? '--field:rgba(255,255,255,.07);--field-line:rgba(255,255,255,.2);--fill:rgba(255,255,255,.06);--sheet:' + t.nav + ';'
    : '--field:#ffffff;--field-line:rgba(6,56,132,.2);--fill:rgba(6,56,132,.05);--sheet:#ffffff;')
}

function applyNavigationBar(slot) {
  const t = SLOTS[slot]
  wx.setNavigationBarColor({ frontColor: t.dark ? '#ffffff' : '#000000', backgroundColor: t.nav, animation: { duration: 0 } })
}

// 各页套用当前时段：页面背景、导航栏、下拉回弹底色，以及 logo / 图标的日夜版本。
function themeData(slot = slotOf()) {
  const t = SLOTS[slot]
  applyNavigationBar(slot)
  if (wx.setBackgroundColor) wx.setBackgroundColor({ backgroundColor: t.nav, backgroundColorTop: t.nav, backgroundColorBottom: t.nav })
  return { pageStyle: pageStyle(slot), dark: t.dark, iconTone: t.dark ? 'night' : 'day' }
}

module.exports = { SLOTS, slotOf, pageStyle, applyNavigationBar, themeData }
