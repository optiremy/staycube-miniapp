const assert = require('node:assert/strict')
const appLocale = require('../utils/app-locale')
const { isValidPhone, formatPhone, parsePhone } = require('../utils/phone-input')
const globalCopy = require('../data/global-copy')

// 微信语言识别
assert.equal(appLocale.fromWechatLanguage('zh_CN'), 'zh-CN')
assert.equal(appLocale.fromWechatLanguage('zh_TW'), 'zh-CN')
assert.equal(appLocale.fromWechatLanguage('zh_HK'), 'zh-CN')
assert.equal(appLocale.fromWechatLanguage('en'), 'en-US')
assert.equal(appLocale.fromWechatLanguage('ja'), 'ja-JP')
assert.equal(appLocale.fromWechatLanguage('ko'), 'ko-KR')
assert.equal(appLocale.fromWechatLanguage('pt'), 'en-US')
assert.equal(appLocale.fromWechatLanguage(''), 'zh-CN')

// 手动选择优先于微信语言，并保存在本机
const store = {}
const api = { getStorageSync: (k) => store[k], setStorageSync: (k, v) => { store[k] = v }, getAppBaseInfo: () => ({ language: 'en' }) }
assert.equal(appLocale.getLocale(api), 'en-US')
assert.equal(appLocale.hasSavedLocale(api), false)
assert.equal(appLocale.setLocale('fr-FR', api), true)
assert.equal(appLocale.getLocale(api), 'fr-FR')
assert.equal(appLocale.setLocale('xx-XX', api), false)
assert.equal(appLocale.getLocale(api), 'fr-FR')

// 区号手机号
assert.equal(isValidPhone('+86', '13800138000'), true)
assert.equal(isValidPhone('+86', '7700900123'), false)
assert.equal(isValidPhone('+44', '7700900123'), true)
assert.equal(isValidPhone('+44', '12345'), false)
assert.equal(formatPhone('+86', '138 0013 8000'), '13800138000')
assert.equal(formatPhone('+1', '2025550100'), '+1 2025550100')
assert.deepEqual(parsePhone('+1 2025550100'), { countryCode: '+1', number: '2025550100' })
assert.deepEqual(parsePhone('13800138000'), { countryCode: '+86', number: '13800138000' })

// 8 种语言文案字段齐全
const shape = (obj) => Object.keys(obj).sort().map((k) => (typeof obj[k] === 'object' ? `${k}{${shape(obj[k])}}` : k)).join(',')
for (const locale of appLocale.SUPPORTED) assert.equal(shape(globalCopy[locale]), shape(globalCopy['zh-CN']), `${locale} copy keys differ`)

console.log('global locale tests passed')
