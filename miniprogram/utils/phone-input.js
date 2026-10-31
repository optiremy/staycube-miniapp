// 区号手机号：+86 校验大陆 11 位手机号，其他区号校验 6–15 位数字。
const { isMainlandMobilePhone } = require('./phone-validation')

const COUNTRY_CODES = ['+86', '+852', '+853', '+886', '+1', '+44', '+49', '+33', '+34', '+39', '+81', '+82', '+61', '+64', '+65', '+60', '+66', '+84', '+62', '+63', '+91', '+7', '+31', '+41', '+46', '+971']
const DEFAULT_COUNTRY_CODE = '+86'

function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '')
}

function isValidPhone(countryCode, number) {
  const digits = digitsOnly(number)
  if (countryCode === '+86') return isMainlandMobilePhone(digits)
  return COUNTRY_CODES.includes(countryCode) && /^\d{6,15}$/.test(digits)
}

// 大陆号码保持原来的 11 位纯数字，方便前台沿用；其他号码带区号。
function formatPhone(countryCode, number) {
  const digits = digitsOnly(number)
  return countryCode === '+86' ? digits : `${countryCode} ${digits}`
}

// 草稿或旧数据里的号码拆回区号和号码。
function parsePhone(value) {
  const text = String(value || '').trim()
  const match = text.match(/^(\+\d{1,4})\s*(.*)$/)
  if (match && COUNTRY_CODES.includes(match[1])) return { countryCode: match[1], number: digitsOnly(match[2]) }
  return { countryCode: DEFAULT_COUNTRY_CODE, number: digitsOnly(text) }
}

module.exports = { COUNTRY_CODES, DEFAULT_COUNTRY_CODE, digitsOnly, isValidPhone, formatPhone, parsePhone }
