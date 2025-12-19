# Userscripts For DCjanus

自用的一些 Userscript，在满足自己需求的基础上，尽可能通用化。

由于我只使用 [Tampermonkey](https://www.tampermonkey.net/)，所以其他脚本管理器下的表现不保证。

**GreasyFork 的反馈功能不太好用，可以到 [GitHub issue](https://github.com/DCjanus/userscripts/issues) 反馈**

# 脚本列表

## [MoviePlus](https://greasyfork.org/zh-CN/scripts/469243)（豆瓣电影增强）

豆瓣电影增强脚本，包含以下功能：

-   豆瓣电影页面右侧添加若干快速入口，一键搜索相关相关资源

> Fork 自 [94leon/movie.plus](https://github.com/94leon/movie.plus)

## [BiliTab](https://greasyfork.org/zh-CN/scripts/469242)（B 站视频后台标签页打开）

B 站动态视频卡片等地方自己劫持了点击事件，而不是使用 a 标签的默认行为，导致无法 Ctrl + 鼠标左键后台新标签页打开；想快速打开多个视频时，操作体验较差。

点击脚本设置，可以分页面控制脚本开关，对应的行为：

-   在开启脚本情况下，默认后台新标签页打开；按住 Ctrl 键后，前台新标签页打开。
-   在关闭脚本情况下，默认前台新标签页打开；按住 Ctrl 键后，后台新标签页打开。

## CodexUsageRemainingTime（Codex 用量窗口剩余时间）

用于 [Codex 用量页面](https://chatgpt.com/codex/settings/usage) 显示每个用量窗口剩余时间，开发中，暂未发布至 GreasyFork。

# 其他我正在使用的脚本

-   [Make BiliBili Great Again](https://greasyfork.org/zh-CN/scripts/415714) B 站辅助脚本，有关闭 P2P CDN 等功能
