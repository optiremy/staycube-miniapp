const theme = require('../../utils/guestbook-theme')
const session = require('../../utils/guestbook-session')
const api = require('../api')
const i18n = require('../../utils/guestbook-i18n')

// 磁贴尺寸（rpx）：边长、间距；画布按留言数量排成接近方形的网格，可上下左右拖动
const TILE = 300
const GAP = 24

function themed(page) {
  const slot = theme.slotOf()
  theme.applyNavigationBar(slot)
  page.setData({ slot, pageStyle: theme.pageStyle(slot) })
  return slot
}

Page({
  data: { view: 'wall', staying: false, canPublish: false, tiles: [], entries: [], canvas: { width: 0, height: 0, x: 0, y: 0 }, pannable: false, loaded: false },

  onLoad(options) {
    if (options.view === 'book') this.setData({ view: 'book' })
  },

  onShow() {
    const current = session.read()
    themed(this)
    this.setData({ t: i18n.copy() })
    const staying = current.state === 'staying'
    this._guest = current.state === 'guest'
    this.setData({ staying, canPublish: current.state !== 'left', view: staying ? this.data.view : 'wall' })
    this.load()
  },

  load() {
    wx.setNavigationBarTitle({ title: this.data.view === 'book' ? this.data.t.book : this.data.t.wall })
    return this.data.view === 'book' ? this.loadBook() : this.loadWall()
  },

  async loadWall() {
    try {
      const list = await api.listNotes('latest')
      const urls = await api.photoUrls(list.map((note) => note.photoPath))
      const max = Math.max(1, ...list.map((note) => note.total))
      const tiles = list.map((note) => ({
        id: note.id,
        content: note.content,
        photoUrl: urls[note.photoPath] || '',
        style: theme.noteStyle(this.data.slot, note.color, theme.luminance(note.total, max)),
      }))
      this.layout(tiles)
    } catch (error) { this.handleError(error) }
  },

  // 画布居中；比屏幕小时不拖动
  layout(tiles) {
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    const px = info.windowWidth / 750
    const cols = Math.max(2, Math.min(7, Math.ceil(Math.sqrt(tiles.length * 1.4))))
    const rows = Math.max(1, Math.ceil(tiles.length / cols))
    const width = (cols * (TILE + GAP) + GAP) * px
    const height = (rows * (TILE + GAP) + GAP) * px + 220 * px
    const pannable = width > info.windowWidth || height > info.windowHeight
    this.setData({
      tiles, loaded: true, cols, pannable,
      canvas: { width, height, x: Math.min(0, (info.windowWidth - width) / 2), y: 0 },
      area: { width: info.windowWidth, height: info.windowHeight },
    })
  },

  async loadBook() {
    try {
      const book = await api.getBook()
      const urls = await api.photoUrls([].concat(...book.entries.map((entry) => entry.photoPaths || [])))
      this.setData({ loaded: true, entries: book.entries.map((entry) => ({ ...entry, author: i18n.author(entry.author, this.data.t), hue: theme.hue(this.data.slot, entry.color), photoList: (entry.photoPaths || []).map((path) => urls[path]).filter(Boolean) })) })
    } catch (error) { this.handleError(error) }
  },

  handleError(error) {
    if (error.code === 'LOGIN_REQUIRED' || error.code === 'NOT_A_GUEST') { session.clear(); wx.reLaunch({ url: '/pages/home/index' }); return }
    wx.showToast({ title: this.data.t.loadFailed, icon: 'none' })
  },

  openEntry(event) {
    api.openedEntry = this.data.entries[event.currentTarget.dataset.index]
    wx.navigateTo({ url: '/guestbook/entry-detail/index' })
  },

  openNote(event) { wx.navigateTo({ url: `/guestbook/detail/index?id=${event.currentTarget.dataset.id}` }) },
  previewPhoto(event) { wx.previewImage({ current: event.currentTarget.dataset.src, urls: event.currentTarget.dataset.list }) },

  // 留言墙直接写留言；床位留言簿进入写作页，当天写过会自动接着写
  publish() {
    if (this._guest) { wx.navigateTo({ url: '/guestbook/login/index?next=compose' }); return }
    wx.navigateTo({ url: this.data.view === 'book' ? '/guestbook/compose/index?mode=book' : '/guestbook/compose/index' })
  },
})
