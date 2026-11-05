# 旅客留言板 · 后端方案

日期：2026-11-03　状态：待确认（未建表、未部署、未改生产数据）

前端已完成：`miniprogram/guestbook/`（分包）与首页入口。页面只通过 `miniprogram/guestbook/api.js` 取数，目前返回本地示例数据；本方案落地后只替换这一个文件。

---

## 1. 已确认的产品规则（实现依据）

| 规则 | 内容 |
|---|---|
| 状态 | 只有「在住」「已离店」两种；从未入住过的人按未入住处理 |
| 留言板 | 在住：查看、发布、回应；已离店：只读，可看自己的留言与收到的回应；未入住：只能看被分享的那一条 |
| 回应 | 同感、有用、谢谢、想去、有趣、加油；每人每条每种一次，可取消 |
| 床位留言本 | 每个床位一本（3A/3B 分开，单间按房间）；只对当前住在该床位的旅客开放，可翻看此前全部内容；每天一条，当天可改可删，之后不可；不能回应；离店后不能再看 |
| 审核 | 留言、留言本、照片都先审核再显示 |
| 登录 | 进入留言板必须明确点击微信登录，之后静默续期 |
| 关联 | 主键是旅客 UUID（`staying_guest_accounts.id`）；openid 只是登录凭证；一位旅客只关联一个微信；手机号只在后台归并档案用 |
| 关联方式 | 自助入住提交时自动关联；前台入住的旅客首次通过欢迎图小程序码关联；老旅客新入住未归档时先开通并提醒员工合并 |
| 换绑 | 员工在后台重置 |

## 2. 现有后端约束

- 数据：CloudBase 关系型数据库，经 HTTP 网关以 PostgREST 方式访问（`/v1/rdb/rest`），旅客端只带公开钥匙（匿名角色）。**旅客不能直读表，只能调用 `security definer` 的 RPC**，与现有自助入住、行李寄存一致。
- 云函数：小程序不直连，经 Netlify `guest-relay` 中转（按 `x-guest-relay-operation` 白名单放行）。
- 已有表：`staying_guest_accounts`（旅客档案）、`guest_stays`（入住，`status` ∈ pending/in_house/checked_out/no_show，`data.room`、`data.bed`）、`self_checkin_records`、`self_checkin_deposit_orders.payer_openid`、`guest_source_links`（档案归并）。
- 已有 openid 获取：`self-checkin-payment` 函数用 `jscode2session` + `WECHAT_MINIAPP_SECRET`。留言板新建独立函数，不复用支付函数。

> 可选简化（2026-11-03 查看生产环境 `staycube-prod` 控制台）：「身份认证 → 登录方式」的社交登录里还没有微信小程序登录，页面提示「如需管理小程序登录方式，需先进行小程序认证」；「接入 CloudBase」已提供小程序 SDK（`getApp().globalData.cloudbase`，含 `rdb()`）。完成小程序认证后，可改为：
> - 小程序用 CloudBase 小程序登录拿到 CloudBase 用户（由微信身份确定），**不再需要 `guest_sessions` 表和 `jscode2session`**，也不用经 Netlify 中转；
> - RPC 从登录态读取调用者，不再传 `p_session`；`guest_wechat_identities` 改为以 CloudBase 用户 ID（及 openid）关联旅客 UUID；
> - 内容安全检测仍放在云函数里（需要 openid 和小程序 access_token）。
> 2026-11-03 12:04：小程序 stayCube（wx0275f19698c41972）在 `staycube-prod` 完成小程序认证（授权成功）。**决定：改用 CloudBase 小程序登录**，去掉 `guest_sessions` 表与 `jscode2session`，不经 Netlify 中转；第 3.1、3.2、5 节相应简化（实施时以本条为准）。待在「身份认证 → 登录方式」启用微信小程序登录。

## 3. 身份与会话

### 3.1 新表

| 表 | 关键字段 | 说明 |
|---|---|---|
| `guest_wechat_identities` | `openid` 唯一、`guest_id` 唯一、`bound_via`（self_checkin / welcome / backfill）、`bound_at`、`reset_at`、`reset_by` | 一位旅客一个微信，一个微信一位旅客 |
| `guest_sessions` | `token_hash`、`openid`、`revoked_at`、`last_seen_at` | 会话凭证只存哈希；长期有效，不设固定过期；换绑、员工重置或连续 180 天未使用时作废 |
| `guest_welcome_tokens` | `token` 唯一（16 位随机，≤32 字符）、`stay_id`、`created_at` | 欢迎图小程序码的 `scene`；不含任何个人信息 |
| `guest_identity_merge_requests` | `openid`、`existing_guest_id`、`new_guest_id`、`stay_id`、`status` | 老旅客新入住未归档时，提醒员工合并 |
| `self_checkin_records.wechat_openid`（新列） | — | 自助入住提交时记下，记录归到旅客档案后自动关联 |

### 3.2 云函数 `guestbook-session`

请求：`{ code, scene? }`（`code` 来自 `wx.login`）。流程：

1. `jscode2session` 换 openid（不返回给小程序）。
2. 有 `scene`：查 `guest_welcome_tokens` → stay → guest。
   - 该旅客已关联**其他** openid → 返回 `taken`（页面 11c）。
   - 该 openid 已关联**另一个**旅客 → 本次入住临时放行，写入合并提醒，返回状态（页面 11d）。
   - 否则建立关联。
3. 无 `scene`：只按已有关联识别；没有关联返回 `unbound`（页面引导长按欢迎图）。
4. 签发会话凭证，返回 `{ token, state, room, bed, nights, slipper }`。

静默续期：小程序本地凭证过期时，再调一次 `wx.login` + 本函数（不带 `scene`），不再弹登录页。

### 3.3 自助入住自动关联

- 自助入住提交成功后，小程序调用 `wx.login`，把 `code` 与提交凭证一起发给 `guestbook-session` 的 `link_self_checkin` 动作；函数把 openid 写入 `self_checkin_records.wechat_openid`。
- 触发器：`guest_stays.self_checkin_id` 被写入时，若记录有 `wechat_openid` 且未冲突，建立关联。
- 冲突规则同 3.2。
- 这会改动自助入住提交后的流程，需完整回归。

### 3.4 历史数据补关联（需单独授权）

按「押金订单 `payer_openid` → 自助入住记录 → 旅客档案」一次性补写 `guest_wechat_identities`，`bound_via = backfill`；冲突的跳过并列表给员工。

### 3.5 状态计算（RPC 内统一函数 `guestbook_viewer(p_session)`）

- 有 `in_house` 的入住 → 在住，带出房间、床位、第几晚、拖鞋编号。
  - 房间、床位、拖鞋编号：自助入住取 `self_checkin_records.room_name`、`bed_label`、`slipper_number`（员工交接时填写）；前台签署取签署记录的 `slipperNumber` 等字段。
  - 第几晚（按间夜口径）：入住日当晚为第 1 晚，退房当天不算。系统里没有预计退房日期，所以按退房时间划分营业日：`第 N 晚 = (当前时间 − 退房时间点) 所在日期 − 入住日期 + 1`，最小为 1（Asia/Shanghai）。例：10 月 28 日入住、退房时间 12:00，则 28 日下午到 29 日 12:00 前为第 1 晚，29 日 12:00 后为第 2 晚；退房当天中午前仍显示最后一晚。
- 否则有 `checked_out` 的入住 → 已离店。
- 否则 → 未入住。

## 4. 留言板数据

| 表 | 关键字段 |
|---|---|
| `guestbook_notes` | `id`、`guest_id`、`stay_id`、`content`（≤120）、`color`（7 选 1）、`signature`（room/anonymous）、`room_label`（发布时快照）、`photo_path`（≤1）、`status`（pending/approved/rejected/hidden）、`created_at`、`reviewed_at`、`reviewed_by` |
| `guestbook_reactions` | `note_id`、`guest_id`、`kind`（6 种）；唯一 (`note_id`,`guest_id`,`kind`) |
| `guestbook_topics` | `date`、`text`（员工维护的今日话题） |
| `bed_books` | `id`、`room`、`bed`、`status`（active/archived）、`merged_into` |
| `bed_book_entries` | `book_id`、`guest_id`、`stay_id`、`entry_date`（Asia/Shanghai 日期）、`content`（≤300）、`signature`、`photo_paths`（≤3）、`status`、`created_at`、`updated_at`；唯一 (`book_id`,`guest_id`,`entry_date`) |

床位留言本按入住的 `room` + `bed` 找到或新建 `bed_books`；员工可按整本归档、合并。

## 5. 旅客端接口（RPC，均带 `p_session`）

| RPC | 权限 | 说明 |
|---|---|---|
| `guestbook_state` | 已登录 | 首页卡片与票卡所需字段 |
| `guestbook_list_notes(sort, cursor)` | 在住、已离店 | 只返回 approved；按最新或回应数；附回应合计 |
| `guestbook_get_note(id)` | 任何人 | 未登录只能读 approved 的这一条（分享场景），不返回作者身份 |
| `guestbook_toggle_reaction(id, kind)` | 在住 | 增删一条回应 |
| `guestbook_list_mine` | 在住、已离店 | 自己的留言（含审核中）和留言本条目 |
| `guestbook_get_book` | 在住 | 当前床位的留言本，approved + 自己的审核中条目 |
| `guestbook_delete_book_entry(id)` | 在住 | 仅当天 |
| `guestbook_stats` / `guestbook_topic` | 在住、已离店 | 首页统计与今日话题 |

写入走云函数 `guestbook-write`（见第 6 节），不直接开放写入 RPC 给匿名角色：`create_note`、`upsert_book_entry`（当天已有则更新）。

服务端校验：在住才能写；每天一条（数据库唯一约束兜底）；当天才能改删；字数、颜色、照片数；同一旅客每分钟写入次数限制。

## 6. 内容安全与照片

- 文本：`guestbook-write` 先调微信 `msgSecCheck`（v2 需要 openid，函数里有），不通过直接拒绝；通过后写入 `pending`，再进入人工审核。
- 照片：沿用特殊取消的签名上传方式（新增 `guestbook-photos/` 路径前缀与对应的中转白名单），写入时调用 `mediaCheckAsync`，结果回调前保持 `pending`；人工审核兜底。
- 分享出去的单条留言只读 approved（可带照片），不返回旅客 UUID、房间以外的信息。

## 7. 员工端（网页后台）

- 审核队列（前台员工，半天内处理）：留言、留言本条目、照片；通过 / 驳回 / 隐藏。
- 今日话题维护。
- 床位留言本：按整本归档、合并。
- 微信关联：查看、重置（换绑）。
- 合并提醒：处理老旅客重复档案。
- 欢迎图导出：调用 `wxacode.getUnlimited` 生成小程序码（`page = guestbook/login/index`，`scene = 欢迎图凭证`），放在欢迎图右下角。

## 8. 隐私与合规

- 小程序后台「用户隐私保护指引」补充：微信账号标识（识别旅客）、留言与照片内容。
- 自助入住隐私说明补充：提交时记录微信账号标识，用于识别旅客。
- 留言板登录页保留同意勾选，接入微信官方隐私弹窗后可去掉。

## 9. 实施顺序

1. 确认第 10 节问题。
2. 写迁移 SQL（新表、新列、RPC、触发器、RLS/授权），先在测试环境执行。**生产执行需单独授权。**
3. 云函数 `guestbook-session`、`guestbook-write`；`guest-relay` 增加对应 operation 与照片路径白名单；小程序 `guest-transport.js` 增加白名单。
4. 小程序替换 `guestbook/api.js` 为真实接口；自助入住提交后调用关联。
5. 网页后台：审核、话题、留言本、关联重置、合并提醒、欢迎图小程序码。
6. 历史数据补关联（需单独授权）。
7. 开发者工具与真机回归：四种身份路径（自助入住、前台新旅客、老旅客、重复档案）、在住/离店切换、每天一条与当天修改。

## 10. 待确认

1. CloudBase 环境能否与小程序绑定为云开发环境（需在微信开发者工具「云开发」或腾讯云 CloudBase 控制台确认）。
2. 旅宿的退房时间点（用于第几晚的营业日划分，暂按 12:00）。

已确认（2026-11-03）：拖鞋编号来自员工交接/签署记录；第几晚按间夜口径；会话长期有效；前台员工审核，半天内完成；分享出去的单条留言可以带照片。


> 2026-11-03 决定：不接入微信 msgSecCheck / mediaCheckAsync，文本和图片的内容安全由前台员工人工审核负责；第 6 节相关云函数不再实施。

## 11. 2026-11-04 决定：开放浏览与姓名床位登录（覆盖第 1、3、5 节的相关规则）

- **浏览：** 所有进入小程序的人都可以浏览留言墙（含已通过审核的留言照片）；发布、回应、床位留言簿、我的留言需要登录。
- **登录：** 旅客输入姓名，选择房间和床位后微信登录。合住房间（汉城、秦都、临潼、莲湖、长安、雁塔、碑林、未央）统一选 A-F；独立房间（曲江、灞上）不选床位。匹配到唯一在住记录时，把微信关联到旅客 UUID。欢迎图二维码不再使用；自助入住提交时自动关联不变。
- **在住判定：** 完成前台签署或提交自助入住即为在住，无需前台审核（现有同步触发器已写入 `in_house`）。
- **未匹配：** 已关联的离店微信提示“当前已退房，期待下次见面！”，只读进入；未关联的微信统一提示“未找到在住记录”，不透露某人是否住过。每个微信每小时最多失败 5 次。
- **认领限制：** 已关联的微信只能再认领同名的在住记录（老旅客新档案，走临时放行并提醒合并），不能认领别人。
- **署名：** 不再使用真实姓名。留言墙为昵称 / 床位 / 匿名，床位留言簿为昵称 / 匿名；昵称按旅客记录，下次自动带出，每次可改。已有的真实姓名署名改为匿名。
- **床位簿颜色：** 每条可选卡片颜色（与留言墙相同的 7 种，默认紫色）；已有条目保持紫色。

迁移：`stayCube-guestbook/cloudbase/compat/20261104120000_cloudbase_guestbook_public_access.sql`；生产执行：`cloudbase/scripts/apply-guestbook-public-access.sh`（需单独授权）。

## 12. 2026-11-04 决定：留言分享图

- 登录旅客可以为已通过审核的留言生成分享图（发光磁贴样式，1080 × 1304），由微信菜单发给朋友、发朋友圈或保存到相册。
- 分享图不放小程序码，不写“旅客留言墙”；左下角 logo，右下角署名和数码日期。
- 需要在小程序后台把云开发网关加入 downloadFile 合法域名，并在隐私保护指引中声明相册写入。

## 13. 2026-11-05 决定：票根第几晚的分界点

- 票根第几晚改为每天 14:00 加一晚，覆盖第 3.5 节和第 10 节的 12:00。算法不变：`第 N 晚 = 分界后的日期 − 入住日期 + 1`，最小为 1。
- 床位留言簿的“每天一条”和“当天可改可删”仍按 12:00（`gb_business_date`）。

迁移：`stayCube-guestbook/cloudbase/compat/20261105130000_cloudbase_guestbook_night_boundary.sql`；生产执行：`cloudbase/scripts/apply-guestbook-night-boundary.sh`。

