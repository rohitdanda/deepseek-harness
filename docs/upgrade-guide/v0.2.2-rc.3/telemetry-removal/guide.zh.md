---
kind: upgrade-guide
description: "遥测、分析、反馈、会话日志上传、Desktop 自动更新以及提供这些功能的插件均已移除，因此命名这些插件 id 的 profile 将无法加载。"
---

# 移除遥测与上传

[English](guide.md) | 中文

## 变更

DeepSeek Harness 不再发送遥测、产品分析数据、反馈、会话日志、插件清单或匿名用户 id。随附 profile 只访问所配置的模型端点和你指示的工具。

已移除的插件 id：`otel`、`session-telemetry-otel`、`desktop-product-telemetry`、`product-analytics`、`session-log-deepseek`、`plugin-package-inventory-deepseek`、`command-feedback`、`message-feedback`、`ui-message-feedback`、`ui-settings-session-log` 和 `ui-account-notifications`。它们对应的 `@deepseek-ai/dsh-` 包不再发布：`otel`、`session-telemetry`、`session-telemetry-otel`、`host-product-telemetry-otel`、`client-product-analytics`、`session-log-deepseek`、`plugin-package-inventory-deepseek`、`anonymous-user-id`、`command-feedback`、`message-feedback`、`client-ui-message-feedback`、`client-ui-settings-session-log` 和 `client-ui-account-notifications`。配置行命名了已移除插件时，Loader 会加载失败。

同时移除：

- 环境变量 `DSH_TELEMETRY_DISABLED`、`DSH_TELEMETRY_MODE`、`DSH_TELEMETRY_OTLP_URL` 和 `DSH_PRODUCT_ANALYTICS_OTLP_URL`；设置它们不再有任何效果。
- `/feedback` 命令、消息评分以及**上传 Session Log** 设置。
- 请求标头 `x-deepseek-harness-user-id`，以及请求字段 `dsh_session_log` 和 `dsh_plugin_packages`。`$DSH_HOME/.anonymous-user-id` 不再被读取。
- `@deepseek-ai/dsh-app-boot` 中的 `ProfileContext.telemetryDisabledEnv` 和 `resolveTelemetryPatch`。
- Desktop 自动更新、其强制更新策略以及 DeepSeek 账号通知。
- 维护者的 Desktop 发布流程：`Publish Desktop` 工作流，上传、缓存清除和回滚命令，以及 Desktop 打包 dotenv 文件和机器 preset 中的 `DOWNLOAD_*` 与 `DSH_DESKTOP_AUTO_UPDATE_ENV` 设置。打包工作流的 `test_release_id` 和 `update_channel` 输入已移除；打包工作流只把每个安装包保存为 GitHub Actions 产物。

已有会话日志中的 `feedback/*` 或 `session-log-deepseek/delivery-accepted` 事件仍可加载。

## 迁移

1. 从自定义 profile 的 `cordis.patch.yml`、overlay 和 `--patch` 文件中，删除 `id` 或 `name` 与已移除插件匹配的每一行。
2. 用 `dsh plugin --profile <name> remove <package>` 从自定义 profile 的依赖中移除这些已移除的包。
3. 从 shell、CI 和 `.env` 文件中删除这四个环境变量。
4. 在嵌入 `@deepseek-ai/dsh-app-boot` 的代码中，删除对 `ProfileContext.telemetryDisabledEnv` 的读取和对 `resolveTelemetryPatch` 的调用。
5. 在网关和接收方中，不再期待已移除的标头与请求字段。基础请求和 `x-deepseek-harness-session-id` 保持不变。
6. 手动安装新的 Desktop 版本；Desktop 不再检查更新。
7. 如果自行构建 Desktop，请从 `.env.windows`、`.env.macos` 和机器 preset 中删除 `DSH_DESKTOP_AUTO_UPDATE_ENV` 及所有 `DOWNLOAD_*` 行；打包加载器会把它们当作不支持的设置拒绝。
8. 可选：删除 `$DSH_HOME/.anonymous-user-id`。
9. 启动 `dsh --profile <name>`；它应能加载，且没有未知插件错误。
