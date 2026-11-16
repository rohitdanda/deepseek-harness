# DeepSeek 官方 LLM API 协议扩展

[English](deepseek-llm-api-wire-extensions.md) | 中文

本参考定义 [`@deepseek-ai/dsh-llm-deepseek`](../packages/llm/llm-deepseek/README.zh.md) 在 `deepseek-official` Messages 请求中发送的全部 DeepSeek Harness 专用 HTTP 标头与附加 JSON 字段。它不重新定义上游 DeepSeek API 自有字段。提供方无关的 LLM 接口与 `llm-pi-ai` 不实现这些扩展。随附 profile 不注册任何正文扩展提供方，因此其请求只携带下列标头与未经扩展的基础正文。

适配器将这些扩展发送至已解析的 `baseURL`，包括已配置的网关。扩展位于 `messages`、系统提示词和工具 schema 之外，因此不会增加模型输入 token，也不会改变模型可见前缀。

## 协议命名空间与版本

| 位置 | 命名方式 | 示例 |
|---|---|---|
| HTTP 字段名 | 小写 kebab-case；HTTP 匹配仍不区分大小写 | `user-agent`, `x-deepseek-harness-session-id` |
| DeepSeek 请求正文扩展字段 | 使用保留 `dsh_` 前缀的 snake case | `dsh_<field>` |
| DSH 持有的嵌套 JSON 成员 | Camel case | `sessionId` |

每个正文扩展独立持有自身的 `version`。版本仅适用于包含该字段的对象；不同字段的版本之间不存在兼容或排序关系。JSON 成员顺序不属于协议。

[`DeepSeekLlmApiExtensionRegistry`](../packages/llm/deepseek-llm-api-extensions/README.zh.md) 为每个顶层扩展名保留一个提供方。空名称、两端带空白的名称、重复注册以及与 DeepSeek 基础请求冲突的名称都会在 HTTP 分派前失败。

## 请求标头

| 标头 | 出现条件 | 值 |
|---|---|---|
| `user-agent` | 每个提供方 HTTP 请求，包括 Files API 操作 | 采用 `product/version (+url)` 形式的应用身份，其后追加命名所启动 profile 的 `dsh-profile/<profile>`，`tchar` 以外的字节及 `%` 做百分号编码（例如 `dsh-profile/desktop`、`dsh-profile/web`、`dsh-profile/sdk`）；默认产品为 `deepseek-harness` |
| `x-deepseek-harness-session-id` | 携带会话 id 的模型请求 | 确切的请求 `sessionId` 字符串 |
| `x-deepseek-harness-compact` | 用途为 `compaction` 的模型请求 | 字面字符串 `1` |

没有会话的直接请求会省略 `x-deepseek-harness-session-id`。会话标题请求和 Auto 审查请求没有额外的用途标头；请求携带 `sessionId` 时，仍然适用普通的会话 id 规则。

## 正文扩展事务

适配器先序列化包括确切 `messages` 在内的完整基础正文，再让已注册提供方准备字段。提供方会收到该不可变正文、请求取消信号，以及可选的 `sessionId` 和辅助调用 `purpose`。提供方返回 `undefined` 时，本次请求会省略其字段。

系统将已准备的 JSON 值与提供方持有的状态分离，再将其作为基础字段的顶层同级成员合并，并序列化到同一个 HTTP 正文中。某个贡献方准备失败时，系统在该次请求中省略其字段，且只记录首次失败，其余字段照常发送；与基础字段冲突的字段会阻止请求。合并后的正文无法序列化时，适配器发送不含任何扩展字段的基础正文，跳过接受事务，让贡献方在之后的请求中重发自身状态，并记录被省略的字段名。组合未挂载注册表时，适配器发送未经扩展的基础正文。

已配置端点返回 HTTP 2xx 后，适配器会在读取 SSE 正文之前运行已准备的 `accept()` 事务。传输失败和非 2xx 响应不会接受任何贡献。接受失败会记录告警，但不会使模型请求失败；贡献方会在之后的请求中重发未被接受的状态。接受仅记录端点级 HTTP 成功，不表示 SSE 流已完整结束，也不表示端点已持久化扩展。

## 暴露内容与接收方要求

请求标头会暴露 Harness 应用版本、所启动 profile 的名称和可选的会话标识。随附 profile 不在标头或正文字段中发送会话内容、插件清单或持久标识符。通过 `baseURL` 选定的网关会收到与官方端点相同的值。已注册的正文扩展提供方自行决定其字段的内容，并负责该字段的披露。

接收方按名称寻址扩展字段，按各字段自身的 `version` 分派，并忽略 JSON 成员顺序。没有注册表或某项贡献时，基础请求仍然可用；字段缺失表示该贡献不适用于本次请求。
