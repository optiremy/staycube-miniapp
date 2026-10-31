# stayCube 微信小程序

独立的原生微信小程序工程，AppID：`wx0275f19698c41972`。在微信开发者工具中打开本目录即可开发与预览。

当前小程序包含自助服务首页、自助入住登记、普通行李寄存和预抵问卷。自助入住支持八种语言、六位入住码查询、基础资料、逐项阅读入住须知、电子签名、中国旅客公安登记/其他语言旅客证件照片、押金二维码与付款凭证上传、登记提交及结果提示。普通行李寄存沿用 Web 端八种语言、取回时间与须知确认、行李照片上传及提交接口。预抵问卷支持八种语言、联系方式、预计到达时间、床位偏好和备注，提交至现有员工工作台；结果页提供早到/晚到提示、到达指引及公交/步行/驾车路线规划。员工审核、退款和入住信息发送仍由现有 Web 工作台处理。

显示语言为全局设置：首页右上角切换，选择保存在本机；未选择时按微信界面语言识别（`miniprogram/utils/app-locale.js`）。语言只决定显示文字：自助入住按旅客选择的证件类型（中国大陆身份证 / 护照或其他证件）决定公安登记或证件照片上传，手机号按区号校验（+86 为 11 位大陆手机号）。这依赖 `supabase-migrations/20261029_document_type_and_contact_by_choice.sql` 中的服务端修改。预览：`previews/global-language-preview.html`。

特殊取消申请（`pages/special-cancellation/index`，首页入口）沿用 Web 端旅客流程：六位申请码验证、订单号与联系方式、原因与证明材料（图片压缩为 JPEG / PDF，最多 5 项，经 `special-cancellation-storage` 签名上传）、四项声明与手写签名、申请进度及补充材料；页面文案与 Web 端一致仅提供中文。

页面预览：`previews/special-cancellation-annotation-preview.html`、`previews/luggage-storage-annotation-preview.html`、`previews/pre-arrival-annotation-preview.html`。临时首页为所有版本的启动页；各入口均可复制对应的小程序页面路径。

项目源码在 `miniprogram/`。接口使用 Supabase publishable key 调用现有 RPC 和 Storage；`miniprogram/config.js` 不得放入 service-role key 或其他服务端密钥。微信开发者工具保留 `urlCheck: true`，运行前需在小程序后台配置 Supabase 域名的 request/uploadFile 合法域名，以及 Netlify 生产域名的 request/uploadFile 合法域名，供旅客请求和上传备用通道使用。预抵问卷路线还需在 `miniprogram/config.js` 配置微信小程序平台的高德 Key，并将 `https://restapi.amap.com` 加入 request 合法域名。

本地流程辅助逻辑测试：`node miniprogram/tests/self-checkin-flow.test.js`。本地开发与模拟器编译不代表真实微信、支付、员工审核或入住链路验收；本项目没有上传或发布。

界面开发和修改遵循项目根目录 [AGENTS.md](AGENTS.md) 中的固定要求；手工编辑入口见 [快速修改小程序界面](UI_EDITING.md)。中文文案已单独放在 `miniprogram/data/locales/zh-CN.js`，其他语言同目录；页面外观在 `miniprogram/pages/` 下对应页面的 WXSS 文件。

特殊取消申请开发测试码：在微信开发者工具（开发版）输入申请码 `123456`，使用本地示例数据走完整流程，保存、上传、提交均不请求服务端；体验版和正式版中该码无效，按普通申请码交给服务端校验。本地测试：`node miniprogram/tests/special-cancellation-dev-code.test.js`。
