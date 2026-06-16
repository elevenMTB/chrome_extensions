# Duplicate Tab Resolver

一个基于 Chrome Manifest V3 的标签页去重插件。

它会在检测到“当前打开的 URL 已经存在于其他标签页中”时，按照预设默认策略自动处理重复标签页，并支持：

- 默认策略切换
- 黑名单规则
- 白名单规则
- 最近处理记录
- 撤销最近一次自动处理

当前项目为纯 JavaScript 版本，**没有构建步骤**，可以直接作为 unpacked extension 加载到 Chrome 中。

## 功能概览

当前已实现的核心功能：

- 完整 URL 严格匹配去重
- 3 种默认处理策略
  - `activate_existing_close_new`
  - `close_old_keep_new`
  - `keep_both`
- 白名单优先于黑名单
- 最近处理记录 `actionHistory`
- 撤销最近一次可撤销处理
- 设置页配置

## 目录结构

```text
duplicate-tab-resolver/
├── manifest.json
├── service-worker.js
├── settings-store.js
├── url-rules.js
├── duplicate-detector.js
├── tab-actions.js
├── history-store.js
├── undo-actions.js
├── options.html
├── options.js
├── options.css
└── docs/
```

## 环境要求

- Chrome 浏览器
- 支持 Manifest V3 的 Chromium 内核浏览器也可参考同样方式加载

## 安装与加载

### 1. 准备代码目录

插件根目录为：

```text
/home/wangjiekai.eleven/go/src/wangjiekai.eleven/test/duplicate-tab-resolver
```

如果你是在其他机器部署，只需要确保完整复制该目录即可。

### 2. 打开扩展管理页

在 Chrome 地址栏打开：

```text
chrome://extensions
```

### 3. 打开开发者模式

在扩展管理页右上角打开 `Developer mode / 开发者模式`。

### 4. 加载插件目录

点击：

```text
Load unpacked / 加载已解压的扩展程序
```

然后选择本项目根目录：

```text
duplicate-tab-resolver
```

### 5. 确认加载成功

加载成功后，应能看到：

- 插件名称：`Duplicate Tab Resolver`
- 插件状态正常，无 manifest 报错
- 可以点击进入 `Details / 详情`
- 可以打开 `Extension options / 扩展程序选项`

## 日常开发流程

因为当前项目没有构建步骤，所以开发流程非常简单：

1. 修改插件目录下的源码文件
2. 回到 `chrome://extensions`
3. 点击该插件卡片上的 `Reload / 重新加载`
4. 重新打开设置页或重新测试浏览器行为

也就是说，当前开发模式是：

> 改源码 -> Reload 插件 -> 手工测试

## 设置页说明

当前设置页包含以下内容：

### General

- `Enable automatic duplicate tab handling`
  - 插件总开关
- `Default behavior`
  - 默认去重策略
- `Undo window (seconds)`
  - 撤销有效时间窗口
- `Max history records`
  - 最多保留多少条最近处理记录

### Rules

- `Whitelist rules`
  - 命中后直接跳过自动处理
- `Blacklist rules`
  - 命中后跳过自动处理

规则格式支持：

- `example.com`
- `*.example.com`
- `localhost`
- `127.0.0.1`

规则优先级：

```text
Whitelist > Blacklist
```

### Recent actions

- 查看最近处理记录
- 执行 `Undo latest action`

## 默认策略说明

### 1. `activate_existing_close_new`

行为：

- 激活已存在的旧标签页
- 关闭当前新标签页

### 2. `close_old_keep_new`

行为：

- 关闭旧标签页
- 保留当前新标签页

### 3. `keep_both`

行为：

- 不关闭任何标签页
- 允许两个重复标签页并存

## 手工测试步骤

建议至少按下面顺序做一遍验证。

### 基础加载验证

1. 在 Chrome 中加载插件
2. 打开设置页
3. 确认设置页能正常显示
4. 修改任意配置并保存
5. 重新打开设置页，确认配置已回显

### 去重策略验证

#### 测试 `activate_existing_close_new`

1. 在设置页将默认策略设为 `activate_existing_close_new`
2. 打开一个普通网页，例如：

```text
https://example.com
```

3. 再次新开相同 URL
4. 预期结果：
   - 浏览器切回旧标签页
   - 新标签页被关闭
   - Recent actions 中新增一条记录

#### 测试 `close_old_keep_new`

1. 把默认策略切换为 `close_old_keep_new`
2. 先打开一个 URL
3. 再打开同样的 URL
4. 预期结果：
   - 旧标签页关闭
   - 新标签页保留
   - Recent actions 中新增一条记录

#### 测试 `keep_both`

1. 把默认策略切换为 `keep_both`
2. 打开同一个 URL 两次
3. 预期结果：
   - 两个标签页都保留
   - Recent actions 中仍应能看到记录

### 白名单验证

1. 在 `Whitelist rules` 中加入：

```text
example.com
```

2. 保存设置
3. 连续打开两个：

```text
https://example.com
```

4. 预期结果：
   - 不触发自动去重
   - 两个标签页都保留

### 黑名单验证

1. 清空白名单
2. 在 `Blacklist rules` 中加入：

```text
example.com
```

3. 保存设置
4. 再连续打开两个相同 URL
5. 预期结果：
   - 不触发自动去重
   - 两个标签页都保留

### 白名单优先级验证

1. 同时设置：

```text
Whitelist:
example.com

Blacklist:
example.com
```

2. 保存设置
3. 再打开重复 URL
4. 预期结果：
   - 以白名单为准
   - 自动处理被跳过

### 撤销验证

1. 选择一个会关闭标签页的策略：
   - `activate_existing_close_new`
   - 或 `close_old_keep_new`
2. 打开重复 URL，让插件执行一次自动处理
3. 进入设置页的 `Recent actions`
4. 点击 `Undo latest action`
5. 预期结果：
   - 被关闭的页面 URL 被重新打开
   - 最近那条记录状态更新

### 撤销过期验证

1. 把 `Undo window (seconds)` 设置为较小值，例如 `5`
2. 触发一次自动处理
3. 等待超过 5 秒
4. 点击 `Refresh`
5. 预期结果：
   - 对应记录的撤销状态变为过期
   - `Undo latest action` 不再对这条记录生效

## 调试方法

### 查看扩展页报错

在 `chrome://extensions` 中找到本插件卡片：

- 点击 `Errors` 查看运行错误
- 点击 `service worker` 相关入口查看后台日志

### 查看设置页控制台

打开插件设置页后：

- 右键页面
- 选择 `Inspect / 检查`
- 在 DevTools Console 中查看前端报错

### 建议观察的关键点

- `service worker` 是否成功启动
- 保存设置时是否报错
- 重复打开页面时是否触发后台逻辑
- Recent actions 是否正常写入
- Undo 是否返回成功

## 部署说明

当前项目的“部署”方式本质上是：

- 分发源码目录
- 让目标环境通过 `Load unpacked` 手动加载

如果后续要正式分发，有两种常见方向：

### 1. 内部使用

适合团队或个人内部使用：

- 保持当前目录结构
- 通过代码仓库同步
- 在目标机器上手动加载 unpacked extension

### 2. 打包发布

如果后续要做更标准的分发，可以继续增加：

- 图标资源
- README 中的版本发布说明
- `.gitignore`
- 打包脚本
- Chrome Web Store 发布材料

但当前版本还不需要这些步骤才可运行。

## 更新插件的方法

当你修改了源码后：

1. 保存文件
2. 打开 `chrome://extensions`
3. 点击插件卡片上的 `Reload / 重新加载`
4. 重新执行测试

如果你修改的是：

- `service-worker.js`
- `manifest.json`
- 规则或存储相关模块

建议一定执行一次完整 reload，而不是只刷新设置页。

## 已知限制

当前版本有这些已知限制：

- 仅按完整 URL 严格匹配
- 撤销本质上是“重新打开被关闭的 URL”
- 不恢复原 tab 的滚动位置、表单状态、SPA 内部状态
- 暂未加入通知、页面浮层、站点级差异策略

## 推荐后续工作

如果准备继续推进，可以按这个顺序继续做：

1. 增加图标资源
2. 增加 `.gitignore`
3. 补充版本发布说明
4. 增加更完整的回归测试清单
5. 再考虑 TypeScript 迁移或打包流程

## 文档索引

如果你想了解完整背景和设计过程，可以继续查看：

- [chrome-extension-duplicate-tab-plan.md](file:///home/wangjiekai.eleven/go/src/wangjiekai.eleven/test/duplicate-tab-resolver/docs/chrome-extension-duplicate-tab-plan.md)
- [chrome-extension-mvp-tech-design.md](file:///home/wangjiekai.eleven/go/src/wangjiekai.eleven/test/duplicate-tab-resolver/docs/chrome-extension-mvp-tech-design.md)
- [chrome-extension-implementation-checklist.md](file:///home/wangjiekai.eleven/go/src/wangjiekai.eleven/test/duplicate-tab-resolver/docs/chrome-extension-implementation-checklist.md)
- [phase-2-iteration-plan.md](file:///home/wangjiekai.eleven/go/src/wangjiekai.eleven/test/duplicate-tab-resolver/docs/phase-2-iteration-plan.md)
- [phase-2-tech-design.md](file:///home/wangjiekai.eleven/go/src/wangjiekai.eleven/test/duplicate-tab-resolver/docs/phase-2-tech-design.md)
