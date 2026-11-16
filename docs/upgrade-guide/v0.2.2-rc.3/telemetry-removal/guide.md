---
kind: upgrade-guide
description: Telemetry, analytics, feedback, Session-log upload, the Desktop auto-updater, and the plugins that provided them are removed, so profiles naming their plugin ids fail to load.
---

# Telemetry and upload removal

English | [中文](guide.zh.md)

## Change

DeepSeek Harness no longer sends telemetry, product analytics, feedback, Session logs, plugin inventories, or an anonymous user id. Shipped profiles contact only the configured model endpoints and the tools you direct.

Removed plugin ids: `otel`, `session-telemetry-otel`, `desktop-product-telemetry`, `product-analytics`, `session-log-deepseek`, `plugin-package-inventory-deepseek`, `command-feedback`, `message-feedback`, `ui-message-feedback`, `ui-settings-session-log`, and `ui-account-notifications`. Their `@deepseek-ai/dsh-` packages are no longer published: `otel`, `session-telemetry`, `session-telemetry-otel`, `host-product-telemetry-otel`, `client-product-analytics`, `session-log-deepseek`, `plugin-package-inventory-deepseek`, `anonymous-user-id`, `command-feedback`, `message-feedback`, `client-ui-message-feedback`, `client-ui-settings-session-log`, and `client-ui-account-notifications`. The Loader fails on a row that names a removed plugin.

Also removed:

- Environment variables `DSH_TELEMETRY_DISABLED`, `DSH_TELEMETRY_MODE`, `DSH_TELEMETRY_OTLP_URL`, and `DSH_PRODUCT_ANALYTICS_OTLP_URL`; setting them has no effect.
- The `/feedback` command, message ratings, and the **Upload Session Log** setting.
- The `x-deepseek-harness-user-id` request header and the `dsh_session_log` and `dsh_plugin_packages` request fields. `$DSH_HOME/.anonymous-user-id` is no longer read.
- `ProfileContext.telemetryDisabledEnv` and `resolveTelemetryPatch` in `@deepseek-ai/dsh-app-boot`.
- The Desktop auto-updater, its mandatory update policy, and DeepSeek account notifications.
- The maintainer Desktop publication pipeline: the `Publish Desktop` workflows, the upload, purge, and rollback commands, and the `DOWNLOAD_*` and `DSH_DESKTOP_AUTO_UPDATE_ENV` settings in Desktop packaging dotenv files and machine presets. The `test_release_id` and `update_channel` packaging workflow inputs are gone; the packaging workflows keep each installer only as a GitHub Actions artifact.

Existing Session logs that contain `feedback/*` or `session-log-deepseek/delivery-accepted` events still load.

## Migration

1. Delete every row whose `id` or `name` matches a removed plugin from custom profile `cordis.patch.yml` files, overlays, and `--patch` files.
2. Remove the removed packages from custom profile dependencies with `dsh plugin --profile <name> remove <package>`.
3. Delete the four environment variables from shells, CI, and `.env` files.
4. In code that embeds `@deepseek-ai/dsh-app-boot`, remove reads of `ProfileContext.telemetryDisabledEnv` and calls to `resolveTelemetryPatch`.
5. In gateways and receivers, stop expecting the removed header and request fields. The base request and `x-deepseek-harness-session-id` are unchanged.
6. Install new Desktop releases manually; Desktop no longer checks for updates.
7. If you build Desktop yourself, delete `DSH_DESKTOP_AUTO_UPDATE_ENV` and every `DOWNLOAD_*` line from `.env.windows`, `.env.macos`, and machine presets; the packaging loader rejects them as unsupported settings.
8. Optionally delete `$DSH_HOME/.anonymous-user-id`.
9. Start `dsh --profile <name>`; it loads without an unknown-plugin error.
