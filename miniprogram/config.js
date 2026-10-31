// 后端开关：'supabase'（默认，现状）或 'cloudbase'（腾讯云，迁移切换用；规则见 utils/backend.js）。
// 这里只放前端公开配置；不得放 service-role key、API Key 或其他服务端密钥。
module.exports = {
  policeQrValue: "alipays://platformapi/startApp?appId=2021004190634181",
  depositQrValue: "https://dd6.cn/EWjeG",
  supabaseUrl: "https://vosippqokksetfdeljag.supabase.co",
  publishableKey: "sb_publishable_HgaP4nIBj-nwmmcgXxaK9w_lG5t3qk-",
  publicLookupFallbackUrl: "https://sifang-guest-platform.netlify.app/.netlify/functions/self-checkin-public-lookup",
  developmentSelfCheckinTestCode: "123456",
  nativePaymentEnabled: true,
  backend: 'supabase',
  // backend 为 'cloudbase' 时使用：腾讯云环境 ID 与公开钥匙（publishable key）。
  cloudbaseEnvId: '',
  cloudbasePublishableKey: '',
}
