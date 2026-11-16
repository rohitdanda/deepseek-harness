---
kind: upgrade-guide
description: "DeepSeek 账号登录以及提供该功能的插件均已移除，因此命名这些插件 id 的 profile 将无法加载，DeepSeek 模型需要 API key。"
---

# 移除 DeepSeek 账号登录

[English](guide.md) | 中文

## 变更

DeepSeek Harness 不再登录 DeepSeek 账号。只能使用来自 `DEEPSEEK_API_KEY` 或本地凭据存储的 API key 访问 DeepSeek 模型。

已移除的插件 id：`deepseek-account`、`llm-deepseek-account` 和 `ui-settings-account`。它们对应的 `@deepseek-ai/dsh-` 包不再发布：`deepseek-account`、`llm-deepseek-account` 和 `client-ui-settings-account`。配置行命名了已移除插件时，Loader 会加载失败。

同时移除：

- `deepseek-account` 模型提供方与路由、`deepseekAccount` 服务，以及 `account` Remote 命名空间及其 `deepseek-account/*` 事件。
- Platform 登录以及资料、余额、用量和充值入口，包括 Desktop 中内嵌的 Platform 页面。
- DeepSeek Search API 与 Fetch API 的 `searchBilling` 和 `fetchBilling` 设置；已保存的值仍可加载，但不再有任何效果。
- `session/initializeDefaultModel` Remote、错误详情 `session/provider-credentials-unavailable` 和 `session/provider-models-unavailable`，以及 `@deepseek-ai/dsh-llm` 的错误码 `ACCOUNT_QUOTA`、`ACCOUNT_SIGN_IN_REQUIRED` 和 `ACCOUNT_TOKEN_INVALID`。
- `translator` 的 `provider` 设置中的 `deepseek-account` 取值；已保存的 `deepseek-account` 值会在加载时失败。

已保存的模型选择命名了提供方 `deepseek-account` 的会话仍可加载；在你另选模型之前，其选择会报告该模型不可用。已保存的账号授权不再被读取。

## 迁移

1. 从自定义 profile 的 `cordis.patch.yml`、overlay 和 `--patch` 文件中，删除 `id` 或 `name` 与已移除插件匹配的每一行。
2. 用 `dsh plugin --profile <name> remove <package>` 从自定义 profile 的依赖中移除这些已移除的包。
3. 设置 `DEEPSEEK_API_KEY`，或在“模型”设置页保存 API key，然后重新选择 DeepSeek 模型。
4. 把 `translator` 的 `provider` 取值 `deepseek-account` 替换为 `deepseek-official`。
5. 在 SDK 客户端中，删除对 `account` Remote 命名空间和 `session/initializeDefaultModel` 的调用，以及针对已移除错误码的分支。
6. 启动 `dsh --profile <name>`；它应能加载，且没有未知插件错误。
