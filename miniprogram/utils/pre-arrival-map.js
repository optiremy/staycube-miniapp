// Ctrip's location record uses BD-09; wx.openLocation requires GCJ-02.
const HOSTEL_BD09 = { latitude: 34.239781, longitude: 108.953978 }

function bd09ToGcj02({ latitude, longitude }) {
  const x = longitude - 0.0065
  const y = latitude - 0.006
  const z = Math.sqrt(x * x + y * y) - 0.00002 * Math.sin(y * Math.PI * 3000 / 180)
  const theta = Math.atan2(y, x) - 0.000003 * Math.cos(x * Math.PI * 3000 / 180)
  return { latitude: z * Math.sin(theta), longitude: z * Math.cos(theta) }
}

const HOSTEL = {
  ...bd09ToGcj02(HOSTEL_BD09),
  name: '肆方空间青年旅舍',
  address: '西安市碑林区长安北路21号长安大厦A座',
}

function openHostelLocation(wxApi) {
  return new Promise((resolve, reject) => {
    wxApi.openLocation({ ...HOSTEL, scale: 18, success: resolve, fail: reject })
  })
}

module.exports = { HOSTEL, bd09ToGcj02, openHostelLocation }
