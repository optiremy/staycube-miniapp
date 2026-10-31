const LOCALES = ['zh-CN', 'en-US', 'de-DE', 'fr-FR', 'es-ES', 'it-IT', 'ja-JP', 'ko-KR']
const { isValidPhone, formatPhone, parsePhone } = require('./phone-input')

// 未单独传 countryCode 时，从号码本身解析（无区号视为 +86）。
function phoneParts(input) {
  const parsed = parsePhone(input.contactValue)
  return input.countryCode ? { countryCode: input.countryCode, number: String(input.contactValue || '') } : parsed
}

function contactValueFor(input) {
  if (input.contactMethod !== 'phone') return String(input.contactValue || '').trim()
  const { countryCode, number } = phoneParts(input)
  return formatPhone(countryCode, number)
}

function arrivalNotice(time) {
  if (!/^\d{2}:\d{2}$/.test(time || '')) return null
  const [hour, minute] = time.split(':').map(Number)
  if (hour > 23 || minute > 59) return null
  const total = hour * 60 + minute
  if (total >= 360 && total < 600) return 'early'
  if (total >= 1350 || total < 360) return 'late'
  return null
}

function validatePreArrival(input) {
  if (!input || !LOCALES.includes(input.locale)) return '请选择有效语言。'
  if (!String(input.guestName || '').trim()) return '请填写预订姓名。'
  if (!/^(0\d|1\d|2[0-3]):[0-5]\d$/.test(input.arrivalTime || '')) return '请选择有效的预计到达时间。'
  const contact = String(input.contactValue || '').trim()
  if (input.contactMethod === 'email') {
    if (!/^\S+@\S+\.\S+$/.test(contact)) return '请输入有效邮箱。'
  } else if (input.contactMethod === 'phone') {
    const { countryCode, number } = phoneParts(input)
    if (!isValidPhone(countryCode, number)) return countryCode === '+86' ? '请输入有效的11位手机号。' : '请输入有效手机号。'
  } else {
    return '请选择联系方式。'
  }
  if (!['upper', 'lower', 'all'].includes(input.bedPreference)) return '请选择床位偏好。'
  if (String(input.guestNote || '').length > 2000) return '备注不能超过 2000 个字符。'
  return ''
}

module.exports = { arrivalNotice, validatePreArrival, contactValueFor }
