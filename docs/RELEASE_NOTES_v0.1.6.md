# HealthManager++ v0.1.6

## 修复

- **设置 → AI 模型渠道：拉取模型列表不再挑地址**。以前只会请求 `BaseURL/models`，BaseURL 没写到 `/v1` 就必然失败；现在会按 `/v1/models` → `/models` 依次尝试，失败时把**每次尝试的地址与 HTTP 状态**一起显示出来，便于定位。
- **Anthropic 原生渠道也能拉模型列表**。以前用 `Authorization: Bearer` 请求，会被 Anthropic 拒绝（它需要 `x-api-key` + `anthropic-version`）。
- **中转站的各种返回格式都能解析**：`{data:[{id}]}`、`{data:["id"]}`、`{models:[{name}]}`、裸数组，以及带 BOM 的响应。
- 修正桌面端打包脚本 `prepare-runtime` 在严格类型检查下的两个类型错误（不影响运行，但会让 `typecheck` 失败）。

## 新增

- **手动添加模型**：拉取不到、或列表里没有想要的模型时，直接输入模型名 →「添加并设为默认」，立刻生效（以前没有任何手动入口）。
- **拉取后勾选**：拉回来的模型列表支持 **全选 / 全不选 / 按名称过滤 / 逐个勾选**，再点「保存勾选的 N 个模型」——中转站常有几百个模型，不必全塞进下拉框。
- **自己指定默认模型**：模型列表里每个模型一行，点「设为默认」即可切换（当前默认显示「默认中」），也可以单个「移除」。

## 安装与升级

- 安装前**必须同时**把 `TMP` 和 `TEMP` 指向短路径再装（NSIS 的 `GetTempPath()` **优先读 `TMP`**）：`set TMP=D:\t && set TEMP=D:\t`。Windows 会**静默跳过**解压路径超过 260 字符的文件，全程不报错：实测只设 `TEMP` 会少装约 1870 个文件，两个都设只少 187 个（都是超长路径的依赖文件，`@opentelemetry/api/build/esm/**`，不影响使用）。
- 覆盖安装到原目录即可；`%APPDATA%\@openvitals\desktop\data` 里的数据不会被动。

## 隐私

- 本安装包**不含任何个人数据**；你的数据始终只在本机 `%APPDATA%\@openvitals\desktop\data`（含内嵌 PostgreSQL）。
