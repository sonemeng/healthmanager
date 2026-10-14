# HealthManager++ v0.1.18

## 修复

- **AI 饮食建议 · 编辑清单**：修复「添加食物」输入框每敲一个字母就跳出输入框的问题。根因是表格行 key 拼入了正在编辑的食物名，名称一变整行被 React 重建、输入框焦点丢失；已改为稳定行号 key，连续输入不再跳焦（含中文输入法）。

## 技术说明

- 仅改动 `apps/web` 单文件（`diet-plan-view.tsx`），无数据库迁移、无新表、无数据变更。
- 可编辑列表的行 key 不再包含被编辑的字段值（name 等），杜绝同类问题。

## 安装与升级

- 安装前**必须同时**把 `TMP` 和 `TEMP` 指向短路径再装（NSIS 的 `GetTempPath()` **优先读 `TMP`**）：`set TMP=D:\t && set TEMP=D:\t`。Windows 会**静默跳过**解压路径超过 260 字符的文件，全程不报错。
- 覆盖安装到原目录即可；`%APPDATA%\@openvitals\desktop\data` 里的数据不会被动。

## 隐私

- 本安装包**不含任何个人数据**；你的数据始终只在本机 `%APPDATA%\@openvitals\desktop\data`（含内嵌 PostgreSQL）。
- AI 相关分析只发送到你**自己配置的 AI 渠道**，不经任何第三方中转。
