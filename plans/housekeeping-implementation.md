# 保洁端 · 实施方案

日期：2026-11-09　状态：已实现，未部署（stayCube `feat/housekeeping`：迁移 `cloudbase/compat/20261109150000_cloudbase_housekeeping.sql`、员工页 `/staff/housekeeping`；小程序 `feat/housekeeping`：分包 `cleaning/`）。以下为原方案，与实现不同处以代码为准：工作台列表函数名为 `housekeeping_list`；小程序码由新云函数 `housekeeping` 生成，不放进 `staff-admin`

需求见 [`housekeeping.md`](housekeeping.md)，房床见 [`rooms-and-beds.md`](rooms-and-beds.md)。

## 0. 沿用的现有做法

| 项 | 做法 | 依据 |
|---|---|---|
| 数据库 | CloudBase 关系型数据库，经网关以 PostgREST 方式访问；客户端只调用 `security definer` 的 RPC，不直读表 | 现有自助入住、留言板 |
| 保洁员身份 | CloudBase 小程序登录，`auth.uid()` 为 CloudBase 用户 sub | `miniprogram/utils/cloudbase-auth.js`、留言板迁移 |
| 员工权限 | 员工 RPC 开头检查 `public.is_active_staff()` | `~/stayCube/cloudbase/compat/20261103120000_cloudbase_guestbook.sql` |
| 照片 | 新存储桶 `housekeeping-photos`，`storage.objects` 按路径限制读写 | 留言板 `guestbook-photos` |
| 迁移位置 | `~/stayCube/cloudbase/compat/`，配套 `scripts/apply-*.sh` 和 `verify/` | 现有迁移 |
| 入住数据 | `guest_stays.data`：`status`、`checkedOutAt`、`linenRequest`、`moveTask`、`room`、`bed`、`roomType` | `staying_guests_*` 迁移 |

## 1. 数据表

| 表 | 关键字段 | 说明 |
|---|---|---|
| `housekeeping_workers` | `id`、`name`、`wechat_sub`（唯一，可空）、`status`（active / disabled）、`bound_at` | 保洁员；一人一个微信 |
| `housekeeping_bind_tokens` | `token`（16 位随机，用作小程序码 `scene`）、`worker_id`、`expires_at`（24 小时）、`used_at` | 一次性绑定码；换绑时重新生成，原微信解除 |
| `housekeeping_templates` | `room_type`、`task_kind`、`items`（`[{id, group, text, required}]`）、`photos`（`[{id, text}]`）、`updated_by`、`updated_at` | 清单模板，`(room_type, task_kind)` 唯一 |
| `housekeeping_tasks` | 见下 | 任务 |
| `housekeeping_task_photos` | `task_id`、`point_id`、`path`、`uploaded_at`、`deleted_at` | 照片 |
| `housekeeping_task_events` | `task_id`、`actor`、`action`、`note`、`at` | 操作记录：生成、开始、提交、通过、打回、改派、取消 |

`housekeeping_tasks` 字段：

- `kind`：`checkout` 退房整理、`linen` 布草更换、`transfer` 平移布草（完整换房床生成 `checkout`）。
- `stay_id`；`room`、`bed`；换房床另有 `to_room`、`to_bed`。
- `room_type`：`dorm4` / `dorm6` / `bashang` / `qujiang`，由房间名换算。
- `units`：曲江为 2，其余为 1，生成时写定。
- `scheduled_on`：退房取当天；布草和换房床取 `scheduledOn`。
- `status`：`pending` 待整理、`in_progress` 整理中、`submitted` 待验收、`approved` 已通过、`cancelled` 已取消。打回时回到 `in_progress`，并写入 `reject_reason`。
- `priority_rank`：为空表示普通，有值表示优先，数字越小越靠前。
- `assignee_id`：指派或点「开始」的保洁员。
- `merged_checkout_id`：新床位有还没开始的退房整理时立即并入（平移布草生成时，或新床位之后退房时）；被并入的退房整理状态为 `merged`，不在列表单独显示，随平移布草一起提交、验收，不另计工作量（布草送洗数量仍计入）。
- `checklist`：从模板复制，附勾选状态。`photo_points`：从模板复制。
- `source_key`：唯一，防止重复生成，例如 `checkout:<stay_id>:<checkedOutAt>`、`linen:<stay_id>:<requestedAt>`、`move:<stay_id>:<at>`。
- 时间字段：`started_at`、`submitted_at`、`reviewed_by`、`reviewed_at`。

## 2. 任务生成（`guest_stays` 更新后触发器）

> 布草按 `housekeeping.md` 2.1.1 的模型生成：任务里每张床、每件布草写成「换新」或「用 某床 的」，回收与配套确认单独成组。关联床位（平移、连环平移、平移目标刚退房）合成一条任务，按先腾出后铺入排序。下表的具体字段待模型定稿后重写。

| 变化 | 动作 |
|---|---|
| `status` 变为 `checked_out` | 生成退房整理 |
| 同日再入住（`checked_out` → `in_house`） | 取消该次退房整理（记录事件；若已提交，员工端提示） |
| `linenRequest.status` 变为 `pending` | 生成布草更换 |
| `linenRequest.status` 变为 `cancelled` | 取消布草任务 |
| `moveTask` 为 `full` 且 `status` 变为 `completed` | 为原床位生成退房整理 |
| `moveTask` 为 `transfer` 且 `status` 变为 `pending` | 生成平移布草 |
| `moveTask.status` 变为 `cancelled` | 取消平移布草任务 |

- 布草更换和平移布草的「完成」只能由验收触发（完整换房床仍由员工手动完成）：工作台在存在保洁任务时隐藏手动「完成」按钮，触发器也拒绝绕过验收的完成。
- 验收通过时，复用工作台现有的完成逻辑，在同一事务里改写 `guest_stays.data`：
  - 布草：`linenRequest.status = completed`，并写 `linenLastCompletedAt`，保留「未到 `scheduledOn` 不能完成」的限制。
  - 平移布草：`moveTask.status = completed`。房床的实际改写以工作台现有完成路径为准，实施时核对。
- 借用物品：生成退房整理时，读取该入住 `borrowedItems` 中未归还、且名称在「保洁相关物品」名单（新表 `housekeeping_borrow_items`，员工维护，初始：被子、枕头）里的项，加入清单「借用物品」一组；验收通过时为这些项写 `returnedAt`。
- 触发器出错不能阻断工作台原操作：生成失败时记入事件表，员工端显示「任务生成失败」，可手动补建。

## 3. 接口（RPC）

保洁员（`auth.uid()` 须对应 active 保洁员，否则返回 `NOT_BOUND`）：

| RPC | 作用 |
|---|---|
| `housekeeping_bind(p_token)` | 用绑定码绑定当前微信 |
| `housekeeping_me()` | 姓名、今日和本月床位数 |
| `housekeeping_tasks()` | 今天及以前未完成的任务和自己今天提交的任务；排序为优先（按 `priority_rank`），再按 `scheduled_on`、生成时间 |
| `housekeeping_task(p_id)` | 任务详情，含清单、拍照点、照片签名地址、打回原因 |
| `housekeeping_start(p_id)` | 开始，任务归自己 |
| `housekeeping_check(p_id, p_item, p_checked)` | 勾选清单项 |
| `housekeeping_photo_add(p_id, p_point, p_path)` / `housekeeping_photo_remove` | 登记或删除照片（文件先直传存储桶） |
| `housekeeping_submit(p_id)` | 提交验收；必做项和拍照点不齐时拒绝 |
| `housekeeping_stats(p_month)` | 自己当月每天的床位数和任务列表 |

员工（`is_active_staff()`）：

| RPC | 作用 |
|---|---|
| `staff_housekeeping_workers` / `staff_housekeeping_save_worker` | 保洁员列表、新增、停用 |
| `staff_housekeeping_bind_token(p_worker)` | 生成绑定码 |
| `staff_housekeeping_tasks(p_from, p_to, p_status)` | 任务看板 |
| `staff_housekeeping_set_priority(p_ids_in_order)` | 设定优先与顺序，传空数组表示清除优先 |
| `staff_housekeeping_assign(p_id, p_worker)` | 指派或改派 |
| `staff_housekeeping_review(p_id, p_approve, p_reason)` | 通过或打回（打回须填原因） |
| `staff_housekeeping_create(p_stay, p_kind)` | 触发器失败时手动补建 |
| `staff_housekeeping_templates` / `staff_housekeeping_save_template` | 清单模板 |
| `staff_housekeeping_stats(p_from, p_to)` | 按人、按日统计，供导出 |

## 4. 照片

- 路径为 `housekeeping-photos/<task_id>/<point_id>/<uuid>.jpg`。小程序压缩后直传，沿用 `utils/image-processing.js`。
- 保洁员只能写自己正在做的任务路径；员工可读全部。
- 保留 60 天：新建云函数 `housekeeping-photo-cleanup`，每天定时删除 60 天前提交的照片文件，并写 `deleted_at`。员工端显示「照片已过期」。

## 5. 小程序（分包 `cleaning/`）

| 页面 | 内容 |
|---|---|
| `cleaning/bind/index` | 扫码进入（`scene` 为绑定码）；点微信登录完成绑定；绑定码无效、已用或过期时提示联系员工 |
| `cleaning/index/index` | 按「退房」「更换」「平移」三类分组，沿用现有工作习惯；每类为一张卡片，右上角显示剩余数量（没有任务时卡片保留、显示 0），优先的在前；已提交的任务不显示；被打回的任务多一行打回原因；不显示房型和床位位置；顶部一行显示今天已完成床位数 |
| `cleaning/task/index` | 房床（不显示位置指引）、任务类型（平移布草显示「汉城 A → 秦都 C」）、打回原因；按分组勾选清单；拍照点；底部「开始」或「完成」 |
| `cleaning/stats/index` | 本月每日床位数和已通过任务 |

- 登录扩展 `cloudbase-auth.js`：目前只用于留言板，保洁端共用同一套凭证存取。
- 小程序码：`wxacode.getUnlimited`，`page = cleaning/bind/index`，放进 `staff-admin` 云函数的新动作。
- 页面先做 `previews/housekeeping-preview.html` 逐页预览，确认后再写 `miniprogram/cleaning/`。
- 文案只写动作和状态。

## 6. 员工工作台（`~/stayCube`）

- 新页面：保洁任务看板（优先拖动排序、指派、验收、看照片）、清单模板、保洁员管理（生成绑定码、停用）、工作量统计（按日期区间，导出 CSV）。
- 现有页面改动：布草和换房床有保洁任务时，隐藏手动「完成」，改为显示任务状态。
- 换布草登记：按该床位房型列出布草件（合住房间、灞上：床笠、被套、枕套；曲江：大床笠、大被罩、枕套、地巾），默认全部勾选，可取消；曲江枕套可选数量 1–4。所选件写入 `linenRequest.pieces`，保洁任务只列这些件。

## 7. 实施顺序

1. 后端迁移：表、触发器、RPC、存储桶策略、初始模板（第 3 节清单）。完成本地回归后，再在测试环境验证；本迁移含新建表，应用到生产前先确认。
2. 小程序逐页预览，按批注迭代。
3. 小程序分包页面，在开发者工具中核对。
4. 工作台页面与现有页面改动。
5. 照片清理云函数、小程序码生成。
6. 端到端走一遍：退房 → 生成任务 → 保洁员完成 → 员工验收 → 布草或换房床自动完成 → 工作量计入。

## 8. 回归重点

- 工作台现有的退房、同日再入住、布草、换房床流程，在加触发器后行为不变。
- 重复保存同一入住记录不重复生成任务。
- 未绑定或已停用的微信调不通任何保洁 RPC；保洁员读不到旅客个人信息，只看到房床。
