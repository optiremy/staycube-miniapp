const assert = require('node:assert/strict')
const { isMainlandMobilePhone } = require('../utils/phone-validation')

for (const value of ['13000000000', '13912345678', '19912345678']) assert.equal(isMainlandMobilePhone(value), true)
for (const value of ['12345678901', '1380013800', '138001380000', '13800a38000', '+8613800138000', '']) assert.equal(isMainlandMobilePhone(value), false)
console.log('phone validation tests passed')
