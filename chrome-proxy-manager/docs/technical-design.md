# Chrome 代理管理插件技术方案

## 1. 背景与目标

在 macOS 上通过系统设置频繁切换 HTTP/HTTPS 代理较麻烦。本项目目标是开发一个 Chrome 插件，用于管理 Chrome 浏览器内的代理策略，支持多个代理配置，并根据访问域名自动选择对应代理；未命中任何规则的请求默认直连。

本插件仅影响 Chrome 浏览器代理设置，不修改 macOS 系统全局代理。

## 2. 已确认决策

| 编号 | 决策项 | 结论 |
| --- | --- | --- |
| 1 | 作用范围 | 只管理 Chrome 浏览器内代理 |
| 2 | 代理认证 | 第一版只支持无用户名密码代理 |
| 3 | 代理类型 | 支持 HTTP、HTTPS、SOCKS5 |
| 4 | 域名规则类型 | 支持精确域名、通配符、关键词匹配 |
| 5 | 未匹配域名策略 | 固定 DIRECT |
| 6 | 规则优先级 | 支持规则排序，靠前优先 |
| 7 | 配置界面 | Popup 放开关和状态，Options 放完整配置 |
| 8 | 规则分组 | 第一版不做分组 |
| 9 | 全局模式 | 支持全部直连、全部走某代理、按规则 |
| 10 | 导入导出 | 第一版支持 JSON 导入导出 |
| 11 | 域名测试工具 | 第一版支持输入域名查看命中结果 |
| 12 | 目标形态 | 先做本地自用插件，通过开发者模式加载 |

## 3. 功能范围

### 3.1 第一版功能

- 管理多个代理配置。
- 支持代理类型：HTTP、HTTPS、SOCKS5。
- 支持域名规则：精确域名、通配符、关键词。
- 支持规则排序，规则按顺序匹配，首个命中规则生效。
- 未命中规则时固定使用 DIRECT。
- 支持三种运行模式：全部直连、全部走某代理、按规则匹配。
- 支持插件总开关。
- 支持 JSON 导入导出配置。
- 支持域名测试工具，输入域名后展示命中的规则和代理。
- Popup 展示当前状态并提供快速开关。
- Options 提供完整配置管理能力。

### 3.2 暂不支持功能

- 不修改 macOS 系统全局代理。
- 不支持带用户名密码的代理认证。
- 不支持规则分组。
- 不支持正则表达式规则。
- 不支持按 Tab 或窗口设置不同代理。
- 不支持自动检测代理可用性。
- 不支持 Chrome Web Store 上架相关合规流程。

## 4. 技术选型

### 4.1 插件规范

使用 Chrome Extension Manifest V3。

核心原因：

- Chrome 当前推荐 MV3。
- 可以使用 `chrome.proxy` 管理 Chrome 浏览器代理。
- 可以使用 `chrome.storage.local` 保存本地配置。
- 适合本地开发者模式加载。

### 4.2 核心 API

| API | 用途 |
| --- | --- |
| `chrome.proxy.settings` | 设置、清除 Chrome 代理配置 |
| `chrome.storage.local` | 保存代理、规则、运行模式等配置 |
| `chrome.runtime` | Popup、Options、Service Worker 通信 |

### 4.3 权限

`manifest.json` 中建议包含：

```json
{
  "permissions": [
    "proxy",
    "storage"
  ]
}
```

第一版不需要 `host_permissions`。如果后续增加请求监听、认证代理、网络诊断等能力，再评估额外权限。

## 5. 总体架构

```text
┌──────────────────────┐
│ Popup                │
│ - 总开关              │
│ - 当前模式            │
│ - 当前状态            │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ Options              │
│ - 代理管理            │
│ - 规则管理            │
│ - 导入导出            │
│ - 域名测试            │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ chrome.storage.local │
│ - AppConfig           │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ Service Worker       │
│ - 读取配置            │
│ - 生成 PAC 脚本       │
│ - 应用代理设置        │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ chrome.proxy.settings│
│ - direct             │
│ - fixed_servers      │
│ - pac_script         │
└──────────────────────┘
```

## 6. 运行模式设计

插件支持三种运行模式。

### 6.1 全部直连

所有请求都不走代理。

Chrome 代理设置可以使用：

```js
chrome.proxy.settings.set({
  value: {
    mode: "direct"
  },
  scope: "regular"
});
```

### 6.2 全部走某代理

所有请求统一走用户选择的代理。

可使用 `fixed_servers`：

```js
chrome.proxy.settings.set({
  value: {
    mode: "fixed_servers",
    rules: {
      singleProxy: {
        scheme: "http",
        host: "127.0.0.1",
        port: 7890
      }
    }
  },
  scope: "regular"
});
```

对于 SOCKS5 代理，`scheme` 使用 `socks5`。

### 6.3 按规则匹配

根据用户配置生成 PAC 脚本，规则命中则走对应代理，未命中则直连。

```js
chrome.proxy.settings.set({
  value: {
    mode: "pac_script",
    pacScript: {
      data: "function FindProxyForURL(url, host) { return 'DIRECT'; }"
    }
  },
  scope: "regular"
});
```

## 7. 数据模型

### 7.1 AppConfig

```ts
type AppConfig = {
  enabled: boolean;
  mode: ProxyMode;
  selectedProxyId?: string;
  proxies: ProxyConfig[];
  rules: DomainRule[];
  version: number;
};
```

字段说明：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `enabled` | `boolean` | 插件总开关 |
| `mode` | `ProxyMode` | 当前运行模式 |
| `selectedProxyId` | `string` | 全部走某代理时选中的代理 ID |
| `proxies` | `ProxyConfig[]` | 代理列表 |
| `rules` | `DomainRule[]` | 域名规则列表 |
| `version` | `number` | 配置版本，便于后续迁移 |

### 7.2 ProxyMode

```ts
type ProxyMode = "direct" | "global" | "rule";
```

| 值 | 说明 |
| --- | --- |
| `direct` | 全部直连 |
| `global` | 全部走某代理 |
| `rule` | 按域名规则匹配 |

### 7.3 ProxyConfig

```ts
type ProxyConfig = {
  id: string;
  name: string;
  type: ProxyType;
  host: string;
  port: number;
  enabled: boolean;
};
```

```ts
type ProxyType = "http" | "https" | "socks5";
```

示例：

```json
{
  "id": "proxy-local-http",
  "name": "本地 HTTP 代理",
  "type": "http",
  "host": "127.0.0.1",
  "port": 7890,
  "enabled": true
}
```

### 7.4 DomainRule

```ts
type DomainRule = {
  id: string;
  name: string;
  type: RuleType;
  pattern: string;
  proxyId: string;
  enabled: boolean;
  priority: number;
};
```

```ts
type RuleType = "exact" | "wildcard" | "keyword";
```

字段说明：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `string` | 规则 ID |
| `name` | `string` | 规则名称 |
| `type` | `RuleType` | 规则类型 |
| `pattern` | `string` | 规则内容 |
| `proxyId` | `string` | 命中后使用的代理 ID |
| `enabled` | `boolean` | 是否启用 |
| `priority` | `number` | 优先级，数值越小越靠前 |

示例：

```json
{
  "id": "rule-google",
  "name": "Google",
  "type": "wildcard",
  "pattern": "*.google.com",
  "proxyId": "proxy-local-http",
  "enabled": true,
  "priority": 10
}
```

## 8. PAC 生成方案

### 8.1 代理字符串映射

| 代理类型 | PAC 返回值格式 |
| --- | --- |
| HTTP | `PROXY host:port` |
| HTTPS | `HTTPS host:port` |
| SOCKS5 | `SOCKS5 host:port` |

### 8.2 规则匹配逻辑

规则按 `priority` 从小到大排序。

每条规则生成一个判断分支：

- `exact`：精确匹配域名。
- `wildcard`：使用 PAC 内置 `shExpMatch(host, pattern)`。
- `keyword`：使用 `host.indexOf(keyword) !== -1`。

未命中任何规则时返回 `DIRECT`。

### 8.3 PAC 示例

```js
function FindProxyForURL(url, host) {
  host = host.toLowerCase();

  if (host === "github.com") {
    return "PROXY 127.0.0.1:7890";
  }

  if (shExpMatch(host, "*.google.com")) {
    return "SOCKS5 127.0.0.1:7891";
  }

  if (host.indexOf("openai") !== -1) {
    return "HTTPS 127.0.0.1:7892";
  }

  return "DIRECT";
}
```

### 8.4 PAC 安全处理

用户输入会进入 PAC 脚本，因此生成脚本时需要做转义：

- 对域名、关键词、host 做字符串转义。
- `port` 必须校验为合法整数，范围建议为 `1-65535`。
- `host` 不允许为空。
- `pattern` 不允许为空。
- 禁止把用户输入直接拼接成可执行 JS 表达式。

## 9. 页面设计

### 9.1 Popup

Popup 用于高频操作，保持简单。

功能：

- 显示插件启用状态。
- 提供总开关。
- 显示当前运行模式。
- 支持快速切换运行模式。
- 当模式为 `global` 时，支持选择全局代理。
- 提供进入 Options 的入口。

建议布局：

```text
┌──────────────────────────┐
│ Chrome 代理管理器         │
├──────────────────────────┤
│ 状态：已启用              │
│ 模式：按规则匹配          │
│                          │
│ [启用/关闭]               │
│                          │
│ 模式：                    │
│ ( ) 全部直连              │
│ ( ) 全部代理              │
│ ( ) 按规则                │
│                          │
│ [打开设置]                │
└──────────────────────────┘
```

### 9.2 Options

Options 用于完整配置。

建议包含四个区域：

- 代理管理。
- 规则管理。
- 域名测试。
- 导入导出。

#### 代理管理

字段：

- 名称。
- 类型：HTTP、HTTPS、SOCKS5。
- Host。
- Port。
- 是否启用。

操作：

- 新增代理。
- 编辑代理。
- 删除代理。
- 启用或停用代理。

#### 规则管理

字段：

- 规则名称。
- 规则类型：精确域名、通配符、关键词。
- 匹配内容。
- 绑定代理。
- 是否启用。
- 优先级。

操作：

- 新增规则。
- 编辑规则。
- 删除规则。
- 上移、下移规则。
- 启用或停用规则。

#### 域名测试

用户输入域名，例如：

```text
github.com
www.google.com
api.openai.com
```

系统展示：

- 是否命中规则。
- 命中的规则名称。
- 使用的代理。
- 最终 PAC 返回值。

#### 导入导出

导出：

- 把当前 `AppConfig` 导出为 JSON 文件。

导入：

- 选择 JSON 文件。
- 校验配置结构。
- 校验代理和规则引用关系。
- 导入前提示会覆盖当前配置。

## 10. 配置应用流程

### 10.1 配置变更流程

```text
用户修改配置
      │
      ▼
写入 chrome.storage.local
      │
      ▼
通知 Service Worker
      │
      ▼
读取最新配置
      │
      ▼
根据 enabled 和 mode 应用代理
      │
      ▼
调用 chrome.proxy.settings.set / clear
```

### 10.2 启用状态处理

当 `enabled = false`：

- 清除插件设置的代理。
- Chrome 回到系统默认代理设置或浏览器默认行为。

```js
chrome.proxy.settings.clear({
  scope: "regular"
});
```

当 `enabled = true`：

- 如果 `mode = direct`，设置 `mode: "direct"`。
- 如果 `mode = global`，设置 `mode: "fixed_servers"`。
- 如果 `mode = rule`，生成并设置 PAC 脚本。

## 11. 校验规则

### 11.1 代理校验

- `name` 必填。
- `type` 必须是 `http`、`https`、`socks5` 之一。
- `host` 必填。
- `port` 必须是 `1-65535` 的整数。
- 删除代理时，如果有规则引用，需要提示用户先处理引用规则。

### 11.2 域名规则校验

- `name` 必填。
- `type` 必须是 `exact`、`wildcard`、`keyword` 之一。
- `pattern` 必填。
- `proxyId` 必须指向存在且启用的代理。
- `exact` 建议输入普通域名，例如 `github.com`。
- `wildcard` 建议输入 `*.example.com` 形式。
- `keyword` 不建议输入过短内容，例如单个字符。

## 12. 文件结构建议

```text
chrome-proxy-manager/
├── docs/
│   └── technical-design.md
├── manifest.json
├── package.json
├── src/
│   ├── background/
│   │   └── service-worker.ts
│   ├── popup/
│   │   ├── popup.html
│   │   ├── popup.ts
│   │   └── popup.css
│   ├── options/
│   │   ├── options.html
│   │   ├── options.ts
│   │   └── options.css
│   ├── core/
│   │   ├── config.ts
│   │   ├── pac.ts
│   │   ├── proxy.ts
│   │   └── matcher.ts
│   └── types/
│       └── index.ts
└── README.md
```

## 13. 核心模块职责

### 13.1 `core/config.ts`

负责：

- 读取配置。
- 保存配置。
- 初始化默认配置。
- 导入导出配置。
- 配置版本迁移。

### 13.2 `core/pac.ts`

负责：

- 根据代理和规则生成 PAC 脚本。
- 转义用户输入。
- 映射代理类型到 PAC 返回值。

### 13.3 `core/proxy.ts`

负责：

- 根据当前配置应用 Chrome 代理设置。
- 关闭插件时清理代理设置。
- 处理 direct、global、rule 三种模式。

### 13.4 `core/matcher.ts`

负责：

- 在 Options 页面中复用同一套规则匹配逻辑。
- 为域名测试工具计算命中结果。
- 注意该模块是 JS 侧模拟匹配，不直接影响 PAC 执行。

## 14. 开发阶段计划

### 阶段一：项目骨架

- 创建 Manifest V3 插件基础结构。
- 实现 Service Worker。
- 实现 Popup 和 Options 的基础页面。
- 打通 `chrome.storage.local` 读写。

### 阶段二：代理设置能力

- 实现 direct 模式。
- 实现 global 模式。
- 实现 rule 模式。
- 实现 PAC 脚本生成和应用。

### 阶段三：配置管理

- 实现代理增删改查。
- 实现规则增删改查。
- 实现规则排序。
- 实现基础表单校验。

### 阶段四：辅助工具

- 实现域名测试工具。
- 实现 JSON 导入导出。
- 增加错误提示和状态反馈。

### 阶段五：本地验证

- 通过 Chrome 开发者模式加载插件。
- 验证 direct、global、rule 三种模式。
- 验证 HTTP、HTTPS、SOCKS5 代理。
- 验证规则顺序、通配符、关键词匹配。
- 验证导入导出。

## 15. 风险与注意事项

- `chrome.proxy.settings` 是浏览器级设置，不是单个 Tab 级别。
- 如果安装了其他代理插件，可能互相覆盖 Chrome 代理设置。
- PAC 脚本必须完整生成，PAC 中不能直接读取 `chrome.storage.local`。
- 用户输入进入 PAC 生成流程，必须转义和校验。
- HTTPS 代理是否可用取决于代理服务本身支持情况。
- 第一版不支持认证代理，遇到需要用户名密码的代理时需要后续扩展。

## 16. 后续可扩展方向

- 支持代理认证。
- 支持规则分组。
- 支持配置 profiles，例如工作、测试、海外。
- 支持代理连通性检测。
- 支持规则命中日志。
- 支持导入常见代理工具规则格式。
- 支持 Chrome Web Store 上架规范。

