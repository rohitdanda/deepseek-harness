/** Inputs to the experimental translation service. */
import type { SessionId, SessionSeq } from '@deepseek-ai/dsh-session/types'

/** Explicit native DeepSeek credential route selected for translation. */
export type TranslationProvider = 'deepseek-official'

/** Text and language tags supplied by a consumer. */
export interface TranslationRequest {
  /** Complete text submitted to the selected provider. */
  readonly text: string
  /** Destination language tag, inserted verbatim into the translation instruction. */
  readonly targetLanguage: string
  /** Source language; omission uses automatic detection. */
  readonly sourceLanguage?: string
  /** Route selection; omission uses the service's configured provider. */
  readonly provider?: TranslationProvider
  /** Existing Session for durable results; a cache miss requires it to be active. Omission is rejected. */
  readonly sessionId?: SessionId
}

/** Fully resolved native request with its required durable Session identity. */
export interface TranslationSpec {
  /** Complete text submitted to the selected provider. */
  readonly text: string
  /** Destination language tag. */
  readonly targetLanguage: string
  /** Source language tag, or `auto` for automatic detection. */
  readonly sourceLanguage: string
  /** Selected native model route. */
  readonly provider: TranslationProvider
  /** Existing durable Session; required before request admission. */
  readonly sessionId: SessionId
}

/** Provider-independent identity of one reusable translation. */
export interface TranslationIdentity {
  /** Explicit provider route; results from different providers remain distinct. */
  readonly provider: string
  /** Exact submitted source fragment. */
  readonly text: string
  /** Requested source language, including automatic detection. */
  readonly sourceLanguage: string
  /** Requested destination language. */
  readonly targetLanguage: string
  /** Protocol, endpoint, or model/prompt settings that affect translation semantics. */
  readonly recipe: string
}

/** One translation attempt, committed durably before external dispatch. */
export interface TranslationRequestRecord extends TranslationIdentity {
  /** Optional provider-owned request details; contains no credential values. */
  readonly metadata?: Record<string, unknown>
}

/** Successful translated text linked to its durable request attempt. */
export interface TranslationResultRecord {
  /** Sequence of the preceding translator request in the same Session. */
  readonly requestSeq: SessionSeq
  /** Complete validated translation. */
  readonly text: string
}

declare module '@deepseek-ai/dsh-session/types' {
  interface PluginRecordMap {
    /** Provider-independent translation input, retained before dispatch. */
    'plugin:translator/request': TranslationRequestRecord
    /** Successful translation, retained before it is returned to the consumer. */
    'plugin:translator/result': TranslationResultRecord
  }
}

/** Failures distinct from caller cancellation and service disposal. */
export type TranslationErrorCode = 'TRANSLATION_TEXT_LIMIT' | 'TRANSLATION_INVALID_RESPONSE' | 'TRANSLATION_RESPONSE_LIMIT' | 'TRANSLATION_REQUEST_FAILED' | 'TRANSLATION_TIMEOUT'
  | 'TRANSLATION_SESSION_REQUIRED' | 'TRANSLATION_SESSION_INACTIVE' | 'TRANSLATION_STORAGE_ERROR'
  | 'TRANSLATION_UNAVAILABLE'
