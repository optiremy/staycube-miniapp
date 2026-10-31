function isMainlandMobilePhone(value) {
  return /^1[3-9]\d{9}$/.test(String(value || '').trim())
}

module.exports = { isMainlandMobilePhone }
