# Tab Group Helper 技术设计文档

## 1. 设计目标

本文档基于 `PRD.md`，用于指导一期 Chrome 插件开发。

一期技术目标：

1. 使用 Chrome Extension Manifest V3 实现本地可用插件。
2. 支持规则管理、自动分组、手动整理和自动分组总开关。
3. 支持同名分组跨窗口策略。
4. 支持历史分组复用和历史标签延迟恢复。
5. 保持数据结构可迁移，方便后续增加正则、导入导出、规则组合逻辑。

## 2. 总体架构

### 2.1 模块划分

```text
tab_group_helper/
  extension/
    manifest.json
    src/
      background/
        service_worker.js
        tab-event-handler.js
        auto-group-engine.js
        group-manager.js
        history-restore-manager.js
        storage.js
        rule-matcher.js
        url-utils.js
        constants.js
      options/
        options.html
        options.css
        options.js
      popup/
        popup.html
        popup.css
        popup.js
      shared/
        schema.js
        chrome-promisify.js
```

说明：

1. `background` 负责插件核心逻辑。
2. `options` 负责规则和全局设置管理。
3. `popup` 负责快速开关和手动整理入口。
4. `shared` 放置跨页面复用的数据结构、常量和工具函数。

### 2.2 运行时架构

```text
Chrome Tabs Events
        |
        v
service_worker.js
        |
        v
tab-event-handler.js
        |
        v
auto-group-engine.js
        |
        +--> rule-matcher.js
        |
        +--> group-manager.js
        |
        +--> history-restore-manager.js
        |
        v
storage.js -> chrome.storage.local
```

### 2.3 页面职责

`service_worker`

1. 注册 Chrome 事件监听。
2. 接收 `options` 和 `popup` 发来的消息。
3. 调用自动分组引擎。
4. 维护短期运行时锁和恢复状态。

`options page`

1. 管理规则列表。
2. 管理规则优先级。
3. 管理全局设置。
4. 保存配置到 `chrome.storage.local`。

`popup`

1. 展示自动分组总开关。
2. 展示当前标签命中的规则和目标分组。
3. 触发整理当前窗口。
4. 触发整理全部窗口。

## 3. Manifest 设计

### 3.1 Manifest V3 示例

```json
{
  "manifest_version": 3,
  "name": "Tab Group Helper",
  "version": "0.1.0",
  "description": "Automatically group Chrome tabs by custom rules.",
  "permissions": [
    "tabs",
    "tabGroups",
    "storage",
    "sessions"
  ],
  "background": {
    "service_worker": "src/background/service_worker.js"
  },
  "options_page": "src/options/options.html",
  "action": {
    "default_popup": "src/popup/popup.html",
    "default_title": "Tab Group Helper"
  }
}
```

### 3.2 权限说明

1. `tabs`：读取标签 URL、标题、窗口、分组信息，并移动标签。
2. `tabGroups`：查询、创建、更新 Chrome 标签分组。
3. `storage`：保存规则、设置、分组快照和标签快照。
4. `sessions`：后续如需读取或辅助恢复关闭的标签时使用，一期可先保留。

## 4. 数据模型

### 4.1 Storage 顶层结构

```json
{
  "schemaVersion": 1,
  "rules": [],
  "settings": {},
  "groupSnapshots": {},
  "restoreState": {}
}
```

### 4.2 Rule

```json
{
  "id": "rule-docs",
  "enabled": true,
  "priority": 10,
  "ruleName": "飞书文档",
  "groupName": "文档",
  "colorMode": "fixed",
  "fixedColor": "blue",
  "matchMode": "OR",
  "conditions": [
    {
      "id": "condition-1",
      "target": "hostname",
      "operator": "contains",
      "value": "larkoffice.com"
    }
  ],
  "createdAt": 1781520000000,
  "updatedAt": 1781520000000
}
```

字段说明：

1. `priority` 数值越小优先级越高。
2. `matchMode` 一期固定为 `OR`。
3. `colorMode` 可选值为 `fixed`、`random`。
4. `fixedColor` 使用 Chrome 支持的分组颜色。

### 4.3 Settings

```json
{
  "autoGroupEnabled": true,
  "sameNameGroupPolicy": "single-instance",
  "historyTabPolicy": "keep",
  "runOnStartup": true,
  "includePinnedTabs": false,
  "manualOrganizeDefaultScope": "current-window"
}
```

字段说明：

1. `autoGroupEnabled` 控制自动分组事件处理，不影响手动整理。
2. `sameNameGroupPolicy` 可选值为 `single-instance`、`multi-instance`。
3. `historyTabPolicy` 可选值为 `keep`、`clear`。
4. `runOnStartup` 控制启动后是否扫描已有打开标签，不主动恢复历史标签。
5. `includePinnedTabs` 一期默认 `false`。
6. `manualOrganizeDefaultScope` 可选值为 `current-window`、`all-windows`。

### 4.4 GroupSnapshot

`groupSnapshots` 使用逻辑分组名作为 key。

```json
{
  "文档": {
    "logicalGroupName": "文档",
    "displayName": "文档",
    "color": "blue",
    "colorLockedByRule": true,
    "lastKnownWindowId": 12,
    "lastKnownGroupId": 34,
    "lastRuleId": "rule-docs",
    "tabs": [
      {
        "url": "https://example.com/doc/1",
        "title": "文档 1",
        "favIconUrl": "https://example.com/favicon.ico",
        "lastSeenAt": 1781520000000
      }
    ],
    "restoredForSession": false,
    "updatedAt": 1781520000000
  }
}
```

说明：

1. `logicalGroupName` 是内部逻辑组名，不包含展示后缀。
2. `displayName` 是写入 Chrome 分组标题的展示名称。
3. `tabs` 只保存可恢复 URL，不保存 `chrome://` 等特殊页面。
4. `restoredForSession` 用于避免同一浏览器会话中重复恢复历史标签。

### 4.5 RestoreState

```json
{
  "sessionId": "session-1781520000000",
  "restoredGroups": {
    "文档": {
      "restoredAt": 1781520000000,
      "triggerTabId": 101,
      "createdTabUrls": [
        "https://example.com/doc/1"
      ]
    }
  }
}
```

用途：

1. 避免分组 A 被命中后反复补开历史标签。
2. 记录恢复来源，便于调试。
3. 浏览器或 service worker 重启后仍能短期识别已恢复过的分组。

## 5. 规则匹配设计

### 5.1 输入数据

匹配前将 Chrome tab 标准化为：

```json
{
  "tabId": 101,
  "windowId": 12,
  "groupId": 34,
  "pinned": false,
  "url": "https://example.com/path?q=1",
  "hostname": "example.com",
  "title": "Example Page"
}
```

### 5.2 特殊页面过滤

以下页面默认不参与自动分组和历史快照：

1. `chrome://`
2. `chrome-extension://`
3. `edge://`
4. `about:`
5. 空 URL

`file://` 一期默认不处理，后续可增加开关。

### 5.3 匹配算法

```text
matchTab(tab, rules):
  normalizedTab = normalizeTab(tab)
  if shouldSkipTab(normalizedTab):
    return null

  enabledRules = rules.filter(enabled).sort(priority asc)
  for rule in enabledRules:
    if matchRule(normalizedTab, rule):
      return rule

  return null
```

`matchRule`：

```text
matchRule(tab, rule):
  for condition in rule.conditions:
    if matchCondition(tab, condition):
      return true
  return false
```

`matchCondition`：

```text
contains: targetValue.includes(value)
startsWith: targetValue.startsWith(value)
endsWith: targetValue.endsWith(value)
equals: targetValue === value
```

一期默认大小写策略：

1. `hostname` 和 `url` 使用小写比较。
2. `title` 保持原文比较。
3. 后续可增加“大小写敏感”开关。

## 6. 自动分组流程

### 6.1 事件入口

监听事件：

1. `chrome.tabs.onCreated`
2. `chrome.tabs.onUpdated`
3. `chrome.tabs.onMoved`
4. `chrome.tabs.onAttached`
5. `chrome.tabs.onRemoved`
6. `chrome.runtime.onStartup`

### 6.2 事件处理策略

`onCreated`

1. 标签刚创建时 URL 可能为空，延迟短时间处理。
2. 若 URL 不可用，等待后续 `onUpdated`。

`onUpdated`

1. 当 `changeInfo.url` 存在时立即处理。
2. 当 `changeInfo.title` 存在时再次处理，支持标题规则命中。
3. 对同一个 `tabId + url + title` 做短期去重。

`onMoved`、`onAttached`

1. 重新判断标签是否需要进入目标分组。
2. 避免跨窗口移动后留在错误分组。

`onRemoved`

1. 更新对应分组快照。
2. 若 `historyTabPolicy` 为 `clear`，可从快照中移除该标签。
3. 若 `historyTabPolicy` 为 `keep`，保留最近可恢复 URL。

`onStartup`

1. 若 `runOnStartup` 为 `true`，扫描当前已打开标签并按规则整理。
2. 不主动恢复任何历史标签。

### 6.3 自动分组主流程

```text
handleTab(tab, source):
  settings = loadSettings()
  if source is auto event and settings.autoGroupEnabled is false:
    return

  normalizedTab = normalizeTab(tab)
  if shouldSkipTab(normalizedTab, settings):
    return

  rule = matchTab(normalizedTab, rules)
  if rule is null:
    return

  targetGroup = ensureTargetGroup(normalizedTab, rule, settings)
  moveTabToGroup(normalizedTab, targetGroup)
  maybeRestoreHistoryTabs(targetGroup, rule, settings, normalizedTab)
  updateGroupSnapshot(targetGroup)
```

## 7. 分组管理设计

### 7.1 ensureTargetGroup

```text
ensureTargetGroup(tab, rule, settings):
  logicalName = rule.groupName

  if settings.sameNameGroupPolicy is single-instance:
    group = findExistingGroupByLogicalNameAcrossWindows(logicalName)
    if group exists:
      return group
    return createGroupInTabWindow(tab, rule, logicalName)

  if settings.sameNameGroupPolicy is multi-instance:
    group = findExistingGroupByLogicalNameInWindow(tab.windowId, logicalName)
    if group exists:
      return group
    return createGroupInTabWindow(tab, rule, logicalName)
```

### 7.2 single-instance 策略

目标：

1. 同名逻辑分组全局只保留一个主分组。
2. 新标签如果在其他窗口命中同名分组，则移动到主分组所在窗口。

主分组选择规则：

1. 优先选择 `groupSnapshots[logicalName].lastKnownGroupId` 对应的仍存在分组。
2. 其次选择当前打开窗口中最早发现的同名分组。
3. 若没有同名分组，则在当前标签所在窗口创建。

如果发现多个同名分组：

1. 选择主分组。
2. 将其他同名分组内的标签迁移到主分组。
3. 更新快照中的 `lastKnownGroupId` 和 `lastKnownWindowId`。

### 7.3 multi-instance 策略

目标：

1. 同一逻辑组名允许在多个窗口存在。
2. 后缀仅用于展示，不改变内部逻辑组名。

展示名生成：

```text
getDisplayName(logicalName, windowIndex):
  if first instance:
    return logicalName
  return `${logicalName}(${windowIndex})`
```

内部快照建议：

1. 逻辑组名仍为 `文档`。
2. 多窗口实例可通过 `instances` 扩展字段保存。
3. 一期如不实现复杂实例管理，可先按窗口维度动态生成展示名。

### 7.4 分组颜色

颜色选择：

1. 如果历史快照中已有颜色，优先使用历史颜色。
2. 如果规则为 `fixed`，使用 `fixedColor`。
3. 如果规则为 `random`，生成随机颜色并写入快照。

Chrome 支持的颜色建议常量：

```js
const GROUP_COLORS = [
  'grey',
  'blue',
  'red',
  'yellow',
  'green',
  'pink',
  'purple',
  'cyan',
  'orange'
];
```

## 8. 历史标签恢复设计

### 8.1 核心语义

历史标签恢复不是启动恢复，而是命中恢复。

触发条件：

1. `historyTabPolicy` 为 `keep`。
2. 当前标签命中规则并复用了或创建了逻辑分组。
3. 该逻辑分组存在历史标签快照。
4. 当前浏览器会话中该逻辑分组尚未执行过恢复。

不触发条件：

1. 浏览器启动但没有用户打开命中该分组的新标签。
2. 自动分组总开关关闭时的自动事件。
3. 固定标签页命中但 `includePinnedTabs` 为 `false`。
4. 历史快照为空。

### 8.2 恢复流程

```text
maybeRestoreHistoryTabs(group, rule, settings, triggerTab):
  if settings.historyTabPolicy is not keep:
    return

  snapshot = loadGroupSnapshot(rule.groupName)
  if snapshot.tabs is empty:
    return

  if restoreState.restoredGroups has rule.groupName:
    return

  urlsToRestore = snapshot.tabs
    .filter(validUrl)
    .filter(notSameAsTriggerTab)
    .filter(notAlreadyOpenInGroup)

  for url in urlsToRestore:
    createdTab = chrome.tabs.create({
      url,
      windowId: group.windowId,
      active: false
    })
    chrome.tabs.group({
      tabIds: createdTab.id,
      groupId: group.id
    })

  markGroupRestored(rule.groupName)
  updateGroupSnapshot(group)
```

### 8.3 去重规则

恢复历史标签时需要去重：

1. 不恢复与触发标签 URL 完全相同的标签。
2. 不恢复目标分组中已存在的 URL。
3. 不恢复当前所有窗口中已经打开且同属该逻辑分组的 URL。
4. 同一快照中重复 URL 只恢复一次。

### 8.4 快照更新

快照更新时机：

1. 标签成功移动到分组后。
2. 历史标签恢复完成后。
3. 标签关闭时。
4. 手动整理完成后。
5. 浏览器启动扫描完成后。

快照内容只保留：

1. 有效 URL。
2. 非特殊页面。
3. 非固定标签页，除非 `includePinnedTabs` 为 `true`。

## 9. 手动整理设计

### 9.1 入口

`popup` 提供两个按钮：

1. 整理当前窗口
2. 整理全部窗口

### 9.2 行为定义

手动整理不受 `autoGroupEnabled` 限制。

原因：

1. 总开关用于暂停自动事件。
2. 用户主动点击整理时，应视为显式执行。

手动整理仍受以下配置影响：

1. `includePinnedTabs`
2. `sameNameGroupPolicy`
3. `historyTabPolicy`
4. 规则启停状态

### 9.3 流程

```text
organize(scope):
  tabs = queryTabs(scope)
  for tab in tabs:
    handleTab(tab, source = manual)
  refreshAllSnapshots()
```

建议：

1. 按窗口顺序和标签位置顺序处理。
2. 对大量标签增加并发限制，避免 Chrome API 调用过密。
3. 手动整理完成后在 popup 展示处理数量。

## 10. Options 页面设计

### 10.1 页面结构

建议一期使用原生 HTML、CSS、JavaScript 实现，降低构建复杂度。

```text
Options Page
  |
  +-- 全局设置
  |     +-- 自动分组总开关
  |     +-- 同名分组策略
  |     +-- 历史标签保留策略
  |     +-- 启动扫描开关
  |     +-- 固定标签处理开关
  |
  +-- 规则列表
        +-- 新增规则
        +-- 编辑规则
        +-- 删除规则
        +-- 启用/禁用
        +-- 上移/下移
        +-- JSON 导入
        +-- JSON 导出
```

### 10.2 保存策略

1. 表单编辑保存在内存草稿中。
2. 点击保存后一次性写入 `chrome.storage.local`。
3. 保存规则后广播 `RULES_UPDATED` 消息给 `service_worker`。
4. `service_worker` 下次处理标签时重新读取最新规则。

### 10.3 数据校验

保存前校验：

1. `ruleName` 不能为空。
2. `groupName` 不能为空。
3. 每条规则至少有一条条件。
4. 条件 `value` 不能为空。
5. `priority` 不重复。
6. `fixed` 模式必须选择颜色。

## 11. Popup 页面设计

### 11.1 展示内容

1. 自动分组总开关。
2. 当前标签 URL。
3. 当前标签命中的规则。
4. 当前标签目标分组。
5. 整理当前窗口按钮。
6. 整理全部窗口按钮。
7. 打开配置页面入口。

### 11.2 消息协议

```json
{
  "type": "SET_AUTO_GROUP_ENABLED",
  "payload": {
    "enabled": true
  }
}
```

```json
{
  "type": "ORGANIZE_TABS",
  "payload": {
    "scope": "current-window"
  }
}
```

```json
{
  "type": "GET_CURRENT_TAB_MATCH"
}
```

## 12. Service Worker 消息协议

### 12.1 消息类型

```js
const MESSAGE_TYPES = {
  RULES_UPDATED: 'RULES_UPDATED',
  SETTINGS_UPDATED: 'SETTINGS_UPDATED',
  SET_AUTO_GROUP_ENABLED: 'SET_AUTO_GROUP_ENABLED',
  ORGANIZE_TABS: 'ORGANIZE_TABS',
  GET_CURRENT_TAB_MATCH: 'GET_CURRENT_TAB_MATCH'
};
```

### 12.2 响应格式

```json
{
  "ok": true,
  "data": {},
  "error": null
}
```

错误响应：

```json
{
  "ok": false,
  "data": null,
  "error": {
    "code": "ORGANIZE_FAILED",
    "message": "Failed to organize tabs."
  }
}
```

## 13. 去重与运行时锁

### 13.1 Tab 处理锁

service worker 内存中维护短期锁：

```js
const processingTabs = new Map();
```

key 建议：

```text
`${tabId}:${url}:${title}`
```

锁过期时间：

1. URL 变化事件：1000ms
2. 标题变化事件：1500ms
3. 手动整理：不使用短期锁或使用更短锁

### 13.2 Restore 锁

历史恢复使用持久状态和内存锁双重保护：

1. 内存锁防止同一批事件重复触发。
2. `restoreState` 防止 service worker 被回收后重复触发。

## 14. 错误处理

### 14.1 Chrome API 失败

处理原则：

1. 单个标签处理失败不影响其他标签。
2. 分组创建失败时记录错误并退出当前标签处理。
3. 标签移动失败时不更新快照。
4. 历史恢复部分失败时，记录已成功恢复的 URL。

### 14.2 数据损坏

启动时校验：

1. `schemaVersion` 是否存在。
2. `rules` 是否为数组。
3. `settings` 是否为对象。
4. `groupSnapshots` 是否为对象。

如果数据异常：

1. 尽量使用默认设置恢复。
2. 不自动删除原数据。
3. 后续可增加导出备份能力。

## 15. 数据迁移

### 15.1 版本策略

```js
const CURRENT_SCHEMA_VERSION = 1;
```

启动或打开配置页时执行：

```text
loadStorage()
  -> if schemaVersion missing, migrateFromLegacy()
  -> if schemaVersion < current, runMigrations()
  -> save migrated data
```

### 15.2 旧规则兼容

当前目录已有旧版规则文件 `tabgroups_rules_20260615.json`，结构类似：

```json
{
  "rule-lisl89zt": {
    "enabled": true,
    "groupName": "文档",
    "id": "rule-lisl89zt",
    "ruleName": "飞书",
    "urlMatches": [
      {
        "method": "includes",
        "target": "hostname",
        "value": "bytedance.larkoffice.com"
      }
    ]
  }
}
```

迁移规则：

1. 顶层对象转为 `rules` 数组。
2. 跳过 `meta` 字段。
3. `urlMatches` 转为 `conditions`。
4. `method: includes` 转为 `operator: contains`。
5. `target: href` 转为 `target: url`。
6. 缺失 `enabled` 时默认 `true`。
7. 按原对象顺序生成 `priority`。
8. 缺失颜色时默认 `colorMode: random`。

## 16. 规则 JSON 导入导出

### 16.1 导出格式

导出文件建议包含规则、设置和版本信息：

```json
{
  "meta": {
    "name": "tab-group-helper-rules",
    "version": 1,
    "exportedAt": 1781520000000
  },
  "rules": [],
  "settings": {}
}
```

导出范围：

1. 必须导出 `rules`。
2. 默认同时导出 `settings`。
3. 不导出 `groupSnapshots` 和 `restoreState`，避免把个人浏览历史混入规则配置。

### 16.2 导入兼容

导入入口支持两种格式：

1. 新格式：包含 `rules` 数组。
2. 旧格式：类似 `tabgroups_rules_20260615.json` 的顶层对象和 `urlMatches`。

导入策略：

1. 导入前先校验 JSON 结构。
2. 导入后统一迁移成当前 `Rule` 结构。
3. 默认采用“覆盖规则”模式。
4. 如果导入文件包含 `settings`，只覆盖白名单设置项。
5. 导入成功后立即保存并通知 `service_worker` 重新读取配置。

## 17. 开发顺序

建议按以下顺序开发：

1. 创建插件目录与 `manifest.json`。
2. 实现 `storage.js` 和默认配置。
3. 实现旧规则迁移逻辑。
4. 实现规则 JSON 导入导出。
5. 实现 `rule-matcher.js`。
6. 实现 `group-manager.js` 的创建、复用、移动能力。
7. 实现 `auto-group-engine.js` 主流程。
8. 接入 `tabs.onCreated` 和 `tabs.onUpdated`。
9. 实现历史快照更新。
10. 实现历史标签延迟恢复。
11. 实现 `popup` 的总开关和手动整理。
12. 实现 `options` 的规则管理和全局设置。
13. 补充边界处理和手动测试。

## 18. 测试计划

### 18.1 规则匹配测试

需要覆盖：

1. `hostname contains`
2. `url startsWith`
3. `url endsWith`
4. `title equals`
5. 多条件 `OR`
6. 禁用规则不命中
7. 优先级高的规则先命中

### 18.2 分组行为测试

需要覆盖：

1. 新标签命中后创建分组。
2. 新标签命中后复用已有分组。
3. 标签从低优先级分组迁移到高优先级分组。
4. `single-instance` 跨窗口复用主分组。
5. `multi-instance` 不跨窗口合并。
6. 固定标签默认不处理。

### 18.3 历史恢复测试

需要覆盖：

1. 启动时不主动恢复历史标签。
2. 分组再次命中时恢复历史标签。
3. 同一会话同一分组只恢复一次。
4. 触发标签 URL 不重复恢复。
5. 已打开 URL 不重复恢复。
6. `historyTabPolicy: clear` 不恢复。

### 18.4 手动整理测试

需要覆盖：

1. 自动分组关闭时，手动整理仍可执行。
2. 整理当前窗口只处理当前窗口。
3. 整理全部窗口处理所有窗口。
4. 手动整理遵守固定标签配置。

### 18.5 导入导出测试

需要覆盖：

1. 导出现有规则为 JSON 文件。
2. 导入新格式规则文件。
3. 导入旧格式 `urlMatches` 规则文件。
4. 非法 JSON 导入失败且不覆盖原有规则。
5. 导入后规则立即参与匹配。

## 19. 后续扩展点

1. 正则匹配。
2. 条件 `AND`。
3. 排除条件。
4. 操作日志页面。
5. 快照管理页面。
6. 手动恢复某个历史分组。
7. 配置备份和恢复。

## 20. 仍需实现时注意的细节

当前没有阻塞开发的产品待确认点，但实现时需要注意以下技术细节：

1. Chrome service worker 可能被回收，不能依赖长期内存状态。
2. `chrome.tabs.group` 对跨窗口移动和既有 `groupId` 的行为需要实际验证。
3. 历史标签恢复可能触发新的 `onCreated` 和 `onUpdated`，必须用锁避免递归恢复。
4. 分组展示名后缀只用于展示，内部逻辑必须始终使用原始 `groupName`。
5. 快照更新要避免把恢复中的中间状态写成最终状态。
