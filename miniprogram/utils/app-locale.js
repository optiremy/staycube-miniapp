// 全局显示语言：手动选择保存在本机；未选择时按微信界面语言识别。
// 语言只决定显示文字，不决定证件或联系方式校验。
const SUPPORTED = ['zh-CN', 'en-US', 'de-DE', 'fr-FR', 'es-ES', 'it-IT', 'ja-JP', 'ko-KR']
const STORAGE_KEY = 'staycube.locale'
const FALLBACK = 'en-US'

function defaultApi() {
  return typeof wx === 'undefined' ? {} : wx
}

function fromWechatLanguage(language) {
  const value = String(language || '').toLowerCase().replace('-', '_')
  // 读不到微信语言时按中文显示；读到但不支持的语言用英文。
  if (!value || value.startsWith('zh')) return 'zh-CN'
  const prefix = value.split('_')[0]
  return SUPPORTED.find((locale) => locale.slice(0, 2).toLowerCase() === prefix) || FALLBACK
}

function wechatLanguage(api) {
  try {
    if (typeof api.getAppBaseInfo === 'function') return api.getAppBaseInfo().language
    return api.getSystemInfoSync().language
  } catch {
    return ''
  }
}

function getLocale(api = defaultApi()) {
  try {
    const saved = api.getStorageSync(STORAGE_KEY)
    if (SUPPORTED.includes(saved)) return saved
  } catch {}
  return fromWechatLanguage(wechatLanguage(api))
}

function setLocale(locale, api = defaultApi()) {
  if (!SUPPORTED.includes(locale)) return false
  try {
    api.setStorageSync(STORAGE_KEY, locale)
  } catch {}
  return true
}

function hasSavedLocale(api = defaultApi()) {
  try {
    return SUPPORTED.includes(api.getStorageSync(STORAGE_KEY))
  } catch {
    return false
  }
}

module.exports = { SUPPORTED, STORAGE_KEY, fromWechatLanguage, getLocale, setLocale, hasSavedLocale }
