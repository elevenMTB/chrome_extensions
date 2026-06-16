# Duplicate Tab Resolver 二期技术方案

## 1. 文档目标

这份文档是二期迭代规划的技术落地版。

如果上一份《二期迭代规划》回答的是“二期做什么”，那么这份文档回答的是：

> 二期的核心能力应该如何设计、如何存储、如何串进现有代码、以及关键流程伪代码怎么写。

本文件重点展开 3 个主题：

- `actionHistory` 数据结构设计
- 撤销逻辑的技术边界与伪代码
- 白名单优先级及其实现方式

同时也会补充：

- 设置模型扩展
- 存储结构
- 后台处理链路调整
- 设置页需要增加的模块

## 2. 设计前提

二期设计建立在当前一期实现基础上。

当前一期已有能力：

- MV3 插件骨架
- `service worker` 自动处理重复标签页
- 3 个默认策略
- 黑名单规则
- 设置页保存基础配置
- URL 过滤和基础并发保护

二期不推翻这套结构，而是在它上面增量扩展。

### 二期核心目标

二期主要解决下面两个体验问题：

1. 用户不知道插件刚刚做了什么
2. 用户发现处理不合适时，没有恢复手段

对应的技术设计重点就是：

- 记录自动处理行为
- 提供有限、可解释的撤销能力
- 增加白名单让规则控制更完整

## 3. 二期能力范围

二期建议包含以下能力：

- 扩展设置结构，加入白名单和历史相关配置
- 引入 `actionHistory`
- 支持最近一次自动处理记录展示
- 支持撤销最近一次可撤销处理
- 支持白名单规则
- 在设置页中展示最近记录，并提供撤销入口

二期暂不包含：

- 忽略 query / hash 比较
- 当前窗口范围限制
- 站点级单独策略
- 页面内提示条
- 系统通知
- 完整统计系统

## 4. 现有结构与二期扩展方向

当前目录里已经有以下主要模块：

- `service-worker.js`
- `settings-store.js`
- `url-rules.js`
- `duplicate-detector.js`
- `tab-actions.js`
- `options.js`

二期建议扩展为：

- `history-store.js`
  - 负责 `actionHistory` 的读写、裁剪、撤销状态判断
- `undo-actions.js`
  - 负责撤销逻辑

如果你想继续控制文件数量，也可以先不拆新文件，而是按逻辑分别加进现有模块：

- `settings-store.js` 管设置
- `history-store.js` 管历史
- `service-worker.js` 串联流程
- `options.js` 管设置页

## 5. 设置模型扩展

当前一期设置结构大致是：

```text
settings = {
  enabled,
  duplicateStrategy,
  blacklist,
  scope
}
```

二期建议扩展为：

```text
settings = {
  enabled,
  duplicateStrategy,
  blacklist,
  whitelist,
  scope,
  undoWindowSeconds,
  maxActionHistory
}
```

## 6. 设置字段说明

### `enabled`

- 插件总开关

### `duplicateStrategy`

- 默认处理动作
- 保持一期的 3 种策略不变

### `blacklist`

- 命中后跳过自动处理

### `whitelist`

- 命中后优先跳过自动处理
- 优先级高于黑名单

### `scope`

- 当前仍建议固定为 `all_windows`
- 二期不扩展当前窗口模式

### `undoWindowSeconds`

- 撤销有效时间窗口
- 建议默认值：`60`

### `maxActionHistory`

- 最多保留的处理记录条数
- 建议默认值：`10`

## 7. 默认设置建议

```text
DEFAULT_SETTINGS = {
  enabled: true,
  duplicateStrategy: "activate_existing_close_new",
  blacklist: [],
  whitelist: [],
  scope: "all_windows",
  undoWindowSeconds: 60,
  maxActionHistory: 10
}
```

### 为什么 `undoWindowSeconds` 要可配置

因为不同用户对“撤销窗口”的容忍度不同：

- 有人想短一点，避免历史太久后误操作
- 有人希望稍微长一点，留出反应时间

但二期不建议把它做得太复杂，设置页里给一个简单数值或下拉选择就够了。

## 8. `actionHistory` 的设计目标

`actionHistory` 不是日志系统，也不是分析系统。

它的设计目标只有两个：

1. 让用户知道最近发生了什么
2. 给“撤销最近一次自动处理”提供数据基础

所以它应该具备这几个特点：

- 结构明确
- 能表达“做了什么”
- 能表达“能不能撤销”
- 数量小，便于本地存储
- 不追求复杂检索和统计

## 9. `actionHistory` 顶层存储结构

建议仍然使用 `chrome.storage.local`，并把历史记录独立存储。

建议键名：

```text
settings
actionHistory
```

历史记录结构建议为数组：

```text
actionHistory = [
  ActionRecord,
  ActionRecord,
  ...
]
```

建议数组顺序：

- 最新记录放在最前面

这样设置页展示和“撤销最近一次处理”都会更直接。

## 10. `ActionRecord` 数据结构设计

建议二期定义一个固定结构的记录对象：

```text
ActionRecord = {
  id,
  timestamp,
  strategy,
  status,
  currentTabId,
  currentTabUrl,
  existingTabId,
  existingTabUrl,
  affectedWindowId,
  closedTabId,
  closedTabUrl,
  activatedTabId,
  undoable,
  undoStatus,
  undoableUntil,
  undoOpenedTabId,
  errorMessage
}
```

## 11. `ActionRecord` 字段说明

### `id`

- 记录唯一标识
- 建议用时间戳加随机后缀生成
- 用于设置页定位、撤销目标识别

### `timestamp`

- 自动处理发生的时间
- 建议使用毫秒时间戳

### `strategy`

- 本次执行的默认策略
- 取值：
  - `activate_existing_close_new`
  - `close_old_keep_new`
  - `keep_both`

### `status`

- 表示这次处理本身是否成功
- 建议值：
  - `success`
  - `failed`
  - `skipped`

对于二期历史来说，通常只需要记录真正执行过动作的项目，但保留 `failed` 值会更便于调试。

### `currentTabId`

- 当前触发处理的新标签页 id

### `currentTabUrl`

- 当前触发处理的新标签页 URL

### `existingTabId`

- 匹配到的旧标签页 id

### `existingTabUrl`

- 匹配到的旧标签页 URL

### `affectedWindowId`

- 本次实际影响到的窗口 id
- 主要用于激活已有标签页的场景

### `closedTabId`

- 本次被关闭的 tab id
- 如果没有关闭任何 tab，可为 `null`

### `closedTabUrl`

- 被关闭 tab 的 URL
- 撤销逻辑主要依赖这个字段恢复页面入口

### `activatedTabId`

- 本次被激活的 tab id
- 如果没有激活操作，可为 `null`

### `undoable`

- 这条记录是否允许撤销
- 布尔值

### `undoStatus`

- 表示撤销状态
- 建议值：
  - `pending`
  - `expired`
  - `done`
  - `not_supported`
  - `failed`

### `undoableUntil`

- 撤销截止时间
- 毫秒时间戳
- 若不可撤销可为 `null`

### `undoOpenedTabId`

- 用户撤销后重新打开的新标签页 id
- 仅用于记录撤销结果

### `errorMessage`

- 处理失败或撤销失败时的错误信息
- 面向调试，不必在 UI 中完整暴露

## 12. 为什么 `closedTabUrl` 是撤销的关键字段

二期撤销并不是“恢复原始 tab 对象”，而是：

> 重新打开之前被关闭的那个页面 URL。

所以最关键的数据其实不是：

- 原 tab 的全部状态

而是：

- 被关闭页面的 URL

因此，只要确保每次有关闭行为时，都把 `closedTabUrl` 写进记录，二期撤销就有落点。

## 13. 各策略下的记录写入规则

### 策略 A：`activate_existing_close_new`

建议记录：

- `currentTabId`: 新标签页 id
- `currentTabUrl`: 新标签页 URL
- `existingTabId`: 旧标签页 id
- `existingTabUrl`: 旧标签页 URL
- `activatedTabId`: 旧标签页 id
- `closedTabId`: 新标签页 id
- `closedTabUrl`: 新标签页 URL
- `undoable`: `true`
- `undoStatus`: `pending`

### 策略 B：`close_old_keep_new`

建议记录：

- `currentTabId`: 新标签页 id
- `currentTabUrl`: 新标签页 URL
- `existingTabId`: 旧标签页 id
- `existingTabUrl`: 旧标签页 URL
- `activatedTabId`: `null`
- `closedTabId`: 旧标签页 id
- `closedTabUrl`: 旧标签页 URL
- `undoable`: `true`
- `undoStatus`: `pending`

### 策略 C：`keep_both`

建议记录方式二选一：

1. 不写入历史
2. 写入一条 `status=skipped` 且 `undoable=false` 的记录

二期我更建议第 2 种：

- 设置页可以完整展示“检测到了，但按策略保留两个”
- 用户更容易理解插件行为

## 14. `actionHistory` 的读写策略

建议统一封装成独立模块，例如：

- `loadActionHistory()`
- `saveActionHistory(records)`
- `appendActionRecord(record, maxCount)`
- `markActionUndoDone(recordId, openedTabId)`
- `expireUndoableRecords(now)`

### 关键要求

- 所有写入都通过统一函数
- 写入前做结构补全和裁剪
- 自动只保留最新 N 条

## 15. 追加历史记录伪代码

```ts
async function appendActionRecord(record, maxCount):
  history = await loadActionHistory()

  nextHistory = [record, ...history]
  nextHistory = nextHistory.slice(0, maxCount)

  await chrome.storage.local.set({
    actionHistory: nextHistory
  })
```

### 为什么最新记录放前面

因为：

- 设置页展示最近记录最自然
- “撤销最近一次处理”只需要取第一条可撤销记录

## 16. 记录标准化建议

为了避免历史结构越来越乱，建议对记录也做标准化。

例如：

- 缺失字段自动补 `null`
- `undoable` 统一转布尔
- `undoableUntil` 统一转时间戳或 `null`
- 不合法 `status` 自动回退

这样可以避免设置页因为历史字段不完整而报错。

## 17. 撤销能力的设计原则

二期撤销逻辑必须坚持下面几个原则：

- 只支持最近一次可撤销记录
- 只支持在有效时间窗口内撤销
- 撤销目标是“重新打开页面”，不是“恢复完整 tab 状态”
- 一次记录只能撤销一次
- `keep_both` 默认不支持撤销

## 18. 哪些记录允许撤销

建议判定条件如下：

一条记录可撤销，当且仅当：

- `status === "success"`
- `undoable === true`
- `undoStatus === "pending"`
- `closedTabUrl` 非空
- 当前时间未超过 `undoableUntil`

如果不满足任一条件：

- 不允许撤销

## 19. 撤销逻辑的实际目标

对于二期来说，撤销的真正行为应定义为：

> 从最近一次可撤销记录中取出 `closedTabUrl`，重新打开一个新标签页指向该 URL，并更新历史记录状态。

这一定义有几个好处：

- 非常清晰
- 与当前结构兼容
- 成功率高
- 容易解释

## 20. 撤销主流程伪代码

```ts
async function undoLatestAction():
  settings = await loadSettings()
  history = await loadActionHistory()
  now = Date.now()

  history = expireUndoableRecords(history, now)

  target = findFirstUndoableRecord(history, now)

  if target is null:
    return {
      ok: false,
      reason: "no_undoable_record"
    }

  if target.closedTabUrl is empty:
    return {
      ok: false,
      reason: "missing_closed_tab_url"
    }

  try:
    reopenedTab = await chrome.tabs.create({
      url: target.closedTabUrl,
      active: true
    })

    updatedHistory = markUndoDone({
      history,
      recordId: target.id,
      reopenedTabId: reopenedTab.id,
      now
    })

    await saveActionHistory(updatedHistory)

    return {
      ok: true,
      reopenedTabId: reopenedTab.id,
      recordId: target.id
    }
  catch (error):
    updatedHistory = markUndoFailed({
      history,
      recordId: target.id,
      errorMessage: stringifyError(error)
    })

    await saveActionHistory(updatedHistory)

    return {
      ok: false,
      reason: "undo_failed"
    }
```

## 21. 撤销辅助函数伪代码

### 查找最近一条可撤销记录

```ts
function findFirstUndoableRecord(history, now):
  for each record in history:
    if record.status not equals "success":
      continue
    if record.undoable is not true:
      continue
    if record.undoStatus not equals "pending":
      continue
    if record.closedTabUrl is empty:
      continue
    if record.undoableUntil is null:
      continue
    if now > record.undoableUntil:
      continue
    return record

  return null
```

### 将过期记录标记为过期

```ts
function expireUndoableRecords(history, now):
  changed = false

  nextHistory = history.map((record) => {
    if (
      record.undoable === true &&
      record.undoStatus === "pending" &&
      record.undoableUntil is not null &&
      now > record.undoableUntil
    ):
      changed = true
      return {
        ...record,
        undoStatus: "expired"
      }

    return record
  })

  return nextHistory
```

### 撤销成功后标记状态

```ts
function markUndoDone({ history, recordId, reopenedTabId, now }):
  return history.map((record) => {
    if record.id not equals recordId:
      return record

    return {
      ...record,
      undoStatus: "done",
      undoOpenedTabId: reopenedTabId ?? null,
      undoCompletedAt: now
    }
  })
```

### 撤销失败后标记状态

```ts
function markUndoFailed({ history, recordId, errorMessage }):
  return history.map((record) => {
    if record.id not equals recordId:
      return record

    return {
      ...record,
      undoStatus: "failed",
      errorMessage
    }
  })
```

## 22. 为什么不直接“恢复原 tab”

因为 Chrome 插件里你拿不到一个已经关闭 tab 的“可恢复快照对象”。

即使能通过某些方式恢复历史会话，也会带来很多问题：

- 与当前实现耦合太高
- 浏览器行为不完全可控
- 多窗口和复杂站点下恢复语义不清楚

所以二期正确做法是：

- 明确只恢复页面入口

这是一个技术上更稳、产品上也能解释清楚的方案。

## 23. 白名单设计目标

白名单存在的意义不是“做更复杂的规则系统”，而是：

> 给用户一个高优先级放行机制，让某些站点完全不参与自动去重。

典型场景包括：

- 多账号登录网站
- 同 URL 但页面状态依赖前端内存的网站
- 调试类页面
- 用户明确希望重复打开的站点

## 24. 白名单数据结构

建议复用黑名单的数据模型：

```text
whitelist: string[]
```

支持规则：

- `example.com`
- `*.example.com`
- `localhost`
- `127.0.0.1`

这样可以直接复用：

- 规则标准化
- hostname 匹配逻辑
- 设置页多行输入方式

## 25. 白名单优先级建议

引入白名单后，规则优先级必须固定下来。

建议优先级如下：

1. 插件总开关
2. URL 是否可处理
3. 白名单
4. 黑名单
5. 重复检测
6. 默认策略执行
7. 写入历史记录

### 核心原则

> 白名单优先于黑名单。

如果某个域名同时命中白名单和黑名单：

- 按白名单处理
- 即：跳过自动处理

## 26. 为什么白名单优先于黑名单

原因有三个：

### 原因 1：语义更强

白名单更像用户明确给出的“允许重复打开”的强意图。

### 原因 2：更符合直觉

用户通常会认为：

- “我特意加白名单了，就应该放行”

### 原因 3：可解释性更好

在设置页文案中更容易解释：

- 白名单优先
- 黑名单是普通排除规则

## 27. 白名单与黑名单判定伪代码

```ts
function shouldSkipAutoHandling(urlString, settings):
  if isProcessableUrl(urlString) is false:
    return {
      skip: true,
      reason: "unprocessable_url"
    }

  if matchesRuleList(urlString, settings.whitelist):
    return {
      skip: true,
      reason: "whitelisted"
    }

  if matchesRuleList(urlString, settings.blacklist):
    return {
      skip: true,
      reason: "blacklisted"
    }

  return {
    skip: false,
    reason: null
  }
```

### 规则匹配复用建议

当前一期已经有黑名单匹配逻辑，二期应把它抽象为通用函数，例如：

- `matchesRuleList(urlString, rules)`

然后：

- 白名单调用同一套匹配函数
- 黑名单也调用同一套匹配函数

这样二期新增白名单时，不需要重复造一套规则系统。

## 28. 后台主流程调整建议

当前一期后台流程大致是：

- 读取设置
- URL 过滤
- 黑名单判断
- 重复检测
- 执行默认策略

二期建议调整为：

```text
tabs.onUpdated
    ↓
load settings
    ↓
判断插件是否启用
    ↓
shouldSkipAutoHandling(url, settings)
    ↓
若 skip，则结束
    ↓
findDuplicateTab(...)
    ↓
若无重复，则结束
    ↓
executeDuplicateStrategy(...)
    ↓
buildActionRecord(...)
    ↓
appendActionRecord(...)
```

## 29. 后台处理链路伪代码

```ts
async function handleTabUpdated(tabId, changeInfo, tab):
  if event is not relevant:
    return

  if processingTabIds contains tabId:
    return

  processingTabIds.add(tabId)

  try:
    settings = await loadSettings()

    if settings.enabled is false:
      return

    currentUrl = changeInfo.url ?? tab.url

    if currentUrl is empty:
      return

    skipResult = shouldSkipAutoHandling(currentUrl, settings)
    if skipResult.skip:
      return

    match = await findDuplicateTab({
      currentTabId: tabId,
      currentUrl,
      settings
    })

    if match.hasDuplicate is false:
      return

    actionResult = await executeDuplicateStrategy({
      strategy: settings.duplicateStrategy,
      currentTabId: tabId,
      currentUrl,
      existingTabId: match.existingTabId,
      existingTabUrl: match.existingUrl,
      existingWindowId: match.existingWindowId
    })

    record = buildActionRecord({
      actionResult,
      currentTabId: tabId,
      currentUrl,
      match,
      settings,
      now: Date.now()
    })

    await appendActionRecord(record, settings.maxActionHistory)
  catch (error):
    log("phase 2 handling failed", error)
  finally:
    processingTabIds.delete(tabId)
```

## 30. `executeDuplicateStrategy` 的返回值调整建议

为了支持历史记录写入，二期建议让策略执行函数返回一个结构化结果，而不是只负责执行动作。

建议返回值：

```text
ActionExecutionResult = {
  ok,
  strategy,
  currentTabId,
  currentTabUrl,
  existingTabId,
  existingTabUrl,
  affectedWindowId,
  activatedTabId,
  closedTabId,
  closedTabUrl,
  errorMessage
}
```

这样历史记录构建时就不需要重新猜测刚才做了什么。

## 31. 构建 `ActionRecord` 的伪代码

```ts
function buildActionRecord({ actionResult, currentTabId, currentUrl, match, settings, now }):
  undoable = (
    actionResult.ok === true &&
    actionResult.strategy not equals "keep_both" &&
    actionResult.closedTabUrl is not empty
  )

  return {
    id: createRecordId(now),
    timestamp: now,
    strategy: actionResult.strategy,
    status: actionResult.ok ? "success" : "failed",
    currentTabId: currentTabId ?? null,
    currentTabUrl: currentUrl ?? null,
    existingTabId: match.existingTabId ?? null,
    existingTabUrl: match.existingUrl ?? null,
    affectedWindowId: actionResult.affectedWindowId ?? null,
    closedTabId: actionResult.closedTabId ?? null,
    closedTabUrl: actionResult.closedTabUrl ?? null,
    activatedTabId: actionResult.activatedTabId ?? null,
    undoable,
    undoStatus: undoable ? "pending" : "not_supported",
    undoableUntil: undoable ? now + settings.undoWindowSeconds * 1000 : null,
    undoOpenedTabId: null,
    errorMessage: actionResult.errorMessage ?? null
  }
```

## 32. 设置页二期改造建议

二期设置页建议新增下面这些区域：

### 基础设置区

- 插件总开关
- 默认策略
- 撤销窗口秒数
- 最大历史记录数量

### 规则设置区

- 白名单输入框
- 黑名单输入框
- 规则优先级说明

### 最近处理区

- 最近处理记录列表
- 每条记录显示：
  - 时间
  - 策略
  - 被关闭的 URL
  - 撤销状态
- 一个“撤销最近一次处理”按钮

## 33. 设置页中的记录展示建议

二期不需要复杂表格。

建议每条记录只展示最关键的字段：

- 时间
- 策略
- `closedTabUrl`
- `undoStatus`

如果是 `keep_both` 这类没有真正关闭 tab 的记录，可显示：

- “No tab was closed”

## 34. 验收建议

二期技术实现完成后，至少应满足以下验收标准：

### `actionHistory`

- 每次自动处理后，都会生成一条结构完整的记录
- 历史数量超过上限时，旧记录被裁剪
- 设置页能正确读取并显示最近记录

### 撤销逻辑

- 最近一次可撤销记录可被成功撤销
- 撤销会重新打开 `closedTabUrl`
- 撤销成功后 `undoStatus` 更新为 `done`
- 过期记录会变为 `expired`

### 白名单优先级

- 命中白名单的 URL 不进入自动处理
- 命中白名单和黑名单时，按白名单放行
- 黑名单仍对非白名单网址生效

## 35. 最终建议

如果把二期技术方案压缩成一句话，我建议这样理解：

> 二期不是给现有去重逻辑加更多“判断花样”，而是给它补上“记录、回退、强放行”这三种能力。

对应的技术落点就是：

- 用 `actionHistory` 记录结果
- 用 `closedTabUrl` 驱动撤销
- 用白名单优先级保证用户的显式放行意图

---

如果你愿意，下一步我可以继续在 `docs` 下补一份更工程化的文档，例如：

- 二期任务拆分清单
- 二期代码改动点映射
- 二期设置页字段草案
- 二期实现伪代码整合版
