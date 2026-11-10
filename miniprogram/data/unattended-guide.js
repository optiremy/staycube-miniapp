// 早到寄存完成页的门店内容。中文 zh、英文 en；其他语言显示英文。列表为空时对应卡片不显示。
// 地图：填写 latitude/longitude（GCJ-02）与 address 后，“打开地图”调起微信内置地图。
// areaMap：开门密码页“可进入区域”示意图，放入 /assets 后填写路径，例如 '/assets/arrival-area-map.png'。
module.exports = {
  areaMap: '',
  breakfast: [
    // { name: { zh: '', en: '' }, specialty: { zh: '', en: '' }, walkMinutes: 5, hours: '06:30–11:00', latitude: 0, longitude: 0, address: '' },
  ],
  places: [
    // { name: { zh: '', en: '' }, kind: { zh: '', en: '' }, walkMinutes: 5, hours: '24 小时', amenities: [{ zh: '可坐', en: 'Seating' }], latitude: 0, longitude: 0, address: '' },
  ],
}
