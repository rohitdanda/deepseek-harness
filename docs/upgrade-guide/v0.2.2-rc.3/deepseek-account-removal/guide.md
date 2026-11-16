---
kind: upgrade-guide
description: DeepSeek account sign-in and the plugins that provided it are removed, so profiles naming their plugin ids fail to load and DeepSeek models need an API key.
---

# DeepSeek account sign-in removal

English | [中文](guide.zh.md)

## Change

DeepSeek Harness no longer signs in to a DeepSeek account. DeepSeek models are reached only with an API key from `DEEPSEEK_API_KEY` or the local credential store.

Removed plugin ids: `deepseek-account`, `llm-deepseek-account`, and `ui-settings-account`. Their `@deepseek-ai/dsh-` packages are no longer published: `deepseek-account`, `llm-deepseek-account`, and `client-ui-settings-account`. The Loader fails on a row that names a removed plugin.

Also removed:

- The `deepseek-account` model provider and route, the `deepseekAccount` service, and the `account` Remote namespace with its `deepseek-account/*` events.
- Platform sign-in and the profile, balance, usage, and top-up surfaces, including the embedded Platform page in Desktop.
- The `searchBilling` and `fetchBilling` settings of the DeepSeek Search and Fetch APIs; stored values still load and have no effect.
- The `session/initializeDefaultModel` Remote, the `session/provider-credentials-unavailable` and `session/provider-models-unavailable` error details, and the `ACCOUNT_QUOTA`, `ACCOUNT_SIGN_IN_REQUIRED`, and `ACCOUNT_TOKEN_INVALID` error codes of `@deepseek-ai/dsh-llm`.
- The `deepseek-account` value of the `translator` `provider` setting; a stored `deepseek-account` value fails at load.

A Session whose saved model selection names provider `deepseek-account` still loads; its selection reports the model as unavailable until you choose another model. A stored account grant is no longer read.

## Migration

1. Delete every row whose `id` or `name` matches a removed plugin from custom profile `cordis.patch.yml` files, overlays, and `--patch` files.
2. Remove the removed packages from custom profile dependencies with `dsh plugin --profile <name> remove <package>`.
3. Set `DEEPSEEK_API_KEY`, or save an API key on the Models settings page, then select a DeepSeek model again.
4. Replace a `translator` `provider` value of `deepseek-account` with `deepseek-official`.
5. In SDK clients, remove calls to the `account` Remote namespace and `session/initializeDefaultModel`, and branches on the removed error codes.
6. Start `dsh --profile <name>`; it loads without an unknown-plugin error.
