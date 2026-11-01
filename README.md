# stayCube 微信小程序

独立的原生微信小程序工程，AppID：`wx0275f19698c41972`。在微信开发者工具中打开本目录即可开发与预览。

当前小程序包含自助服务首页、自助入住登记、普通行李寄存和预抵问卷。自助入住支持八种语言、六位入住码查询、基础资料、逐项阅读入住须知、电子签名、中国旅客公安登记/其他语言旅客证件照片、押金二维码与付款凭证上传、登记提交及结果提示。普通行李寄存沿用 Web 端八种语言、取回时间与须知确认、行李照片上传及提交接口。预抵问卷支持八种语言、联系方式、预计到达时间、床位偏好和备注，提交至现有员工工作台；结果页提供早到/晚到提示、到达指引及公交/步行/驾车路线规划。员工审核、退款和入住信息发送仍由现有 Web 工作台处理。

显示语言为全局设置：首页右上角切换，选择保存在本机；未选择时按微信界面语言识别（`miniprogram/utils/app-locale.js`）。语言只决定显示文字：自助入住按旅客选择的证件类型（中国大陆身份证 / 护照或其他证件）决定公安登记或证件照片上传，手机号按区号校验（+86 为 11 位大陆手机号）。这依赖 `supabase-migrations/20261029_document_type_and_contact_by_choice.sql` 中的服务端修改。预览：`previews/global-language-preview.html`。

特殊取消申请（`pages/special-cancellation/index`，首页入口）沿用 Web 端旅客流程：六位申请码验证、订单号与联系方式、原因与证明材料（图片压缩为 JPEG / PDF，最多 5 项，经 `special-cancellation-storage` 签名上传）、四项声明与手写签名、申请进度及补充材料；页面文案与 Web 端一致仅提供中文。

页面预览：`previews/special-cancellation-annotation-preview.html`、`previews/luggage-storage-annotation-preview.html`、`previews/pre-arrival-annotation-preview.html`。临时首页为所有版本的启动页；各入口均可复制对应的小程序页面路径。

项目源码在 `miniprogram/`。默认后端为腾讯云正式环境 `staycube-prod-d0g2d759v95954cd6`，网关为 `https://staycube-prod-d0g2d759v95954cd6.api.tcloudbasegateway.com`。当前 `miniprogram/config.js` 中腾讯云公开钥匙尚未配置，数据请求会明确失败，不会回退写入 Supabase。现有 Netlify `guest-relay` 仍转发到 Supabase，因此腾讯云模式下已禁用该回退和云函数中转；自助入住付款及特殊取消证明材料上传需待腾讯云中转迁移后才能使用。旧 Supabase URL 和 publishable key 仅供显式切回旧模式，不参与腾讯云模式请求。`miniprogram/config.js` 不得放入服务端密钥。微信开发者工具保留 `urlCheck: true`；在小程序后台将腾讯云网关加入 request/uploadFile 合法域名。预抵问卷路线还需配置微信小程序平台的高德 Key，并将 `https://restapi.amap.com` 加入 request 合法域名。修改合法域名后，清除开发者工具缓存并重新编译。

本地流程辅助逻辑测试：`node miniprogram/tests/self-checkin-flow.test.js`。本地开发与模拟器编译不代表真实微信、支付、员工审核或入住链路验收；本项目没有上传或发布。

界面开发和修改遵循项目根目录 [AGENTS.md](AGENTS.md) 中的固定要求；手工编辑入口见 [快速修改小程序界面](UI_EDITING.md)。中文文案已单独放在 `miniprogram/data/locales/zh-CN.js`，其他语言同目录；页面外观在 `miniprogram/pages/` 下对应页面的 WXSS 文件。

特殊取消申请开发测试码：在微信开发者工具（开发版）输入申请码 `123456`，使用本地示例数据走完整流程，保存、上传、提交均不请求服务端；体验版和正式版中该码无效，按普通申请码交给服务端校验。本地测试：`node miniprogram/tests/special-cancellation-dev-code.test.js`。
