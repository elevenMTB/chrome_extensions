# Chrome Proxy Manager

一个本地自用的 Chrome MV3 插件，用于管理 Chrome 浏览器内代理配置。

## 功能

- 添加多个 HTTP、HTTPS、SOCKS5 代理。
- 支持三种运行模式：全部直连、全部代理、按规则。
- 按域名规则选择代理，未命中时使用 DIRECT。
- 支持精确域名、通配符、关键词规则。
- 支持规则排序，靠前规则优先生效。
- 支持域名测试工具。
- 支持 JSON 导入导出。

## 本地加载

1. 打开 Chrome。
2. 进入 `chrome://extensions/`。
3. 打开右上角「开发者模式」。
4. 点击「加载已解压的扩展程序」。
5. 选择本目录：`chrome-proxy-manager`。

## 使用建议

1. 在设置页先添加代理，例如 `127.0.0.1:7890`。
2. 按需要添加规则，例如 `github.com`、`*.google.com`、`openai`。
3. 把运行模式设置为「按规则」。
4. 启用插件并保存应用。
5. 使用「域名测试」确认规则命中结果。

## 注意事项

- 插件只影响 Chrome 浏览器代理，不修改 macOS 系统代理。
- 第一版不支持用户名密码代理认证。
- 如果同时安装其他代理插件，可能互相覆盖 Chrome 代理设置。
- 停用插件会清除本插件设置的 Chrome 代理配置。

## 目录

```text
chrome-proxy-manager/
├── docs/
│   └── technical-design.md
├── manifest.json
├── README.md
└── src/
    ├── background/
    │   └── service-worker.js
    ├── core/
    │   ├── config.js
    │   ├── matcher.js
    │   ├── pac.js
    │   └── proxy.js
    ├── options/
    │   ├── options.css
    │   ├── options.html
    │   └── options.js
    └── popup/
        ├── popup.css
        ├── popup.html
        └── popup.js
```
