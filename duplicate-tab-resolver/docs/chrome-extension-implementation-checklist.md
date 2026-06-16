# Chrome 重复标签页处理器实现前开发清单

## 1. 文档目标

这份文档用于把前两份方案继续落成“准备开工时可以直接照着执行”的开发清单。

它不是最终代码，也不是逐行实现教程，而是用于回答下面几个问题：

- 项目目录应该先怎么搭
- `manifest.json` 第一版该怎么写
- 先做哪些模块
- 每个模块的输入输出是什么
- 去重逻辑和黑名单逻辑的伪代码怎么写
- 开发时如何逐步验证

如果前两份文档解决的是“做什么、为什么这么做”，这份文档解决的是：

> 开始实现前，到底要先准备哪些东西，以及代码骨架大概长什么样。

## 2. 实现范围再次确认

这一份默认你要实现的是一期 MVP：

- Manifest V3 插件
- `service worker` 负责监听和自动处理
- `options page` 负责配置
- 完整 URL 严格匹配
- 黑名单一期就支持
- 不做弹窗交互
- 不做页面内提示
- 不做撤销

## 3. 建议目录结构

建议从第一天就把目录结构定清楚，不要一开始把所有逻辑都堆到一个文件里。

```text
extension/
├── manifest.json
├── options.html
├── options.css
├── src/
│   ├── background/
│   │   ├── service-worker.ts
│   │   ├── duplicate-detector.ts
│   │   ├── tab-actions.ts
│   │   ├── settings-store.ts
│   │   └── url-rules.ts
│   └── shared/
│       ├── types.ts
│       ├── constants.ts
│       └── validators.ts
└── assets/
    └── icons/
        ├── icon16.png
        ├── icon48.png
        └── icon128.png
```

### 为什么 `options.html` 放顶层

因为在很多 Chrome 插件项目里，最终打包产物希望是静态直观、直接可引用的路径。

把 `options.html` 放顶层的好处是：

- `manifest.json` 引用简单
- 加载路径更清楚
- 调试时容易确认是否输出成功

## 4. 第一天先做出的最小骨架

一开始不要追求功能完整，先把“插件能被 Chrome 识别并加载”作为第一个目标。

### 第一天目标

- 建出 `manifest.json`
- 建出一个最简单的 `service worker`
- 建出一个最简单的 `options.html`
- 在 Chrome 扩展管理页能成功加载
- 打开设置页能看到静态内容
- `service worker` 能打印日志

### 完成标准

- 扩展可以被“加载已解压的扩展程序”
- Chrome 没有 manifest 报错
- `service worker` 能启动
- 设置页能正常打开

## 5. `manifest.json` 草案

下面是一个适合第一期的 `manifest.json` 草案。

注意：这是结构草案，不是最终定稿；后续如果你用了打包工具，文件路径可能会微调。

```json
{
  "manifest_version": 3,
  "name": "Duplicate Tab Resolver",
  "version": "0.1.0",
  "description": "Automatically handle duplicate tabs by URL with configurable default behavior and blacklist rules.",
  "permissions": [
    "tabs",
    "storage"
  ],
  "background": {
    "service_worker": "dist/background/service-worker.js",
    "type": "module"
  },
  "options_page": "options.html",
  "icons": {
    "16": "assets/icons/icon16.png",
    "48": "assets/icons/icon48.png",
    "128": "assets/icons/icon128.png"
  }
}
```

## 6. `manifest.json` 字段说明

### `manifest_version`

- 固定为 `3`
- 新项目默认按 MV3 设计

### `name`

- 插件名称
- 当前只是草案，后续可以改成你更喜欢的名字

### `version`

- 第一版建议从 `0.1.0` 开始
- 代表已经可测试，但还在早期阶段

### `description`

- 简短说明插件做什么
- 建议和实际功能保持一致，不写未来功能

### `permissions`

- `tabs`
  - 读取 tab 信息、查询重复 tab、激活 tab、关闭 tab
- `storage`
  - 保存默认策略和黑名单

### `background`

- `service_worker`
  - 后台逻辑入口
- `type: "module"`
  - 如果你的构建产物是 ES Module，会更方便组织代码

### `options_page`

- 指向设置页
- 一期配置全靠这个页面完成

### `icons`

- 先准备占位图标也可以
- 但建议一开始就把路径写对，避免后面多一轮路径排查

## 7. 如果暂时不用构建工具

如果你想先最快速验证逻辑，而不是一开始上 TypeScript 构建链，也可以先用纯 JS 方式：

```json
{
  "background": {
    "service_worker": "service-worker.js"
  },
  "options_page": "options.html"
}
```

这条路线的优点是：

- 简单
- 调试快
- 更适合第一次接触 Chrome 插件

这条路线的缺点是：

- 类型约束弱
- 文件组织后面容易变乱

如果你是零基础，我反而建议：

> 可以先用原生 JS 把逻辑跑通，再迁到 TypeScript。

## 8. 建议优先定义的数据类型

即使暂时不用 TypeScript，也建议你先把“脑子里的数据结构”定下来。

### `DuplicateStrategy`

```text
activate_existing_close_new
close_old_keep_new
keep_both
```

### `ExtensionSettings`

```text
{
  enabled: boolean,
  duplicateStrategy: DuplicateStrategy,
  blacklist: string[],
  scope: "all_windows"
}
```

### `DuplicateMatchResult`

```text
{
  hasDuplicate: boolean,
  existingTabId?: number,
  existingWindowId?: number,
  existingUrl?: string
}
```

### `NormalizedSettings`

```text
{
  enabled: true,
  duplicateStrategy: "activate_existing_close_new",
  blacklist: [],
  scope: "all_windows"
}
```

它的意义是：

- 无论用户配置是否完整，后台拿到的都必须是“补全默认值后的对象”
- 后台逻辑只依赖标准化后的配置，不去处理一堆 `undefined`

## 9. 常量草案

建议尽早把这些常量集中管理：

```text
DEFAULT_SETTINGS
SUPPORTED_PROTOCOLS
UNSUPPORTED_PREFIXES
STRATEGY_VALUES
STORAGE_KEY_SETTINGS
```

例如：

```text
DEFAULT_SETTINGS = {
  enabled: true,
  duplicateStrategy: "activate_existing_close_new",
  blacklist: [],
  scope: "all_windows"
}
```

## 10. 开发任务拆分清单

下面这份清单适合真正进入实现阶段时逐项勾掉。

### 阶段 1：项目骨架

- 创建插件目录结构
- 新建 `manifest.json`
- 新建 `service worker` 入口文件
- 新建 `options.html` 和 `options.css`
- 准备基础图标或占位图标
- 在 Chrome 中加载扩展

### 阶段 2：设置模块

- 定义默认配置对象
- 实现读取配置方法
- 实现保存配置方法
- 实现配置标准化
- 实现配置校验

### 阶段 3：URL 规则模块

- 实现可处理协议判断
- 实现 URL 解析函数
- 实现 hostname 提取
- 实现黑名单匹配

### 阶段 4：重复检测模块

- 监听 `tabs.onUpdated`
- 读取当前 tab URL
- 查询所有标签页
- 找出相同完整 URL 的候选 tab
- 选定旧标签页

### 阶段 5：动作执行模块

- 实现激活旧标签页
- 实现切换旧标签页所在窗口
- 实现关闭当前新标签页
- 实现关闭旧标签页
- 实现 `keep_both`

### 阶段 6：并发保护与调试

- 增加处理中 `tabId` 集合
- 增加日志
- 验证多次触发不重复执行

### 阶段 7：设置页可用性

- 支持总开关
- 支持策略选择
- 支持黑名单多行输入
- 支持保存成功反馈
- 支持回显现有配置

## 11. `service worker` 主流程伪代码

下面这段伪代码是整个插件的一号主线。

```ts
on extension startup:
  log("service worker started")

create processingTabIds = new Set()

listen tabs.onUpdated(tabId, changeInfo, tab):
  if processingTabIds contains tabId:
    return

  if changeInfo.url is missing AND tab.url is empty:
    return

  processingTabIds.add(tabId)

  try:
    settings = await loadNormalizedSettings()

    if settings.enabled is false:
      return

    currentUrl = changeInfo.url ?? tab.url

    if currentUrl is empty:
      return

    if isProcessableUrl(currentUrl) is false:
      return

    if isBlacklistedUrl(currentUrl, settings.blacklist):
      log("skip because blacklisted", currentUrl)
      return

    match = await findDuplicateTab({
      currentTabId: tabId,
      currentUrl,
      settings
    })

    if match.hasDuplicate is false:
      return

    await executeDuplicateStrategy({
      strategy: settings.duplicateStrategy,
      currentTabId: tabId,
      existingTabId: match.existingTabId,
      existingWindowId: match.existingWindowId
    })

  catch (error):
    log("failed to process tab update", error)

  finally:
    processingTabIds.delete(tabId)
```

## 12. 重复检测模块伪代码

这部分建议单独封装，不要把检测逻辑全部写进事件监听器里。

```ts
async function findDuplicateTab(input):
  currentTabId = input.currentTabId
  currentUrl = input.currentUrl
  settings = input.settings

  allTabs = await chrome.tabs.query({})

  candidateTabs = []

  for each tab in allTabs:
    if tab.id is missing:
      continue

    if tab.id equals currentTabId:
      continue

    if tab.url is empty:
      continue

    if isProcessableUrl(tab.url) is false:
      continue

    if isBlacklistedUrl(tab.url, settings.blacklist):
      continue

    if tab.url not equals currentUrl:
      continue

    candidateTabs.push(tab)

  if candidateTabs.length equals 0:
    return { hasDuplicate: false }

  existingTab = pickExistingTab(candidateTabs)

  return {
    hasDuplicate: true,
    existingTabId: existingTab.id,
    existingWindowId: existingTab.windowId,
    existingUrl: existingTab.url
  }
```

## 13. “旧标签页选择”伪代码

一期不必做复杂排序，但要固定规则。

```ts
function pickExistingTab(candidateTabs):
  sort candidateTabs by id ascending
  return candidateTabs[0]
```

### 为什么可以先按 `tab.id` 排序

虽然 `tab.id` 不是严格定义的“创建时间”，但在很多实际场景里，它通常可以作为一个足够稳定的近似顺序。

一期先这样做的好处是：

- 简单
- 可预测
- 容易调试

后续如果发现有必要，再升级为更明确的“最近活跃时间”或其他策略。

## 14. 黑名单匹配伪代码

黑名单是一期的重要功能，建议把它写得独立且易测。

```ts
function isBlacklistedUrl(urlString, blacklistRules):
  parsed = safeParseUrl(urlString)
  if parsed is null:
    return false

  hostname = toLowerCase(parsed.hostname)

  for each rule in blacklistRules:
    normalizedRule = normalizeRule(rule)

    if normalizedRule is empty:
      continue

    if normalizedRule startsWith "*.": 
      suffix = normalizedRule without "*."
      if hostname endsWith "." + suffix:
        return true
      continue

    if hostname equals normalizedRule:
      return true

  return false
```

### 这里的规则行为

- `example.com` 仅匹配 `example.com`
- `*.example.com` 匹配 `a.example.com`
- `*.example.com` 不匹配 `example.com`

## 15. URL 可处理判断伪代码

```ts
function isProcessableUrl(urlString):
  if urlString is empty:
    return false

  lower = toLowerCase(urlString)

  if lower equals "about:blank":
    return false

  if lower startsWith "chrome://":
    return false

  if lower startsWith "chrome-extension://":
    return false

  if lower startsWith "devtools://":
    return false

  if lower startsWith "view-source:":
    return false

  if lower startsWith "file://":
    return false

  return lower startsWith "http://" OR lower startsWith "https://"
```

## 16. 设置读取与标准化伪代码

后台逻辑不要直接使用原始存储值，统一走标准化。

```ts
async function loadNormalizedSettings():
  raw = await chrome.storage.local.get("settings")
  input = raw.settings ?? {}

  return {
    enabled: typeof input.enabled === "boolean" ? input.enabled : true,
    duplicateStrategy: isValidStrategy(input.duplicateStrategy)
      ? input.duplicateStrategy
      : "activate_existing_close_new",
    blacklist: normalizeBlacklist(input.blacklist),
    scope: "all_windows"
  }
```

### 黑名单标准化伪代码

```ts
function normalizeBlacklist(input):
  if input is not array:
    return []

  output = []
  seen = new Set()

  for each item in input:
    if item is not string:
      continue

    value = trim(toLowerCase(item))

    if value is empty:
      continue

    if isValidBlacklistRule(value) is false:
      continue

    if seen contains value:
      continue

    seen.add(value)
    output.push(value)

  return output
```

## 17. 策略执行伪代码

```ts
async function executeDuplicateStrategy(input):
  strategy = input.strategy
  currentTabId = input.currentTabId
  existingTabId = input.existingTabId
  existingWindowId = input.existingWindowId

  if existingTabId is missing:
    return

  if strategy equals "activate_existing_close_new":
    if existingWindowId exists:
      await chrome.windows.update(existingWindowId, { focused: true })
    await chrome.tabs.update(existingTabId, { active: true })
    await chrome.tabs.remove(currentTabId)
    return

  if strategy equals "close_old_keep_new":
    await chrome.tabs.remove(existingTabId)
    return

  if strategy equals "keep_both":
    return
```

## 18. 设置页保存逻辑伪代码

```ts
on options page load:
  settings = await loadNormalizedSettings()
  fillEnabledCheckbox(settings.enabled)
  fillStrategySelect(settings.duplicateStrategy)
  fillBlacklistTextarea(join settings.blacklist with newline)

on save button click:
  enabled = readEnabledCheckbox()
  duplicateStrategy = readStrategySelect()
  blacklistText = readBlacklistTextarea()

  blacklist = split blacklistText by newline
  blacklist = normalizeBlacklist(blacklist)

  settings = {
    enabled,
    duplicateStrategy,
    blacklist,
    scope: "all_windows"
  }

  await saveSettings(settings)
  showSavedMessage()
```

## 19. 开发时的日志建议

第一版建议先保留这些日志点：

```text
[worker] started
[settings] loaded
[tab] update received
[tab] skipped because url is not processable
[tab] skipped because blacklisted
[duplicate] found existing tab
[strategy] activate existing and close new
[strategy] close old and keep new
[error] failed to execute
```

### 日志注意点

- 不要打太多重复日志
- 尽量带上 `tabId`
- 关键分支都要能看出来是否经过

这样调试时你能快速判断：

- 事件有没有触发
- 当前 URL 有没有被过滤
- 黑名单是否命中
- 最终执行了哪种策略

## 20. 手工开发验证清单

写代码时，建议你按这条顺序逐项验证，不要等全部写完再一起测。

### 骨架验证

- 插件能加载
- 设置页能打开
- 后台日志能看到

### 配置验证

- 设置保存后刷新仍存在
- 默认值正确回显
- 黑名单输入会被标准化

### URL 规则验证

- `https://example.com` 可处理
- `http://example.com` 可处理
- `about:blank` 跳过
- `chrome://settings` 跳过
- `file://` 跳过

### 黑名单验证

- `example.com` 能匹配 `example.com`
- `example.com` 不匹配 `a.example.com`
- `*.example.com` 能匹配 `a.example.com`
- `*.example.com` 不匹配 `example.com`
- `localhost` 能跳过本地页

### 去重验证

- 没有重复页时不做处理
- 有重复页时，3 种策略都符合预期
- 跨窗口重复也能识别

### 并发验证

- 同一页面加载过程中多次更新不重复执行
- 快速连续打开相同 URL 时不出现明显异常

## 21. 推荐实现顺序

如果你后面真的开始写代码，我建议严格按这个顺序推进：

1. 先让插件能加载
2. 再让设置页能存取值
3. 再写 URL 判断和黑名单
4. 再写重复检测
5. 最后写动作执行

不要反过来。

原因很简单：

- Chrome 插件的第一类问题常常不是业务逻辑，而是加载、路径、权限、事件没跑起来
- 先把运行骨架打通，后面的排查成本会低很多

## 22. 可能遇到的第一批问题

### 问题 1：`service worker` 看起来没有执行

排查方向：

- `manifest.json` 路径是否正确
- 构建产物是否真的输出到了声明位置
- Chrome 扩展页面里是否有报错

### 问题 2：设置页能打开但保存无效

排查方向：

- 是否申请了 `storage` 权限
- 是否读写了统一的 `settings` key
- 是否保存后被标准化逻辑覆盖

### 问题 3：重复页没有被识别

排查方向：

- `onUpdated` 是否触发
- 当前 URL 是否可处理
- 当前站点是否命中黑名单
- URL 是否真的完全一致

### 问题 4：误判太多

排查方向：

- 是否在用户测试时实际打开的是不同 query 参数页面
- 是否需要先把策略设为 `keep_both` 方便观察日志

## 23. 开工前最后确认事项

真正开始写代码前，建议你把下面这些事项先定下来：

- 先用原生 JS 还是直接上 TypeScript
- 是否使用打包工具
- 图标是否先用占位文件
- 设置页是否先做最简 UI
- 调试阶段是否保留详细日志

如果你第一次做 Chrome 插件，我建议第一轮决策是：

- 先用最小技术栈
- 先跑通
- 再做工程化整理

## 24. 一句话版本的开工路径

如果把整件事压缩成一条最实用的执行路线，就是：

> 先做一个能加载的 MV3 插件骨架，再做设置读写，再做 URL 和黑名单判断，最后把重复检测和策略执行串起来。

---

如果你愿意，下一步我可以继续帮你往前走一层，直接写第四份文档到 `./docs`：

- 用纯 JavaScript 起步的最小实现指南
- 或者用 TypeScript + Vite/其他构建方式的工程脚手架建议

你选其中一种，我就可以把“真正开始写代码前的准备”继续写完。
