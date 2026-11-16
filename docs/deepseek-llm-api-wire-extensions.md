# Official DeepSeek LLM API wire extensions

English | [中文](deepseek-llm-api-wire-extensions.zh.md)

This reference defines every DeepSeek Harness-specific HTTP header and additive JSON field sent by [`@deepseek-ai/dsh-llm-deepseek`](../packages/llm/llm-deepseek/README.md) on `deepseek-official` Messages requests. It does not redefine fields owned by the upstream DeepSeek API. The provider-neutral LLM interface and `llm-pi-ai` do not implement these additions. The shipped profiles register no body-extension provider, so their requests carry the headers below and an unextended base body.

The adapter sends the additions to its resolved `baseURL`, including a configured gateway. They remain outside `messages`, system prompts, and tool schemas, so they do not add model-input tokens or alter the model-visible prefix.

## Wire namespaces and versioning

| Location | Naming | Examples |
|---|---|---|
| HTTP field names | Lowercase kebab-case; HTTP matching remains case-insensitive | `user-agent`, `x-deepseek-harness-session-id` |
| DeepSeek request-body extension fields | Snake case with the reserved `dsh_` prefix | `dsh_<field>` |
| DSH-owned nested JSON members | Camel case | `sessionId` |

Each body extension owns its `version` independently. A version applies only to the object that contains it; no compatibility or ordering relationship exists between versions of different fields. JSON member order is not part of the protocol.

The [`DeepSeekLlmApiExtensionRegistry`](../packages/llm/deepseek-llm-api-extensions/README.md) reserves one provider per top-level extension name. Empty or whitespace-padded names, duplicate registrations, and collisions with the base DeepSeek request fail before HTTP dispatch.

## Request headers

| Header | Presence | Value |
|---|---|---|
| `user-agent` | Every provider HTTP request, including Files API operations | Application identity in `product/version (+url)` form, followed by `dsh-profile/<profile>` naming the booted profile, percent-encoded outside `tchar` and for `%` (for example `dsh-profile/desktop`, `dsh-profile/web`, `dsh-profile/sdk`); the default product is `deepseek-harness` |
| `x-deepseek-harness-session-id` | Model requests carrying a Session id | The exact request `sessionId` string |
| `x-deepseek-harness-compact` | Model requests whose purpose is `compaction` | The literal string `1` |

A direct request without a Session omits `x-deepseek-harness-session-id`. Session-title and Auto review requests have no additional purpose header; the ordinary Session-id rule still applies when one carries a `sessionId`.

## Body-extension transaction

The adapter serializes the complete base body, including the exact `messages`, before it asks registered providers to prepare fields. A provider receives that immutable body, the request cancellation signal, and optional `sessionId` and auxiliary-call `purpose`. Returning `undefined` omits that provider's field for the request.

Prepared JSON values are detached from provider-owned state, merged as top-level siblings of the base fields, and serialized in the same HTTP body. A contributor whose preparation fails is omitted from that request, with only its first failure logged, while the other fields are still sent; a field that collides with a base field prevents the request. If the merged body fails to serialize, the adapter sends the base body without any extension field, skips the acceptance transaction so contributors resend their state on a later request, and logs the omitted field names. A composition without the registry sends the unextended base body.

After the configured endpoint returns HTTP 2xx, the adapter runs the prepared `accept()` transaction before reading the SSE response body. Transport failures and non-2xx responses do not accept any contribution. An acceptance failure is logged and does not fail the model request; the contributor resends its unaccepted state on a later request. Acceptance records endpoint-level HTTP success; it does not assert that an SSE stream completed or that the endpoint persisted an extension.

## Exposure and receiver requirements

The request headers expose the Harness application version, the booted profile name, and an optional Session identity. The shipped profiles send no Session content, plugin inventory, or persistent identifier in headers or body fields. A gateway selected through `baseURL` receives the same values as the official endpoint. A registered body-extension provider chooses its field's content and owns that field's disclosure.

Receivers address extension fields by name, dispatch each field by its own `version`, and ignore JSON member ordering. The base request remains usable without the registry or a particular contribution; field absence means that contribution did not apply to that request.
