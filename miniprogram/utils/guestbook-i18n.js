// 留言板多语言：按首页选择的语言取文案；房间名在非中文下显示拼音（与自助入住一致）。
const appLocale = require('./app-locale')
const globalCopy = require('../data/global-copy')
const guestbookCopy = require('../data/guestbook-copy')

const ROOM_PINYIN = { 曲江: 'Qujiang', 灞上: 'Bashang', 汉城: 'Hancheng', 秦都: 'Qindu', 莲湖: 'Lianhu', 长安: 'Changan', 雁塔: 'Yanta', 碑林: 'Beilin', 未央: 'Weiyang', 临潼: 'LinTong' }

// 登录页选择顺序：合住房间在前，床位统一 A-F；独立房间不选床位
const ROOMS = ['汉城', '秦都', '临潼', '莲湖', '长安', '雁塔', '碑林', '未央', '曲江', '灞上']
const PRIVATE_ROOMS = ['曲江', '灞上']
const BEDS = ['A', 'B', 'C', 'D', 'E', 'F']

function copy(locale = appLocale.getLocale()) {
  const board = (globalCopy[locale] || globalCopy['zh-CN']).board
  return { ...(guestbookCopy[locale] || guestbookCopy['zh-CN']), wall: board.wall, book: board.book, mine: board.mine, locale }
}

function fill(text, values) {
  return String(text).replace(/\{(\w+)\}/g, (match, key) => (values[key] === undefined ? match : values[key]))
}

function formatBed(room, bed, locale) {
  const name = locale === 'zh-CN' ? room : (ROOM_PINYIN[room] || room)
  return [name, bed].filter(Boolean).join(' ')
}

// 后端署名：匿名固定返回“匿名旅客”，床位为“房间名+床位”（如“临潼A”），其余为昵称
function author(label, t) {
  if (!label || label === '匿名旅客') return t.anonymous
  if (t.locale === 'zh-CN') return label
  const room = Object.keys(ROOM_PINYIN).find((name) => new RegExp(`^${name}[A-F]?$`).test(label))
  return room ? formatBed(room, label.slice(room.length), t.locale) : label
}

module.exports = { ROOMS, PRIVATE_ROOMS, BEDS, copy, fill, formatBed, author }
