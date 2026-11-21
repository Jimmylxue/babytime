# 养娃账本（育儿花费记录）设计方案

> 日期：2026-11-21
> 状态：已实现（2026-11-21 完成开发，待真机验收）
> 影响范围：`packages/shared` / `apps/server` / `apps/client` / `docs/sql`
> 预估：V1 约 3 天（不含真机验收）

---

## 0. 一句话

把「给娃花了多少钱」从流水账变成一个月度可读的账本：**3 秒记一笔，月底看分类和趋势，可导出 Excel**；不进入宝宝的照护时间线，也不进统计页的 12 个 tab。

---

## 1. 定位与边界

### 1.1 这是一个「个人向」功能

用户明确说过：这不一定是其他用户的刚需，但对自己实用。因此：

- 不做增长主引擎，不放进首页首屏抢照护记录的注意力
- 不做复杂财务能力（报销、分账、发票、会计科目、多币种）
- 不影响现有记录/统计/周报/家庭权限的任何行为

它的价值是：**让已经每天打开小程序的人，多一个每天愿意打开的理由**，并且顺手解决「养娃开销心里没数」的问题。

### 1.2 关键决策：不做第 12 种记录类型

这是本方案最重要的技术决策。**不把「花费」塞进 `records` 表**，理由：

1. `records` 是宝宝照护流水，会被这些地方消费：
   - 首页「今天记了 N 条」概览
   - 连续记录天数（`record-streak`）
   - 统计页 12 个 tab
   - 周报的 activeDays / 各类计数
   - 记录时间线与「按上次来」预填

   买一包纸尿裤如果算一条 record，会把「连续记录 30 天」和「今天记了 5 条」全部污染。

2. `records.amount` 已经表示**奶量（ml）**。再拿它表示金额，语义直接冲突；新增 `expense_amount` 又会让一个 30+ 列的宽表继续膨胀。

3. 2026-09-08 已经明确过：**新记录类型不上统计页 tab**。花费天然不属于「宝宝健康/成长」统计，硬塞进去只会让两边都别扭。

因此采用：**独立表 + 独立模块 + 独立页面**，只在入口层做轻量关联。

### 1.3 不做的事（V1 首版范围）

> 2026-11-21 同日追加 V1.1：**每月预算**、**数量/单位（单价自动算）**、**记录人昵称** 已实现。
> 下面保留首版边界记录；收据照片、付款人、周期账单仍在 V2。

- ❌ 收据/小票照片（涉及图片内容安全、存储、财务信息，放 V2）
- ❌ 谁付的钱 / 家庭分账（放 V2；当前列表显示「谁记的」，不区分付款人）
- ~~❌ 单价、数量、规格换算~~ → ✅ 2026-11-21 已实现「数量 + 单位」，单价 = 金额 / 数量
- ❌ 周期性账单、订阅制提醒（放 V2）
- ❌ 多币种（只做人民币）
- ❌ 发票 OCR、报销流程
- ❌ 与宝宝医疗/成长数据混排

---

## 2. 用户与场景

### 2.1 主要用户

宝宝的主要照护者/付费者。当前阶段就是开发者本人；后续可能扩展到共同抚养的伴侣（家庭 `editor`）。

### 2.2 四个核心场景

| 场景 | 用户动作 | 产品响应 |
|---|---|---|
| 刚买完纸尿裤 | 打开账本 → 输金额 → 点分类 → 保存 | 3 秒完成，列表立即出现 |
| 月底想知道钱花哪了 | 打开账本看本月 | 总额、分类占比、日均、较上月 |
| 想看长期趋势 | 左右切换月份 / 点近 6 个月柱子 | 每月总额和分类变化 |
| 想自己算/留档 | 点导出 | 生成 .xlsx，微信内直接打开 |

### 2.3 非目标用户

- 想记公司账/报销的人
- 想管理家庭总预算（房贷、水电）的人
- 想和陌生人比拼养娃成本的人（不做社区/UGC）

---

## 3. 信息架构与入口

### 3.1 页面

| 页面 | 路径 | 作用 |
|---|---|---|
| 账本首页 | `pages/expense/index` | 月度汇总 + 分类占比 + 明细 + 6 个月趋势 |
| 记一笔/编辑 | `pages/expense/edit` | 金额、分类、日期、项目名、备注 |

### 3.2 入口

**主入口（已实现）**：

```
我的 → 宝贝与家庭 → 养娃账本
```

与「成长纪念册」「导出记录表格」并列。

**次入口（2026-11-21 用户拍板加入，已实现）**：

```
发现页宫格 → 养娃账本
```

- 放在宫格末尾；登录后有「本月关注」时共 9 个，最后一行 1 个，接受换行
- 两处入口都上报 `tool_click{name:'expense'}`，后台使用率按合并计数

**明确不加的入口**：

- 首页「快速记录」宫格（那是照护动作）
- 统计页 tab（不污染照护统计）
- 「更多记录」弹层（同上）

**总闸开关（已实现）**：后台「系统设置 → 养娃账本 → 开启养娃账本」（`expense.enabled`，默认开）。

- 关闭后：两处入口隐藏（发现页/我的页按公开配置门控）、账本页/编辑页强刷配置后自动 `switchTab` 回首页（与育娃圈页面同一套兜底）、服务端全部账本接口 403「养娃账本暂未开启」
- 已有数据保留不删；重新打开即恢复
- 配置接口失败时客户端按关处理（与瞬间/育娃圈同一套安全降级）；服务端 `SystemSettingsService.isEnabled` 是硬闸门

### 3.3 命名

推荐：**养娃账本**

备选：育儿花费、花费记录、养娃记账。

「养娃账本」比「花费记录」更像一个产品，也比「记账」更有育儿语境；文案不要出现「省钱/败家/消费降级」这类评判。

---

## 4. 页面设计

### 4.1 账本首页

```
┌──────────────────────────────────┐
│  ‹   2026年11月   ›        导出  │
│                                  │
│  ┌────────────────────────────┐  │
│  │ 本月支出                    │  │
│  │ ¥ 3,240.50                 │  │
│  │ 共 18 笔 · 日均 ¥154.31    │  │
│  │ 较上月 +12.3%              │  │
│  └────────────────────────────┘  │
│                                  │
│  分类占比                        │
│  ┌────────────────────────────┐  │
│  │ [尿布] 纸尿裤   ¥1,200  37% │  │
│  │ ████████████░░░░░░         │  │
│  │ [奶瓶] 奶粉       ¥900  28% │  │
│  │ █████████░░░░░░░░░         │  │
│  │ [小碗] 辅食       ¥430  13% │  │
│  │ ████░░░░░░░░░░░░░░         │  │
│  │ …                          │  │
│  └────────────────────────────┘  │
│                                  │
│  11月明细              [全部 ▾]  │
│  今天 · ¥129.00                  │
│  ┌────────────────────────────┐  │
│  │ [尿布] 帮宝适 L 码  ¥129.00 │  │
│  │    超市 · 备注…             │  │
│  └────────────────────────────┘  │
│  11月20日 · ¥268.00              │
│  …                               │
│                                  │
│  近 6 个月                       │
│  ▂  ▄  ▃  ▆  ▅  █              │
│  6月 7月 8月 9月 10月 11月       │
│                                  │
│                        [+ 记一笔]│
└──────────────────────────────────┘
```

#### 顶部月份切换

- 左/右箭头切换月份；未来月份禁用（置灰）
- **中间的年月文字可以点**：弹微信原生年月滚轮（`Picker mode='date' fields='month'`，`end` 限制不能选未来），跨大几个月时不用一路按箭头；文字旁带 `▾` 提示可点
- 右侧「导出」文字按钮：默认导出当前选中月份；点开可自选区间（复用记录导出的范围面板交互）

#### 汇总卡

- 大数字：本月支出，保留两位小数，千分位
- 副行：`共 N 笔 · 日均 ¥X`
- 对比行：`较上月 +12.3%` / `较上月 -8.0%` / `上月无记录`
- 可选 V1.1：预算进度条（见 §9.2）

#### 分类占比卡

- 只显示本月金额 > 0 的分类，按金额降序
- 每行：分类图标 + 名称 + 金额 + 百分比
- 下方细进度条，宽度 = 百分比
- 点击某行 → 列表按该分类筛选；再次点击或点「全部」取消
- 分类超过 6 个时默认显示前 6 个 + 「查看全部」展开（实际一个月很少超过 6 类）

#### 明细列表

- 按 `expenseDate` 倒序分组
- 日期头：`今天` / `昨天` / `11月20日 周五`，右侧当天小计
- 行：分类图标 + 项目名（没有则显示分类名）+ 备注（单行省略）+ 金额
- 点击行 → 编辑页
- 删除不在列表做长按/滑动，统一放编辑页底部（与「删除宝宝」「删除记录」的确认习惯一致，避免误触）
- 分页：每页 50 条，触底加载；一个月通常 10–50 条，多数用户一页到底

#### 近 6 个月趋势

- 纯 DOM 柱子，不用 Canvas（6 根柱子不值得引入图表组件）
- 柱高按最大值归一化；最大值为 0 时整块不渲染
- 点击柱子切换到对应月份
- 标签显示月份，选中月份高亮；金额只在点击/选中时显示，避免拥挤
- 当前月是**未过完的月**，柱子用浅色并在标签上写「本月」，避免用户误以为「这个月花得少」

#### 状态

- 加载：骨架占位（汇总卡 + 3 行列表）
- 空：钱包线稿 + 「还没有记过花费」+ 「从第一包纸尿裤开始」+ 记一笔按钮
- 无权限（非家庭成员）：钱包线稿 + 「账本仅对家庭成员开放」+ 返回
- 错误：重试按钮（沿用页面级错误态）

### 4.2 记一笔 / 编辑

> 2026-11-21 真机反馈后调整：hero 去掉与导航栏重复的「记一笔」大标题；
> 单位改为包/片/罐 chips 单选；「买了什么」只在「其他」分类出现；
> 保存按钮放流内（textarea 是原生组件层级更高，fixed 按钮盖不住输入中的文字）。

```
┌──────────────────────────────────┐
│  记一笔（导航栏标题）             │
│                                  │
│           ¥  129.00              │
│  纸尿裤、奶粉、衣服，都能记        │
│                                  │
│  分类                             │
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐    │
│  │纸尿│ │奶粉│ │辅食│ │喂养│    │
│  └────┘ └────┘ └────┘ └────┘    │
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐    │
│  │衣物│ │玩具│ │医疗│ │洗护│    │
│  └────┘ └────┘ └────┘ └────┘    │
│  ┌────┐ ┌────┐                   │
│  │出行│ │其他│                   │
│  └────┘ └────┘                   │
│                                  │
│  日期        2026-11-21  ›       │
│  数量        [60]                │
│  单位        (包) (片) (罐)      │
│  备注        [................]  │
│  （其他分类时）买了什么 [……]      │
│                                  │
│  [           保存           ]    │
│                                  │
│  （编辑态）删除这笔               │
└──────────────────────────────────┘
```

#### 交互细节

- 金额输入：
  - `input type="digit"`，自动聚焦
  - 只允许数字和一个小数点，最多 2 位小数
  - 范围 `0.01 ~ 999999.99`
  - 大字号、居中、`¥` 前缀
- 分类：
  - 5 列 × 2 行（10 类）
  - 默认选中**上次使用的分类**（`storage: expense:lastCategory`），首次默认「纸尿裤」
  - 选中态：粉色描边 + 浅粉底 + 右上角 ✓（不能只靠颜色区分）
- 日期：
  - 默认今天；最大今天（不允许未来支出）
  - Picker 选择，显示 `YYYY-MM-DD`
- 买了什么：
  - **只在「其他」分类出现**：选了纸尿裤/奶粉等具体分类时，分类本身就说明了花在哪，再问「买了什么」是重复
  - 选填，最多 30 字
- 数量 / 单位（2026-11-21 改版）：
  - 数量为数字输入（选填）；单位改为**包 / 片 / 罐三选一 chips**，再点一次取消，不再手输
  - 历史数据里不在三选中的旧单位，编辑保存后清空
- 备注：
  - 选填，最多 100 字，右下角计数器
- 保存按钮（2026-11-21 修复）：
  - **放流内而不是 fixed**：textarea 是原生组件、层级高于普通 View，fixed 按钮盖不住输入中的文字（真机看到备注内容透出在保存按钮上就是这个原因）
  - 金额非法或保存中时置灰
  - 保存成功 toast「记好了」→ 返回列表
  - 列表自动刷新；如果保存的月份不是当前查看月份，自动切到那个月
- 编辑态：
  - 预填全部字段
  - 底部「删除这笔」文字按钮，二次确认「删除后无法恢复」
  - 删除后返回列表并刷新
- 防连点：`saving` 锁，接口失败只复位状态，不弹兜底 toast（沿用项目「页面 catch 不顶掉拦截器提示」的约定）

`EXPENSE_UNITS = ['包', '片', '罐']` 是 shared 里的固定单位表，客户端 chips 与服务端校验共用。

### 4.3 视觉规范

- 页面底色：`#FFFAF9`
- 卡片：白底、圆角 24rpx、轻阴影
- 金额：`font-weight: 800`，`font-variant-numeric: tabular-nums`，颜色 `#3D3A3F`
- 上涨/下降：不使用金融红绿，避免制造压力
  - 较上月增加：珊瑚粉 `#F0728A` + ↑
  - 较上月减少：柔和绿 `#5FA97C` + ↓
  - 持平/无数据：灰 `#A8A59E`
- 图标：24×24 线性 SVG，线宽 1.7，圆角端点，与 `assets/tool-icons` 同一套语言；**不用 emoji**
- 分类图标底色：复用现有 tint（pink / blue / sand / cream / lilac / rose / green）

---

## 5. 分类体系

### 5.1 单一数据源

新增 `packages/shared/src/expenseCategories.ts`，前后端共用，禁止前端再维护第二份。

| code | 名称 | 图标建议 | tint |
|---|---|---|---|
| `diaper` | 纸尿裤 | 尿布 | pink |
| `formula` | 奶粉 | 奶瓶 | cream |
| `food` | 辅食 | 小碗 | sand |
| `feeding` | 喂养用品 | 奶瓶/吸奶器 | blue |
| `clothing` | 衣物 | 小衣服 | lilac |
| `toy` | 玩具绘本 | 积木/书 | rose |
| `medical` | 医疗疫苗 | 十字/针管 | green |
| `daily` | 洗护日用 | 水滴/瓶 | blue |
| `travel` | 出行大件 | 婴儿车 | sand |
| `other` | 其他 | 三点 | gray |

```ts
export type ExpenseCategoryCode =
  | 'diaper' | 'formula' | 'food' | 'feeding' | 'clothing'
  | 'toy' | 'medical' | 'daily' | 'travel' | 'other'

export interface ExpenseCategoryMeta {
  code: ExpenseCategoryCode
  label: string
  icon: string   // 客户端图标 key，服务端不用
  tint: string
}

export const EXPENSE_CATEGORIES: readonly ExpenseCategoryMeta[] = [...]
export const EXPENSE_CATEGORY_MAP: Record<ExpenseCategoryCode, ExpenseCategoryMeta>
export const EXPENSE_CATEGORY_CODES: ExpenseCategoryCode[]
export function isExpenseCategoryCode(v: string): v is ExpenseCategoryCode
export function expenseCategoryLabel(code: string): string
```

### 5.2 为什么分类用 varchar 而不是 MySQL enum

- 分类是产品层概念，未来加「早教」「保险」不需要 `ALTER TABLE`
- 服务端用 shared 的 `EXPENSE_CATEGORY_CODES` 校验，非法值 400
- 数据库存字符串，导出时用 shared 的 label 映射；未知 code 回退「其他」

---

## 6. 数据模型

### 6.1 `expenses` 表

遵循 `milestone-2026-09.sql` 的新表约定：`baby_id varchar(255)`、**不建外键**、不显式写 COLLATE，删宝宝时由应用层先清子表。

```sql
-- 2026-11-21 新增养娃账本表 expenses
-- 生产库 DB_SYNCHRONIZE=false，不会自动建表；部署服务端前先执行本文件。
-- 对应实体：apps/server/src/modules/expense/entities/expense.entity.ts
-- 分类唯一数据源：packages/shared/src/expenseCategories.ts
-- 执行方式（服务器上）：
--   bash backup-db.sh pre-deploy
--   bash run-sql.sh docs/sql/expense-2026-11.sql

CREATE TABLE IF NOT EXISTS `expenses` (
  `id` varchar(36) NOT NULL,
  `baby_id` varchar(255) NOT NULL COMMENT '宝宝 ID',
  `actor_user_id` varchar(255) NULL COMMENT '实际记账的用户（家人代记时与创建者不同）',
  `amount` decimal(10,2) NOT NULL COMMENT '金额（元）',
  `category` varchar(32) NOT NULL COMMENT '分类 code，见 shared/expenseCategories',
  `item_name` varchar(50) NULL COMMENT '买了什么，选填',
  `note` varchar(200) NULL COMMENT '备注，选填',
  `quantity` decimal(10,2) NULL COMMENT '数量/规格，选填（如 60）',
  `unit` varchar(10) NULL COMMENT '单位，选填（如 片、罐、包）',
  `expense_date` date NOT NULL COMMENT '花费日期（本地日历日）',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_expenses_baby_date` (`baby_id`, `expense_date`),
  KEY `idx_expenses_baby_category_date` (`baby_id`, `category`, `expense_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

说明：

1. 不加 `UNIQUE`：同一天买两包纸尿裤是正常行为。
2. 不加外键：与 `baby_milestones` / `moments` 等新表一致；删宝宝由 `baby.service.remove` 事务里显式删。
3. `amount` 用 `decimal(10,2)`，不用 float；TypeORM 实体走 `decimalTransformer`，避免 mysql2 返回字符串导致前端 `toFixed` 崩溃（纪念册海报踩过这个坑）。
4. `expense_date` 用 `date` 而不是 `datetime`：花费只需要知道哪一天，不需要精确到分钟；排序同日用 `created_at`。
5. 索引覆盖：
   - 月度列表/汇总：`(baby_id, expense_date)`
   - 分类筛选：`(baby_id, category, expense_date)`
6. 不建 `created_at` 索引：V1 没有按创建时间扫全表的查询；真需要再加。

### 6.2 实体

`apps/server/src/modules/expense/entities/expense.entity.ts`

```ts
@Entity('expenses')
@Index('idx_expenses_baby_date', ['babyId', 'expenseDate'])
@Index('idx_expenses_baby_category_date', ['babyId', 'category', 'expenseDate'])
export class Expense {
  @PrimaryGeneratedColumn('uuid') id: string
  @Column({ name: 'baby_id', type: 'varchar' }) babyId: string
  @Column({ name: 'actor_user_id', type: 'varchar', nullable: true }) actorUserId: string | null
  @Column({ type: 'decimal', precision: 10, scale: 2, transformer: decimalTransformer })
  amount: number
  @Column({ type: 'varchar', length: 32 }) category: ExpenseCategoryCode
  @Column({ name: 'item_name', type: 'varchar', length: 50, nullable: true }) itemName: string | null
  @Column({ type: 'varchar', length: 200, nullable: true }) note: string | null
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true, transformer: decimalTransformer })
  quantity: number | null
  @Column({ type: 'varchar', length: 10, nullable: true }) unit: string | null
  @Column({ name: 'expense_date', type: 'date' }) expenseDate: string
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date
}
```

不建 `ManyToOne` 关系：所有查询都按 `babyId`，不需要 join；避免本地 `synchronize=true` 生成生产没有的外键。

### 6.3 删除级联

**删宝宝**（`apps/server/src/modules/baby/baby.service.ts` `remove()`）：

在事务里加一行：

```ts
await manager.delete(Expense, { babyId: id })
```

顺序放在 `records` 之后、`babies` 之前；无图片，不需要 CDN 清理。

**注销账号**（`apps/server/src/modules/user-deletion/user-deletion.service.ts`）：

1. 在「别人家宝宝上记的记录」置空段，加：

```sql
UPDATE expenses SET actor_user_id = NULL
WHERE actor_user_id = ? AND baby_id NOT IN (SELECT id FROM babies WHERE user_id = ?)
```

2. 在「名下流水」删除段，加：

```sql
DELETE FROM expenses WHERE baby_id IN (SELECT id FROM babies WHERE user_id = ?)
```

3. `countScoped()` 增加 `expenses` 计数，让注销预览与真实删除量一致。

4. 后台联动（不改会显示不出来或类型报错）：
   - `apps/admin/src/types.ts` 的 `UserDeletionCounts` 增加 `expenses: number`
   - `apps/admin/src/pages/Users.tsx` 的 `DELETION_LABELS` 增加 `{ key: 'expenses', label: '账本记录' }`
   - 别人家宝宝上的账本记录：可以把 `externalExpenses` 并进现有 `externalActorRows`（预览文案「在别人家宝宝上记的 N 条…」仍然成立），也可以单列一行；推荐并进去，少改一处 UI

5. 如果 V1.1 加了预算表，同样处理（删名下 + 计数）。

**注意**：`user-deletion` 里 `OWNED_BABIES` 子查询的占位符参数是按 `?` 个数生成的，新增 SQL 时不要手写参数表，继续用 `scoped(sql, userId)`。

### 6.4 预算表（V1.1，已实现）

2026-11-21 已实现；一个宝宝一条每月预算，所有月份通用：

```sql
CREATE TABLE IF NOT EXISTS `expense_budgets` (
  `id` varchar(36) NOT NULL,
  `baby_id` varchar(255) NOT NULL COMMENT '宝宝 ID',
  `amount` decimal(10,2) NOT NULL COMMENT '每月预算（元）',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_expense_budgets_baby` (`baby_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

一个宝宝一条「每月预算」，所有月份通用；不做按月单独设预算（那是记账 App 的复杂度，不是这里的价值）。

---

## 7. API 设计

统一前缀 `/api`，全部走 `JwtAuthGuard`，响应由全局拦截器包成 `{ code, message, data }`。

### 7.1 接口清单

| 方法 | 路径 | 说明 |
|---|---|---|
| `POST` | `/expense` | 新增一笔 |
| `GET` | `/expense/list/:babyId` | 月度列表，支持分类筛选 + 分页 |
| `GET` | `/expense/summary/:babyId` | 月度汇总 + 分类占比 + 近 6 个月 + 预算 |
| `PUT` | `/expense/budget/:babyId` | 设置/清除每月预算 |
| `GET` | `/expense/:id` | 单笔详情（编辑页用） |
| `PATCH` | `/expense/:id` | 编辑 |
| `DELETE` | `/expense/:id` | 删除 |
| `GET` | `/expense/export/:babyId` | 导出 .xlsx（base64） |

**路由顺序**：`list/:babyId`、`summary/:babyId`、`export/:babyId` 必须写在 `:id` 之前，否则 `summary` 会被当成 id。

### 7.2 新增

```http
POST /api/expense
{
  "babyId": "uuid",
  "amount": 129.00,
  "category": "diaper",
  "itemName": "帮宝适 L 码",
  "note": "超市",
  "quantity": 60,
  "unit": "片",
  "expenseDate": "2026-11-21"
}
```

校验：

- `babyId`：`@IsUUID()`
- `amount`：`@IsNumber({ maxDecimalPlaces: 2 })`、`@Min(0.01)`、`@Max(999999.99)`
- `category`：`@IsIn(EXPENSE_CATEGORY_CODES)`
- `itemName`：`@IsOptional()`、`@IsString()`、`@MaxLength(50)`
- `note`：`@IsOptional()`、`@IsString()`、`@MaxLength(200)`
- `quantity`：`@IsOptional()`、`@IsNumber({ maxDecimalPlaces: 2 })`、`@Min(0.01)`、`@Max(999999)`；null 表示清空
- `unit`：`@IsOptional()`、`@IsString()`、`@MaxLength(10)`；null 表示清空
- `expenseDate`：`@IsOptional()`、`@Matches(/^\d{4}-\d{2}-\d{2}$/)`，且不能晚于今天

服务端：

1. `babyService.findOne(babyId, userId)` → 家庭成员校验（owner/editor/viewer 都通过）
2. **不调用 `assertCanWrite`**：账本按家庭共享，viewer 也能记
3. `contentSecurity.checkUserTexts(userId, [itemName, note])`
4. `actorUserId = userId`
5. `expenseDate` 为空时用服务端本地日期

### 7.3 列表

```http
GET /api/expense/list/:babyId?month=2026-11&category=diaper&page=1&pageSize=50
```

返回：

```json
{
  "items": [
    {
      "id": "uuid",
      "babyId": "uuid",
      "actorUserId": "uuid",
      "amount": 129.00,
      "category": "diaper",
      "itemName": "帮宝适 L 码",
      "note": "超市",
      "quantity": 60,
      "unit": "片",
      "actorName": "奶奶",
      "expenseDate": "2026-11-21",
      "createdAt": "2026-11-21T10:30:00.000Z",
      "updatedAt": "2026-11-21T10:30:00.000Z"
    }
  ],
  "total": 18,
  "page": 1,
  "pageSize": 50,
  "hasMore": false
}
```

规则：

- `month` 默认当前月；格式 `YYYY-MM`；未来月份 400
- `category` 可选；非法值 400
- `pageSize` 默认 50，上限 100
- 排序：`expenseDate DESC, createdAt DESC`
- 返回扁平数组，日期分组由客户端做（同相册分页的合并思路，但这里按月查询，量小）
- `actorName`：本页按 `actorUserId` 去重后一次查 users 补昵称，不逐条 N+1；前端只在「不是自己记的」时显示「XX记的」

### 7.4 汇总

```http
GET /api/expense/summary/:babyId?month=2026-11
```

返回：

```json
{
  "month": "2026-11",
  "total": 3240.50,
  "count": 18,
  "dailyAvg": 154.31,
  "prevTotal": 2885.00,
  "deltaPercent": 12.3,
  "byCategory": [
    { "category": "diaper", "label": "纸尿裤", "amount": 1200.00, "count": 6, "percent": 37.0 },
    { "category": "formula", "label": "奶粉", "amount": 900.00, "count": 4, "percent": 27.8 }
  ],
  "topExpense": {
    "amount": 599.00,
    "category": "travel",
    "itemName": "婴儿车",
    "expenseDate": "2026-11-08"
  },
  "recentMonths": [
    { "month": "2026-06", "total": 2100.00 },
    { "month": "2026-07", "total": 2450.00 },
    { "month": "2026-08", "total": 1980.00 },
    { "month": "2026-09", "total": 3020.00 },
    { "month": "2026-10", "total": 2885.00 },
    { "month": "2026-11", "total": 3240.50 }
  ],
  "yearTotal": 18230.50,
  "yearCount": 96,
  "budget": {
    "amount": 5000.00,
    "usedPercent": 64.8,
    "remaining": 1759.50,
    "isOver": false
  }
}
```

口径：

- `total`：`SUM(amount)`
- `count`：`COUNT(*)`
- `dailyAvg`：
  - 当前月：`total / 今天几号`
  - 历史月：`total / 该月天数`
  - 未来月：0（正常不会请求）
- `prevTotal`：上一个自然月总额；无数据为 0
- `deltaPercent`：`prevTotal > 0 ? round((total - prevTotal) / prevTotal * 1000) / 10 : null`
  - 前端在 `null` 时显示「上月无记录」，不要显示 ∞
- `byCategory`：只返回金额 > 0 的分类，按金额降序，`percent = amount / total * 100` 保留 1 位
- `topExpense`：本月最大一笔；无数据为 `null`
- `recentMonths`：以选中月份为终点，往前 5 个月 + 选中月，共 6 个；缺失月份补 0
- `yearTotal` / `yearCount`：选中月份所在年份的累计（含该年之后月份，按库里实际数据；用于「今年累计」）
- `budget`：未设置时为 `null`；`usedPercent = total / amount * 100`（可能超过 100），`remaining` 超支时为负数

### 7.5 编辑 / 删除

```http
PATCH /api/expense/:id
{
  "amount": 139.00,
  "category": "diaper",
  "itemName": "帮宝适 L 码",
  "note": "换了一家超市",
  "quantity": 30,
  "unit": "包",
  "expenseDate": "2026-11-20"
}
```

- 不允许改 `babyId`
- 其余字段全部可选；校验规则同新增；`quantity/unit` 传 `null` 表示清空
- 必须先按 id 找到记录 → `findOne` 家庭成员校验 → 直接保存（**不调用 `assertCanWrite`**）
- 编辑时也要重新跑内容安全（只有 `itemName/note` 有值才跑）

```http
DELETE /api/expense/:id
→ { "success": true }
```

### 7.5.1 预算

```http
PUT /api/expense/budget/:babyId
{ "amount": 3000 }
```

- `amount` 为 `null` 表示清除预算
- 所有家庭成员（owner/editor/viewer）都可设置/清除
- 一个宝宝一条，所有月份通用

- 同上权限
- 物理删除（与 records 一致；V1 没有审计/回收站需求）

### 7.6 导出

```http
GET /api/expense/export/:babyId?startDate=2026-11-01&endDate=2026-11-30
```

返回：

```json
{
  "filename": "养娃账本_2026-11-01_2026-11-30.xlsx",
  "content": "UEsDB...",
  "encoding": "base64",
  "total": 18,
  "truncated": false,
  "note": "导出区间 2026-11-01 ~ 2026-11-30"
}
```

规则：

- 默认当前月；`startDate/endDate` 格式 `YYYY-MM-DD`
- 跨度上限 **366 天**（账本一年一导是合理需求，比记录导出的 31 天宽）
- 行数上限 **5000 行**，超了截断并返回 `truncated: true`
- 不允许未来结束日期（夹到今天）
- 列：`日期 / 分类 / 项目 / 金额(元) / 数量 / 单位 / 单价(元) / 备注 / 记录人 / 创建时间`
- 复用 `apps/server/src/common/xlsx.ts` 的 `buildXlsx`；中文天然 UTF-8，不需要 BOM
- `记录人`：`LEFT JOIN users` 取昵称；账号已注销则空
- 金额以 number 写入；不要拼公式（inline string 不解析为公式）

### 7.7 权限矩阵

| 角色 | 查看账本 | 新增/编辑/删除 | 导出 |
|---|---|---|---|
| owner（创建者） | ✅ | ✅ | ✅ |
| editor（可记录家人） | ✅ | ✅ | ✅ |
| viewer（只读家人） | ✅ | ✅ | ✅ |
| 非家庭成员 | ❌ | ❌ | ❌ |

**2026-11-21 用户拍板：只要加入家庭就能看、也能记**。账本按家庭共享，长辈代买衣服/纸尿裤也要能记一笔；这是对「viewer 只读」的**有意例外**，不调用 `assertCanWrite()`。`viewer` 仍然不能改宝宝记录/照片/里程碑，两套权限互不影响。

**客户端处理**：账本页请求 summary/list 不传 `silent`，保证 token 过期时能自动续期；非家庭成员 403 时页面同时渲染「账本仅对家庭成员开放」状态。

---

## 8. 服务端实现

### 8.1 目录

```
apps/server/src/modules/expense/
├── expense.module.ts
├── expense.controller.ts
├── expense.service.ts
├── entities/expense.entity.ts
└── dto/
    ├── create-expense.dto.ts
    ├── update-expense.dto.ts
    └── query-expense.dto.ts
```

`expense.module.ts`：

```ts
@Module({
  imports: [TypeOrmModule.forFeature([Expense]), BabyModule, ContentSecurityModule],
  controllers: [ExpenseController],
  providers: [ExpenseService],
})
export class ExpenseModule {}
```

`app.module.ts` 增加 `ExpenseModule` 导入。

### 8.2 Service 方法

| 方法 | 要点 |
|---|---|
| `create(userId, dto)` | `findOne` 家庭成员校验 → 校验日期/分类 → 内容安全 → save |
| `findList(userId, babyId, query)` | 家庭成员校验 → 月区间 + 分类 + 分页 |
| `getSummary(userId, babyId, month)` | 家庭成员校验 → 本月/上月/近 6 月三组聚合 |
| `findOne(userId, id)` | 家庭成员校验 → 不存在 404 |
| `update(userId, id, dto)` | 家庭成员校验 → 校验 → 内容安全 → save |
| `remove(userId, id)` | 家庭成员校验 → delete |
| `export(userId, babyId, range)` | 家庭成员校验 → 查记录 → `buildXlsx` |

### 8.3 权限判定

账本是家庭共享数据：所有读写入口都只调用 `babyService.findOne(babyId, userId)`（创建者或已加入家庭成员均可通过），**不调用 `assertCanWrite()`**。这样 `viewer` 也能查看和记账，符合 2026-11-21 用户拍板；但 `viewer` 在宝宝记录/照片/里程碑上的只读限制保持不变。

### 8.4 内容安全

复用 `ContentSecurityService.checkUserTexts(userId, texts)`：

- 只检查 `itemName`、`note`
- 空串/空格过滤掉再传
- 品牌名（帮宝适、爱他美）正常通过；如果出现误拦，沿用现有 `risky/review` 放宽开关，不要为账本单独写词库

### 8.5 金额与日期

- 金额：`decimalTransformer`；SQL `SUM()` 返回字符串，用 `Number()` 转换后再做 `round2`
- `round2 = (v: number) => Math.round(v * 100) / 100`
- 日期：
  - `expenseDate` 是 `YYYY-MM-DD` 字符串，不经过 `new Date('YYYY-MM-DD')`（UTC 偏移）
  - 月区间用本地日历日计算：
    ```ts
    const start = `${month}-01`
    const [y, m] = month.split('-').map(Number)
    const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
    ```
  - 查询用 `expense_date >= start AND expense_date < next`，闭开区间，避免 `LAST_DAY` 和闰年问题
- 未来日期：`expenseDate > todayStr` 直接 400「花费日期不能晚于今天」

### 8.6 汇总查询

```sql
-- 本月分类聚合
SELECT category, COUNT(*) AS count, COALESCE(SUM(amount), 0) AS amount
FROM expenses
WHERE baby_id = ? AND expense_date >= ? AND expense_date < ?
GROUP BY category;

-- 本月总额/笔数
SELECT COUNT(*) AS count, COALESCE(SUM(amount), 0) AS total
FROM expenses
WHERE baby_id = ? AND expense_date >= ? AND expense_date < ?;

-- 上月总额
SELECT COALESCE(SUM(amount), 0) AS total
FROM expenses
WHERE baby_id = ? AND expense_date >= ? AND expense_date < ?;

-- 近 6 个月
SELECT DATE_FORMAT(expense_date, '%Y-%m') AS month, COALESCE(SUM(amount), 0) AS total
FROM expenses
WHERE baby_id = ? AND expense_date >= ? AND expense_date < ?
GROUP BY DATE_FORMAT(expense_date, '%Y-%m');
```

四个查询走 `Promise.all`；都命中 `(baby_id, expense_date)` 索引。数据量级别（一个宝宝一个月几十条）不需要缓存。

### 8.7 导出

- 复用 `record-query.service.ts` 的 `parseExportRange` 思路，但上限改 366 天、行数 5000
- 用 `buildXlsx([header, ...rows], { sheetName: '养娃账本' })`
- 返回 base64，与记录导出一致；小程序端 `writeFileSync(..., 'base64')` + `openDocument({ fileType: 'xlsx' })`

---

## 9. 客户端实现

### 9.1 文件

```
apps/client/src/pages/expense/
├── index.tsx
├── index.scss
├── index.config.ts
├── edit.tsx
├── edit.scss
└── edit.config.ts
```

`app.config.ts` 增加两个路由：

```ts
'pages/expense/index',
'pages/expense/edit',
```

### 9.2 API 封装

`apps/client/src/utils/request.ts` 增加 `expenseApi`：

```ts
export const expenseApi = {
  create: (data: ExpenseInput & { babyId: string }) =>
    request<Expense>({ url: '/expense', method: 'POST', data }),
  list: (babyId: string, params: ExpenseListParams = {}) => {
    const query = new URLSearchParams()
    // month/category/page/pageSize 按需写入 query
    return request<ExpenseListResult>({
      url: `/expense/list/${babyId}${query.toString() ? `?${query}` : ''}`,
    })
  },
  summary: (babyId: string, month?: string) =>
    request<ExpenseMonthSummary>({
      url: `/expense/summary/${babyId}${month ? `?month=${month}` : ''}`,
    }),
  get: (id: string) => request<Expense>({ url: `/expense/${id}` }),
  update: (id: string, data: Partial<ExpenseInput>) =>
    request<Expense>({ url: `/expense/${id}`, method: 'PATCH', data }),
  remove: (id: string) => request<{ success: boolean }>({ url: `/expense/${id}`, method: 'DELETE' }),
  exportExcel: (babyId: string, range: { startDate: string; endDate: string }) =>
    request<ExportResult>({
      url: `/expense/export/${babyId}?startDate=${range.startDate}&endDate=${range.endDate}`,
    }),
}
```

类型定义：跨端共享的 `Expense` / `ExpenseMonthSummary` / `ExpenseListResult` 放 `packages/shared/src/expense.ts`；请求参数类型放 `request.ts` 或 shared 均可。遵循现有 `recordApi` 的风格。读接口**不传 `silent`**，保证 401 能自动续期。

### 9.3 页面状态

账本首页：

```ts
const [month, setMonth] = useState(currentMonth)       // YYYY-MM
const [category, setCategory] = useState<string | null>(null)
const [summary, setSummary] = useState<ExpenseSummary | null>(null)
const [items, setItems] = useState<Expense[]>([])
const [page, setPage] = useState(1)
const [hasMore, setHasMore] = useState(false)
const [loading, setLoading] = useState(true)
const [forbidden, setForbidden] = useState(false)
```

- `useEffect` 监听 `month/category`：切换月份、切换分类时重新拉第一页
- `useDidShow`：从编辑页返回时刷新（用 `useRef` 跳过首次挂载，避免和 `useEffect` 重复请求）
- `useReachBottom` 加载下一页
- 切换月份时清空列表和分类筛选
- 请求失败：403 → `forbidden`；其他 → 页面错误态（不带兜底 toast，避免顶掉拦截器提示）

编辑页：

```ts
const [amount, setAmount] = useState('')
const [category, setCategory] = useState<ExpenseCategoryCode>('diaper')
const [expenseDate, setExpenseDate] = useState(today)
const [itemName, setItemName] = useState('')
const [note, setNote] = useState('')
const [saving, setSaving] = useState(false)
```

- 进入时读 `route.params.id`：有 id 走编辑，无 id 走新增
- 新增时读 `storage: expense:lastCategory` 作为默认分类
- 保存成功写回 `expense:lastCategory`
- 保存成功 `Taro.eventCenter.trigger('expense:saved', { month })`，列表页监听并切月/刷新
- 编辑态删除：`Taro.showModal` 确认 → `expenseApi.remove` → `navigateBack`

### 9.4 页面组件拆分

账本首页不拆太碎，建议 3 个局部组件（可以放同文件，超过 300 行再拆）：

- `MonthSwitcher`：月份左右切换 + 导出
- `SummaryCard`：总额/笔数/日均/环比
- `CategoryBreakdown`：分类行 + 百分比条
- `ExpenseList`：日期分组 + 行
- `TrendBars`：6 个月柱状

编辑页不拆组件，表单字段直接写。

### 9.5 图标

新增 11 个 SVG：

```
assets/expense-icons/
├── diaper.svg      # 纸尿裤
├── formula.svg     # 奶粉
├── food.svg        # 辅食
├── feeding.svg     # 喂养用品
├── clothing.svg    # 衣物
├── toy.svg         # 玩具绘本
├── medical.svg     # 医疗疫苗
├── daily.svg       # 洗护日用
├── travel.svg      # 出行大件
├── other.svg       # 其他
└── wallet.svg      # 我的页入口
```

规格：24×24，线宽 1.7，`stroke-linecap="round"`，与 `assets/tool-icons` 一致。不要用 emoji。

### 9.6 「我的」页入口

在 `apps/client/src/pages/mine/index.tsx` 的「宝贝与家庭」卡片里，插在「成长纪念册」之后：

```tsx
<View className="mine-item" onClick={() => Taro.navigateTo({ url: '/pages/expense/index' })}>
  <View className="mi-icon mi-icon-3">
    <Image className="mi-icon-img" src={walletIcon} />
  </View>
  <View className="mi-copy">
    <Text className="mi-title">养娃账本</Text>
    <Text className="mi-sub">纸尿裤、奶粉花了多少，心里有数</Text>
  </View>
  <View className="mi-right"><Text className="mi-arrow">›</Text></View>
</View>
```

不显示「本月 ¥X」徽章：那需要在「我的」页额外拉一次汇总，收益不值。

### 9.7 导出复用

复用「我的」页现有导出流程（`Taro.env.USER_DATA_PATH` + `writeFileSync(..., 'base64')` + `openDocument`）。建议先复制这 20 行到 `pages/expense/index.tsx`，**不要为了这次需求重构已上线的记录导出**；等账本稳定后再抽 `utils/exportXlsx.ts`。

### 9.8 埋点

| 事件 | 时机 | 属性 |
|---|---|---|
| `tool_view` | 账本首页到达 | `{ name: 'expense' }` |
| `expense_add` | 保存成功 | `{ category }`（**绝不带金额/项目名/备注**） |
| `expense_export` | 导出成功 | `{ days }`（不带金额） |

`tool_view` 让后台「小应用」页自动出现 `expense` 这一行（现有 `loadToolsMetrics` 按 `properties.name` 分组）。如果 V1 只放「我的」入口、没有 `tool_click`，`tool_view` 仍能统计到页面到达。

另外在 `apps/server/src/modules/admin/admin-stats.service.ts` 的 `TOOL_LABELS` 补一行：

```ts
expense: '养娃账本',
```

否则后台明细会显示原始 key `expense`。

---

## 10. 统计口径与边界

| 场景 | 处理 |
|---|---|
| 当前月 | 日均 = 总额 / 今天几号；趋势柱到当前月为止 |
| 历史月 | 日均 = 总额 / 该月天数 |
| 未来月 | 前端禁用；服务端 400 |
| 上月无数据 | `deltaPercent = null`，显示「上月无记录」 |
| 本月无数据 | 汇总卡显示 ¥0.00；分类卡不渲染；空态出现 |
| 同一天多笔 | 列表按 `createdAt DESC` 排；日期头小计求和 |
| 金额 0.1 + 0.2 | 服务端 SQL 求和；客户端分组小计用 `round2` |
| 闰年 2 月 | 月区间用闭开区间，不依赖 `LAST_DAY` |
| 时区 | 全部用本地日历日字符串；不 `new Date('YYYY-MM-DD')` |
| 跨年 | `2026-12` 的下一月是 `2027-01`；趋势标签按年补 |
| 分类删除/改名 | V1 分类固定；未来加分类只改 shared，旧数据 code 不变 |
| 未知分类 code | 导出/展示回退「其他」，不崩 |

---

## 11. 权限、隐私与合规

### 11.1 家庭可见性

- 所有家庭成员（owner / editor / viewer）都能看、能记；账本按家庭共享
- 不想让某个成员看到，只能把 TA 移出家庭（账本不单独做可见性开关）
- 页面文案：「账本仅对家庭成员开放」；不要写「你没有权限」这种冷冰冰的系统话

### 11.2 后台隐私边界

沿用 2026-09-07 确立的分级：

- **后台永远不展示单笔金额、项目名、备注**
- 只统计聚合使用量：记账用户数、记账笔数、导出次数、分类分布（可选）
- 埋点属性不带金额；`user_events` 里不能出现 `amount` / `itemName` / `note`
- 不做「按用户查账本」的后台入口；如果未来排障需要，必须走「按 ID + 审计日志」的既有流程，且优先级最低

### 11.3 隐私政策

在 `pages/privacy` 增加一段：

> 为帮助你记录育儿开销，我们会保存你主动填写的花费金额、分类、日期、项目名称和备注。这些数据仅用于向你展示统计和导出，不会进入后台个体查询，也不会提供给第三方。你邀请加入家庭的成员都可以查看和记录账本；如果不想让某人看到，请将 TA 移出家庭。

### 11.4 内容安全

- `itemName` / `note` 走 `msgSecCheck`（默认 scene 2，与记录备注一致）
- 分类是固定枚举，不检查
- 金额是数字，不检查

### 11.5 数据删除

- 删宝宝：同事务删除该宝宝全部 expenses
- 注销账号：删除名下宝宝的全部 expenses；在别人家宝宝上记的 expenses 保留，`actor_user_id` 置空
- 导出文件在用户手机本地，服务端不留副本

---

## 12. 发布与迁移

### 12.1 SQL

新增 `docs/sql/expense-2026-11.sql`（内容见 §6.1），幂等：`CREATE TABLE IF NOT EXISTS`。

### 12.2 环境变量

**无新增。**

### 12.3 部署顺序

1. `bash backup-db.sh pre-deploy`
2. `bash run-sql.sh docs/sql/expense-2026-11.sql`
3. `bash server.sh`（会同时构建管理后台；本轮 admin 无代码改动）
4. `bash mini.sh <版本号> "养娃账本：记录纸尿裤、奶粉等育儿花费"`

服务端先上：新接口对老客户端无影响；小程序随后发，入口才出现。没有双向 breaking 的改动。

### 12.4 发版清单

实现时在 `docs/releases/` 新建 `YYYY-MM-DD-HHMM-release-checklist.md`（按实际发版日期命名），登记：

- [ ] 生产 SQL：`docs/sql/expense-2026-11.sql` + `bash run-sql.sh` 命令
- [ ] 无新增 .env
- [ ] 部署顺序（备份 → SQL → server → mini）
- [ ] 真机回归检查项（见 §13.3）
- [ ] 包体积检查（主包 < 2048 KB）

### 12.5 包体积

- 2 个页面 + 11 个 SVG ≈ 30–40 KB
- 当前主包约 1552 KB（2026-11-09 数据），余量约 496 KB，足够
- 不引入图表库、不引入日期库、不引入记账 SDK

### 12.6 回滚

- 客户端：入口去掉即可，页面代码留着不影响
- 服务端：接口可保留；表**不要删**（删表等于删用户数据）
- 如果必须下线：先隐藏入口，观察一周，再决定是否保留接口

---

## 13. 验证方案

按项目约定：**不引入自动化测试框架**，用 `/tmp/verify-*` 打桩脚本 + 真机回归。

### 13.1 服务层打桩（`/tmp/verify-expense-service.cjs`）

| # | 用例 | 期望 |
|---|---|---|
| 1 | 金额 0 | 400 |
| 2 | 金额 -1 | 400 |
| 3 | 金额 12.345 | 400 |
| 4 | 金额 0.01 | 通过 |
| 5 | 金额 999999.99 | 通过 |
| 6 | 金额 1000000 | 400 |
| 7 | 分类 `diaper` | 通过 |
| 8 | 分类 `unknown` | 400 |
| 9 | 日期今天 | 通过 |
| 10 | 日期明天 | 400 |
| 11 | 日期 `2026-02-30` | 400 |
| 12 | 空月份汇总 | total=0, count=0, byCategory=[] |
| 13 | 单分类汇总 | 金额/占比正确 |
| 14 | 多分类排序 | 金额降序 |
| 15 | 上月为 0 | deltaPercent=null |
| 16 | 当前月日均 | total / 今天几号 |
| 17 | 历史月日均 | total / 当月天数 |
| 18 | 近 6 月补 0 | 长度 6，缺失月 total=0 |
| 19 | owner 读 | 通过 |
| 20 | editor 读 | 通过 |
| 21 | viewer 读 | 通过 |
| 22 | 非成员读 | 403 |
| 23 | viewer 写 | 通过 |
| 24 | 内容安全命中 | 400，不落库 |
| 25 | 删除宝宝 | expenses 清空 |
| 26 | 注销账号 | 名下 expenses 删除、外部 actor 置空、计数一致 |
| 27 | 导出 1 行 | xlsx 可解压，列正确 |
| 28 | 导出 5001 行 | truncated=true |
| 29 | 导出 367 天 | 400 |

### 13.2 接口打桩（`/tmp/verify-expense-api.cjs`）

真 HTTP + 本地真库，覆盖：

- 创建 → 列表 → 汇总 → 编辑 → 删除 全链路
- 月份切换、分类筛选、分页
- owner/editor/viewer/非成员 权限矩阵（viewer 可读可写，非成员 403）
- xlsx 解压 + 独立解析回读（复用记录导出的校验脚本思路）
- 删除宝宝后接口 404 / 列表空
- 注销预览计数与实际删除量一致

脚本带安全闸门：`DB_HOST` / `API_BASE_URL` 非本机直接中止（参照 `check:family` 的做法）。

### 13.3 真机回归清单

- [ ] 「我的」页入口可见，点击进入账本
- [ ] 首次进入空态正确，点「记一笔」进编辑页
- [ ] 金额键盘、小数位、超限提示正常
- [ ] 分类默认「纸尿裤」，选其他分类后保存，再进默认上次分类
- [ ] 日期默认今天，不能选未来
- [ ] 保存成功返回，列表和汇总立即更新
- [ ] 编辑金额后汇总/分类占比同步变化
- [ ] 删除有二次确认，删除后列表更新
- [ ] 月份左右切换、未来月置灰
- [ ] 分类行点击筛选、取消筛选
- [ ] 近 6 个月柱子点击切月
- [ ] 导出当前月，iOS/Android 都能用 `openDocument` 打开 xlsx
- [ ] 只读家庭成员能正常进入、记账；非家庭成员显示「账本仅对家庭成员开放」，不出现全局报错 toast
- [ ] 可编辑家庭成员能正常记账
- [ ] 切换宝宝后账本数据跟着切换
- [ ] 删除宝宝后账本数据清空
- [ ] 注销账号预览里能看到账本笔数
- [ ] 后台「小应用」页能看到 `expense` 使用行，且没有金额字段
- [ ] 主包体积 < 2048 KB

### 13.4 构建验证

```bash
pnpm build:shared
pnpm build:server     # nest build
pnpm build:admin      # 本轮无改动，确认不被带坏
pnpm build:client     # taro build
```

- 服务端 `nest build` 通过不等于实体元数据正确（项目踩过坑）：本地起一次临时端口，确认 `expenses` 表能查、接口不报 `DataTypeNotSupportedError`
- 客户端 tsc 与改动前基线逐条对齐，0 新增错误
- 产物 grep 确认 `pages/expense/index`、`养娃账本`、`expense-icons` 都在 dist

---

## 14. 工作量与排期

| 阶段 | 内容 | 预估 |
|---|---|---|
| 1 | shared 分类/类型 + 构建 | 0.25 天 |
| 2 | 服务端 module/entity/DTO/service/controller/export | 1 天 |
| 3 | SQL + 删宝宝/注销账号集成 | 0.25 天 |
| 4 | 客户端账本首页 + 编辑页 + 入口 + 路由 | 1 天 |
| 5 | 11 个 SVG + 视觉打磨 | 0.5 天 |
| 6 | 打桩验证 + 构建 + 发版清单 | 0.5 天 |
| **合计** | | **约 3–3.5 天** |

V1.1（预算）再加 0.5–1 天；V2（收据照片/付款人/单价）再加 1.5–2 天。

---

## 15. 待拍板问题

| # | 问题 | 推荐 | 备选 |
|---|---|---|---|
| 1 | 名字 | **养娃账本** | 育儿花费 / 花费记录 |
| 2 | 家人可见性 | **所有家庭成员（含 viewer）都能看能记** | 仅 owner（更私密，需改代码） |
| 3 | 预算 | **V1.1 再做** | V1 就做（+0.5–1 天） |
| 4 | 收据照片 | **V2** | V1（增加图片合规/存储） |
| 5 | 入口 | **我的页** | 加发现页宫格（第 9 格会换行） |
| 6 | 付款人 | **V2** | V1（家庭场景可能需要） |
| 7 | 导出范围上限 | **366 天** | 31 天（与记录导出一致） |

如果只确认一件事：**名字用「养娃账本」，权限用「所有家庭成员都能看能记」，V1 不做预算和收据**，就可以按本方案开工。

---

## 16. 备选方案与否决记录

### 16.1 作为第 12 种记录类型

**否决**。理由见 §1.2：污染 streak/统计/周报，`amount` 语义冲突，统计页 tab 已明确不扩。

### 16.2 只做本地 storage

**否决**。换设备/清缓存即丢；家庭 editor 无法共享；与「记录越久越有信任」的方向相反。

### 16.3 只做 Excel 导出，不做页面

**否决**。手机上记一笔的摩擦太大；没有月度汇总就没有「心里有数」的价值。

### 16.4 接第三方记账 App / API

**否决**。没有稳定开放接口；多一个外部依赖；个人主体不适合。

### 16.5 预算放 V1

**当时暂缓，2026-11-21 已作为 V1.1 实现**。预算是「记账 App」的延伸，不是首版核心；先把「记 + 看」跑通，随后追加了预算进度（不带推送、不做按月单独预算）。

### 16.6 收据照片放 V1

**暂缓**。收据是财务凭证，涉及图片内容安全、存储成本、隐私说明；V1 用 `itemName + note` 足够。

---

## 17. 成功标准

上线 4 周后看：

| 指标 | 目标 | 达不到怎么办 |
|---|---|---|
| 记账用户 / 周活 | ≥ 10% | 保持个人工具定位，不再加预算/照片 |
| 人均每周笔数 | ≥ 2 | 检查入口和 3 秒流程 |
| 导出使用率 | ≥ 5% | 可接受，导出是低频信任功能 |
| 次月仍记账 | ≥ 50% | 说明是真实需求，继续投入 V1.1 |
| 主包体积 | < 2048 KB | 压图标/走 CDN |

如果 4 周后只有开发者自己用：**也成立**。这就是一个个人向功能，判断标准是「你自己是否愿意持续用」，不是 DAU。不要因为它数据不好看就删掉——它不占首页、不影响主路径、维护成本极低。

---

## 18. 一页纸总结

- **定位**：个人向育儿花费账本，独立模块，不做第 12 种记录类型
- **核心流程**：我的 → 养娃账本 → 记一笔（金额 + 分类 + 保存）→ 月度汇总/预算/分类/趋势/年度累计 → 导出 Excel
- **数据**：`expenses` + `expense_budgets` 两张表，10 个固定分类，金额 `decimal(10,2)`，日期 `date`，数量/单位选填
- **接口**：7 个 REST 接口 + 1 个导出；家庭成员（owner/editor/viewer）都可看可记，预算也可设/清
- **页面**：2 个页面；纯 DOM 图表，不引入新依赖；11 个 SVG；预算弹层；记录人标签；单价自动算
- **隐私**：后台永不看单笔金额；埋点不带金额；隐私政策补一段
- **发布**：先 SQL → server → mini；无 env；主包约 +40 KB
- **工作量**：约 4 天（含 V1.1 预算 + 数量/单位 + 记录人）
- **先不做**：收据照片、付款人、周期账单、多币种

---

## 19. 实现记录（2026-11-21）

### 已落地

- `packages/shared/src/expense.ts`：10 个分类、前后端共享类型（数量/单位、记录人、预算信息）
- `apps/server/src/modules/expense/`：entity / DTO / service / controller / module（含 `expense_budgets`）
- `docs/sql/expense-2026-11.sql`：生产建表 SQL（两张表，幂等）
- `apps/client/src/pages/expense/index|edit`：账本首页 + 记一笔/编辑页（预算弹层、记录人标签、单价、数量/单位）
- `apps/client/src/assets/expense-icons/`：10 个分类图标 + 钱包 + 空态插画
- 「我的」页入口、「app.config.ts」路由、「privacy」政策补充
- 删宝宝 / 注销账号级联（含预算表）、后台注销计数与 `TOOL_LABELS`
- 埋点：`tool_view{name:'expense'}` / `tool_click{name:'expense'}` / `expense_add{category}` / `expense_export{month}`，均不带金额

### 验证结果

- `pnpm build:shared` / `build:server` / `build:admin` / `build:client` 全过
- 服务层真库 smoke：27 项通过（金额/分类/日期/数量单位/列表/汇总/预算/年度累计/更新/删除/导出/xlsx）
- HTTP API smoke：42 项通过（含 400 校验、分页、分类筛选、预算设置/清除、年度累计、记录人昵称、导出）
- viewer 家庭成员 API：6 项通过（可看、可记、可设/清预算、可删自己记的）
- 客户端 tsc：新增文件 0 错误（基线 92 条来自 node_modules / 历史页面）
- 主包：1640 KB（上限 2048 KB，余量约 408 KB）

### 待真机验收

- iOS / Android 打开导出的 xlsx（含数量/单位/单价列）
- 金额键盘、分类宫格、预算弹层在小屏的点击区域
- 长列表滚动、月份切换、分类筛选
- 数量/单位保存后单价显示正确
- 家庭成员记的账显示「XX记的」，自己的记录不显示
- 家庭成员（viewer）在真机上能正常进入、记账、设预算
- 空态插画、钱包图标、分类图标在真机的显示