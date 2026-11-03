# 旅客体验问题修改计划（剩余部分）

本计划交给 Codex 执行。高影响问题（审查报告第 1–8 条）已在本地修改，尚未提交；请在当前工作区基础上继续，不要回退这些改动。

## 执行前必读

- 先读仓库根目录的 `AGENTS.md` 和 `UI_EDITING.md`，遵守其中的固定要求：
  - 改小程序页面时，同步更新 `previews/` 中对应的本地预览。
  - 未经确认，不改文案含义、业务流程、字段、校验或提交顺序。
  - 尺寸用 `rpx`；新增样式值先对照已确认页面。
- 项目统一称谓用「旅客」，不用「住客」。文案平实克制，不要文艺抒情。
- 小程序支持 8 种语言：`zh-CN`、`en-US`、`de-DE`、`fr-FR`、`es-ES`、`it-IT`、`ja-JP`、`ko-KR`。新增给旅客看的文字，8 种语言都要补齐；除特殊取消页外，不允许在页面里写死中文。
- 已经删除的内容不要加回来：
  - 押金页「系统确认到账后无需上传付款截图」（`paymentCopy.note`）
  - 证件类型页说明（`documentType.intro`）
  - 语言面板说明（`language.hint`）
  - 特殊取消进度页的员工待办（`nextActions`）
- 测试运行方式：在 `miniprogram/` 下逐个执行 `node tests/<name>.test.js`，全部通过才算完成。
- 改完后在每条下面写一句实际改了什么；做不了或需要确认的，写明原因，不要擅自决定。

## 已完成（供参考，不要重复做）

| # | 问题 | 当前状态 |
|---|---|---|
| 1 | 入住须知页无法回到上一步 | 第一条须知时，「上一条」按钮变成「上一步」，可返回基础信息 |
| 2 | 入住码失效/无效时的按钮会用原码重复查询 | 改为回到输入入住码页面 |
| 3 | 微信押金缺少查询按钮，取消支付时提示有误 | 待确认时显示「查询支付状态」按钮；取消支付提示「已取消支付」；状态未确认时提示「尚未确认」，不再提示「请先支付」 |
| 4 | 首页草稿弹窗每次回首页都弹 | 只在首次打开首页和小程序回到前台时自动弹出 |
| 5 | 特殊取消提交按钮不可点但没有原因 | 第 2、3 步显示还缺哪些内容 |
| 6 | 特殊取消上传后改材料用途不生效 | 用途修改会更新已上传材料，并随草稿保存 |
| 7 | 特殊取消「重新选择」后旧材料仍留在服务端 | 替换后的附件列表随草稿保存。**需要后端确认**：`save_special_cancellation_guest` 的 `p_patch.attachments` 是否会删除列表里没有的附件、是否更新 `proof_purposes`。如果不支持，在本文件末尾记下来，不要在前端另行实现删除 |
| 8 | 上传超时后重试可能因文件重名一直失败 | 自助入住和行李寄存上传失败后，下次重试换新的存储路径 |

## 待修改

### 9. 自助入住流程里写死的中文（中）

文件：`miniprogram/pages/index/index.js`，文案放 `miniprogram/data/locales/<locale>.js` 的 `text` 中。下面这些写死的中文，都要改成从当前语言的文案里取：

- `loadContext`：「入住码与所选登记草稿不匹配，请核对后重试。」
- `loadContext`：「未找到这份草稿，请重新填写」（toast）
- `offerDraftResume` 里 `wx.showModal` 的整套文字：
  - 标题「发现未完成的登记」
  - 内容「检测到 X 的登记草稿（入住码 Y）。是否继续上次填写？」
  - 按钮「继续登记」「重新开始」
  - 姓名为空时的兜底「这位旅客」
- `restoreDraft`：「入住须知已更新，请重新阅读并签名」（toast）
- `persistDraftSnapshot`：「本机存储不足，登记草稿无法保存」（toast）
- `submitCheckin` 里内联的 `limitedCopy` 对象：移到 locale 文件。

其他页面：

- `miniprogram/utils/self-checkin-drafts.js` 的 `listDrafts`：姓名为空时兜底「未填写姓名」。改为返回空字符串，由 `pages/home/index.js` 按当前语言显示兜底文字，加在 `global-copy.js` 的 `draft` 下。
- `miniprogram/pages/luggage-storage/index.wxml`：照片「删除」按钮写死中文，改用文案。
- `miniprogram/pages/luggage-storage/index.js` 的 `loadPublicContext`：兜底提示「行李寄存信息暂时无法读取……」改用 `errorCopy`，比如 `errorCopy.service`。

注意：

- 微信 toast 文字过长会被截断。超过约 14 个汉字的提示，改用页面内的 `errorText` 或 `showModal`，不要用 toast。
- 中文原文的意思不变。

执行记录：已将相关硬编码文案接入八语言文案，长提示改为页内错误。

### 10. 特殊取消申请页只有中文（中，工作量大）

文件：

- `miniprogram/pages/special-cancellation/index.{js,wxml}`
- `miniprogram/data/special-cancellation-copy.js`
- `miniprogram/utils/special-cancellation-api.js`

要做的事：

- 页头加入 `language-switcher` 组件，写法参考 `pages/luggage-storage/index.wxml`。
- 页面上所有可见文字改为按语言取值：wxml 静态文字、js 里的错误提示、`api` 里 `errorMessages` 和各处兜底提示。
- 设置导航栏标题，参考 luggage 页 `applyLocale`。

**关键约束**：

- `reasonCategories`、`reasonSubcategories`、`transportModes` 的中文值会作为数据提交给后端，代码里也有直接比较，比如 `'不可抗力'`、`'航班列车异常'`、`'突发疾病 / 住院'`。
- 只能翻译显示用的标签，提交的值保持中文不变。
- 建议拆成两套结构：一套是不变的 value，一套是按语言的 label。

另外：

- `actorLabels` 里的「前台staff」、页面里的「前台 staff」，中文版统一改为「前台」。这是用户已认可的方向。
- 声明文字（`declarations`）有法律含义。翻译版只用于显示；提交给后端的仍是 key（`d0`…`d3`），不要改提交结构。
- 同步更新 `previews/special-cancellation-annotation-preview.html`，至少保证中文版一致。

执行记录：未完成：特殊取消页仍需完整八语言翻译。

### 11. 旅客姓名不可修改且没有说明（中，部分待确认）

文件：`miniprogram/pages/index/index.wxml` 第 0 步姓名输入框。

- **可以直接做**：在禁用的姓名输入框下方显示 `text.nameCorrectionHint`，各语言文案里已有这个字段，先确认 8 种语言是否齐全，缺的补上。
- **待产品确认，先不做**：后台没带出姓名（`context.guest_name` 为空）时，旅客会卡在基础信息那一步。是允许旅客自己填写，还是提示联系前台？在本文件末尾列为待确认项。

执行记录：已显示八语言姓名更正提示；缺失姓名仍待确认。

### 12. 行李寄存可以选已经过去的取回时间（中）

文件：`miniprogram/pages/luggage-storage/index.js`

- 当天已经过去的取回时间不能选：
  - 当前时间用上海时间，可参考 `shanghaiToday` 的写法。
  - `nextFormStep` 和 `validate` 都要校验：如果 `claim_date` 是今天，`claim_time` 必须晚于当前时间。
- 新增错误文案，比如中文「取回时间不能早于当前时间。」，8 种语言都要补，加在 `data/luggage-storage-copy.js`。
- 默认取回时间：如果 `claim_date` 是今天且 10:00 已过，默认值改为当前时间之后最近的一个 15 分钟档。如果已经晚于 22:30，日期默认取明天。`claimTimeIndex` 要同步更新。
- 同步更新 `previews/luggage-storage-annotation-preview.html` 的错误提示页。

执行记录：已按上海时间校验并调整默认取回时间，更新预览。

### 13. 预抵问卷没有到达日期（待确认，先不做）

后端接口 `submit_pre_arrival_v2` 目前没有日期参数，要加日期需要同时改后端。**不要实现**，在本文件末尾列为待确认项。

执行记录：按计划未实现，待确认。

### 14. 行李寄存把服务端原始报错显示给旅客（中）

文件：`miniprogram/pages/luggage-storage/index.js` 的 `messageFor`。

- 删掉 `if (error instanceof Error && error.message && !error.message.includes('timeout')) return error.message` 这条兜底。
- 例外：`submit` 里主动抛出的 `new Error(this.data.text.dateError)` 是给旅客看的文案，要保留它的显示效果。做法是把它改成可识别的类型，比如带 `kind: 'date'` 的错误，然后单独处理。
- 其余未识别的错误一律显示 `fallback`。

执行记录：已禁止透出未识别的服务端原始错误。

### 15. 特殊取消第 3 步离开时声明和签名会丢失（中）

文件：`miniprogram/pages/special-cancellation/index.js`

- 在 `onHide` 和 `onUnload` 中调用 `saveDraft()`，静默失败，不打断旅客。
- 签名在 `signatureEnd` 后已经写进 `_pending`，不需要单独处理。
- 不要每笔都请求一次接口。

执行记录：离开页面时静默保存草稿。

### 16. 自助入住选照片时加载提示文字不对（低）

文件：`miniprogram/pages/index/index.js` 的 `choosePhoto`。

- `wx.showLoading` 现在用的是 `text.loadingContext`（「正在读取自助入住登记…」）。
- 改为新的文案，比如中文「正在处理照片…」，8 种语言都要补。

执行记录：已改用八语言照片处理提示。

### 17. 签名上传后再补笔画，仍提交旧签名（低）

文件：`miniprogram/pages/index/index.js`

- 在 `signatureStart` 中，如果 `this._uploaded.signaturePath` 有值，就清空它，并把 `this._uploadIds.signature` 换成 `Date.now()`。这样修改过的签名会重新上传。
- 同样，`toggleRulesFinal` 也要清空 `_uploaded.signaturePath`。
- 改完补一条单测，可放在 `tests/self-checkin-photo-upload.test.js` 或新文件。

执行记录：已清除旧签名上传路径并补充单测。

### 18. 首页只显示最近一份草稿（低）

文件：`miniprogram/pages/home/index.{js,wxml}`

- 有多份草稿时，在弹窗里列出所有草稿，每份带「继续」「删除」，最多显示 3 份，按更新时间倒序。只有一份时保持现在的样子。
- 同步更新 `previews/home-draft-resume-preview.html`。
- 更新 `tests/home-draft-resume.test.js`。

执行记录：弹窗展示最近三份草稿并更新预览。

### 19. `app.json` 声明了用不到的位置权限（低）

文件：`miniprogram/app.json`

- 代码里只用了 `wx.openLocation`，不需要授权。删除 `requiredPrivateInfos` 里的 `getLocation` 和 `permission.scope.userLocation`。
- 先全局搜索 `getLocation` 和 `chooseLocation`，确认没有用到再删。
- 另外：`data/pre-arrival-copy.js` 里有 `locate`、`locating`、`routeReady`、`locationDenied` 等定位路线文案，和 `mapPrompt` 的重复定义，页面都没有用到。确认未使用后可一并清理。

执行记录：已移除无用位置权限声明与定位文案。

## 完成后

1. 在 `miniprogram/` 下跑全部测试并贴出结果。
2. 列出改动过的文件，以及同步更新过的预览文件。
3. 说明哪些需要在微信开发者工具里重新编译核对，至少包括：自助入住各步骤、首页草稿弹窗、行李寄存、特殊取消三步和进度页，并覆盖 `320/375/430px` 宽度。
4. 不要提交，由用户确认后再提交。

## 待确认事项（执行中遇到的问题写在这里）

- 第 6、7 条：已确认后端原来不支持，且会把已上传材料重复存一份。已在 stayCube 仓库新增迁移 `20261102120000_special_cancellation_guest_attachment_sync.sql`（supabase 与 cloudbase 各一份）：保存时更新材料用途和说明、删除被替换的材料、清理已有重复；小程序提交时不再重复发送材料列表。迁移尚未部署。
- 第 11 条：已确认，提示旅客联系前台，不让旅客自己填写。已实现：缺姓名时姓名下方提示联系前台，点下一步时提示同样内容，不能继续。
- 第 13 条：已确认不添加到达日期。
