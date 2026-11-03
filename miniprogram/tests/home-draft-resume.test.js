const assert = require('node:assert/strict')
const selfCheckinDrafts = require('../utils/self-checkin-drafts')

function loadHomePage() {
  let definition
  global.Page = (value) => { definition = value }
  const modulePath = require.resolve('../pages/home/index')
  delete require.cache[modulePath]
  require(modulePath)
  return { ...definition, data: { ...definition.data } }
}

function loadApp() {
  let definition
  global.App = (value) => { definition = value }
  const modulePath = require.resolve('../app')
  delete require.cache[modulePath]
  require(modulePath)
  return definition
}

function loadSelfCheckinPage() {
  let definition
  global.Page = (value) => { definition = value }
  const modulePath = require.resolve('../pages/index/index')
  delete require.cache[modulePath]
  require(modulePath)
  return { ...definition, data: { ...definition.data } }
}

function attachSetData(page) {
  page.setData = function setData(changes, callback) {
    this.data = { ...this.data, ...changes }
    if (callback) callback()
  }
}

async function run() {
  const originalListDrafts = selfCheckinDrafts.listDrafts
  const originalGetCurrentPages = global.getCurrentPages
  const originalGetApp = global.getApp
  const originalApp = global.App
  const originalPage = global.Page
  const originalGetDraft = selfCheckinDrafts.getDraft
  const originalWx = global.wx
  selfCheckinDrafts.listDrafts = () => [{
    recordId: 'old-draft',
    locale: 'zh-CN',
    accessCode: '',
    guestName: '旧草稿',
    checkinDate: '2026-10-23',
    step: 4,
    updatedAt: Date.now(),
  }, {
    recordId: 'draft-1',
    locale: 'zh-CN',
    accessCode: '123456',
    guestName: '张女士',
    checkinDate: '2026-10-23',
    step: 4,
    updatedAt: Date.now(),
  }]
  selfCheckinDrafts.getDraft = (recordId) => recordId === 'draft-1'
    ? { locale: 'zh-CN', accessCode: '123456' }
    : null
  global.getApp = () => ({ globalData: { foregroundRevision: 1 } })
  let navigationUrl = ''
  global.wx = { navigateTo: ({ url }) => { navigationUrl = url } }

  try {
    const homePage = loadHomePage()
    attachSetData(homePage)
    homePage.onShow()
    assert.equal(homePage.data.draftModalVisible, true, 'home page display shows an existing draft')
    assert.equal(homePage.data.drafts.length, 1, 'home page hides drafts without a saved full access code')
    assert.equal(homePage.data.activeDraft.recordId, 'draft-1', 'home page offers the resumable draft')

    homePage.resumeDraft({ currentTarget: { dataset: { id: 'draft-1' } } })
    assert.match(navigationUrl, /draft=draft-1/, 'resume navigation identifies the draft')
    assert.doesNotMatch(navigationUrl, /123456/, 'resume navigation keeps the access code out of the URL')

    const registrationPage = loadSelfCheckinPage()
    attachSetData(registrationPage)
    let automaticallyLoadedCode = ''
    registrationPage.loadContext = async (code) => { automaticallyLoadedCode = code }
    registrationPage.onLoad({ draft: 'draft-1', locale: 'zh-CN' })
    assert.equal(automaticallyLoadedCode, '123456', 'registration page loads the saved access code automatically')
    assert.equal(registrationPage.data.screen, 'loading', 'registration page starts verification instead of asking for a code')

    homePage.closeDraftModal()
    assert.equal(homePage.data.draftModalVisible, false, 'dismissal closes the current prompt')
    homePage.onShow()
    assert.equal(homePage.data.draftModalVisible, false, 'returning from another page keeps the dismissed prompt closed')

    let refreshes = 0
    homePage.route = 'pages/home/index'
    homePage.refreshDraftModal = () => { refreshes += 1 }
    global.getCurrentPages = () => [homePage]
    const app = loadApp()
    app.onShow()
    assert.equal(refreshes, 1, 'returning to foreground refreshes the visible home page again')
  } finally {
    selfCheckinDrafts.listDrafts = originalListDrafts
    selfCheckinDrafts.getDraft = originalGetDraft
    global.getCurrentPages = originalGetCurrentPages
    global.getApp = originalGetApp
    global.App = originalApp
    global.Page = originalPage
    global.wx = originalWx
  }

  console.log('home draft resume assertions passed')
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
