const storageKey = 'staycube:self-checkin-drafts:v1'
const draftTtlMs = 24 * 60 * 60 * 1000

function readDrafts() {
  try {
    const value = wx.getStorageSync(storageKey)
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  } catch {
    return {}
  }
}

function writeDrafts(drafts) {
  try {
    wx.setStorageSync(storageKey, drafts)
    return true
  } catch {
    return false
  }
}

function pathIsOwned(path, recordId) {
  const root = wx.env && wx.env.USER_DATA_PATH
  return Boolean(root && typeof path === 'string' && path.startsWith(`${root}/self-checkin-draft-${recordId}-`))
}

function unlinkOwnedPath(path, recordId) {
  if (!pathIsOwned(path, recordId)) return
  try {
    wx.getFileSystemManager().unlink({ filePath: path, fail() {} })
  } catch {}
}

function cleanDraftFiles(draft, recordId) {
  if (!draft || !draft.files) return
  Object.values(draft.files).forEach((path) => unlinkOwnedPath(path, recordId))
}

function purgeExpired(now = Date.now()) {
  const drafts = readDrafts()
  let changed = false
  Object.keys(drafts).forEach((recordId) => {
    const draft = drafts[recordId]
    if (!draft || !draft.updatedAt || now - draft.updatedAt > draftTtlMs) {
      cleanDraftFiles(draft, recordId)
      delete drafts[recordId]
      changed = true
    }
  })
  if (changed) writeDrafts(drafts)
  return drafts
}

function listDrafts() {
  const drafts = purgeExpired()
  return Object.keys(drafts)
    .map((recordId) => {
      const draft = drafts[recordId]
      const form = draft.state && draft.state.form || {}
      return {
        recordId,
        locale: draft.locale,
        accessCode: /^\d{6}$/.test(String(draft.accessCode || '')) ? String(draft.accessCode) : '',
        guestName: String(form.guest_name || '').trim() || '未填写姓名',
        checkinDate: draft.checkinDate || '',
        step: Math.max(0, Math.min(4, Number(draft.step) || 0)),
        updatedAt: draft.updatedAt,
      }
    })
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

function getDraft(recordId) {
  if (!recordId) return null
  const drafts = purgeExpired()
  return drafts[recordId] || null
}

function saveDraft(recordId, draft) {
  if (!recordId || !draft || typeof draft !== 'object') return false
  const drafts = purgeExpired()
  drafts[recordId] = { ...draft, updatedAt: Date.now() }
  return writeDrafts(drafts)
}

function removeDraft(recordId) {
  if (!recordId) return
  const drafts = readDrafts()
  cleanDraftFiles(drafts[recordId], recordId)
  delete drafts[recordId]
  writeDrafts(drafts)
}

function removeDraftFile(path, recordId) {
  unlinkOwnedPath(path, recordId)
}

function copyFileToDraft(tempFilePath, recordId, kind) {
  return new Promise((resolve, reject) => {
    const root = wx.env && wx.env.USER_DATA_PATH
    if (!root || !recordId || !kind) return reject(new Error('draft-file-unavailable'))
    const timestamp = Date.now()
    const extension = kind === 'signature' ? 'png' : 'jpg'
    const destPath = `${root}/self-checkin-draft-${recordId}-${kind}-${timestamp}.${extension}`
    wx.getFileSystemManager().copyFile({
      srcPath: tempFilePath,
      destPath,
      success: () => resolve(destPath),
      fail: reject,
    })
  })
}

function fileExists(path) {
  return new Promise((resolve) => {
    if (!path) return resolve(false)
    try {
      wx.getFileSystemManager().access({ path, success: () => resolve(true), fail: () => resolve(false) })
    } catch {
      resolve(false)
    }
  })
}

module.exports = {
  draftTtlMs,
  listDrafts,
  getDraft,
  saveDraft,
  removeDraft,
  removeDraftFile,
  copyFileToDraft,
  fileExists,
}
