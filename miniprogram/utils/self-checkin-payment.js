const { requestGuest } = require('./guest-transport')

async function callPayment(route, token, extra = {}) {
  try {
    return await requestGuest(`/functions/v1/self-checkin-payment/${route}`, { token, ...extra }, 15000)
  } catch (error) {
    throw new Error(error && error.data && error.data.code || 'PAYMENT_SERVICE_ERROR')
  }
}

function loginCode() {
  return new Promise((resolve, reject) => wx.login({
    success(result) { result.code ? resolve(result.code) : reject(new Error('LOGIN_FAILED')) },
    fail: reject,
  }))
}

function requestPayment(params) {
  return new Promise((resolve, reject) => wx.requestPayment({
    timeStamp: params.timeStamp, nonceStr: params.nonceStr,
    package: params.package, signType: params.signType, paySign: params.paySign,
    success: resolve, fail: reject,
  }))
}

module.exports = { callPayment, loginCode, requestPayment }
