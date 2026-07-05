## Userscript 版本号
- 默认更新脚本时，使用形如 `20250304` 的日期作为版本号。
- 如果不记得当前日期，可通过 `date` 命令获取，再据此修改 version。
- 每次修改完脚本，都应该更新 version。

## Userscript 匹配规则
- 在 `@match` 和 `@include` 都能满足功能的情况下，优先使用 `@match`。

## 提交前检查
- 本仓库使用 `prek` 管理提交前 hook。
- clone 后应运行 `prek install` 安装本地 hook。
