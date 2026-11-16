/**
 * Browser-safe vocabulary of the configuration surfaces this package serves:
 * their failure codes and the sign-in frames of the `authorization` namespace.
 * The redacted views themselves live with their seam in
 * `@deepseek-ai/dsh-settings/types`, whose Cordis event declarations already
 * register that file for the Client compilation face.
 *
 * @module @deepseek-ai/dsh-api-settings-controller/types
 */

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /**
     * Every seam refusal that is not a stale write: an unregistered or malformed
     * namespace, a read-only provider, schema validation, storage.
     */
    'settings/rejected': { readonly ns: string }
    /**
     * The stored revision moved after the caller read it. Its own outcome rather
     * than an invalid request: the caller must re-read and re-apply.
     */
    'settings/conflict': { readonly ns: string; readonly expected: number; readonly actual: number }
    /**
     * The provider refused a valid credential write, for example because the
     * stored document no longer parses. The details name only the reference,
     * never the value.
     */
    'credential/rejected': { readonly ref: string }
    /**
     * A sign-in could not start, failed, or was refused: no flow is registered
     * for the credential, the method is not one it offers, an attempt is already
     * running, or the flow itself failed. The details name only the credential
     * record, never anything a flow handled.
     */
    'authorization/rejected': { readonly key: string }
  }
}

/** Confirmation that the settings document was handed to the native editor. */
export interface SettingsDocumentOpenValue {
  readonly opened: true
}

/** One way an authorization flow can obtain its credential. */
export interface AuthorizationMethodView {
  /** Flow-owned identifier, echoed back by `begin` to pick this method. */
  readonly id: string
  /** The flow's own name for the method; page copy comes from the page's dictionary instead. */
  readonly label: string
}

/** One registered authorization flow as a configuration page sees it. */
export interface AuthorizationStatusView {
  /** Credential record key the flow writes, as `<scope>/<id>`. */
  readonly key: string
  /** The flow's name for what it authorizes, such as the provider it signs into. */
  readonly label: string
  /** The methods the flow offers, most preferred first. */
  readonly methods: readonly AuthorizationMethodView[]
  /** Whether an attempt for this key is running now, in this or another page. */
  readonly inFlight: boolean
  /** Whether a credential record is stored under the key; never its content. */
  readonly signedIn: boolean
}

/** One choice of a `select` prompt. */
export interface AuthorizationOptionView {
  /** Value the page answers with when this choice is picked. */
  readonly id: string
  readonly label: string
  readonly description?: string
}

/**
 * What a running attempt tells the page that started it, in order. A frame
 * never carries a secret: the flow's notices are one-way by contract, and a
 * `secret` prompt is refused before it reaches the page.
 */
export type AuthorizationFrame =
  /** Progress, or what to do next; `url` and `code` are the page to open and what to enter there. */
  | { readonly type: 'notice'; readonly message: string; readonly url?: string; readonly code?: string }
  /** A question the flow needs answered; the page replies with the same `id`. */
  | {
    readonly type: 'prompt'
    readonly id: string
    readonly kind: 'text' | 'select'
    readonly message: string
    readonly placeholder?: string
    readonly options?: readonly AuthorizationOptionView[]
  }
  /** The flow stopped waiting for this prompt, for example because another answer won a race. */
  | { readonly type: 'prompt-withdrawn'; readonly id: string }
  /** The attempt ended without a failure; the stream completes after this frame. */
  | { readonly type: 'settled'; readonly status: 'authorized' | 'cancelled' }

/** The page's answer to one prompt frame. */
export interface AuthorizationReply {
  /** The `id` of the prompt frame being answered. */
  readonly id: string
  /** The typed text or chosen option id; `null` declines the prompt, which cancels the attempt. */
  readonly value: string | null
}
