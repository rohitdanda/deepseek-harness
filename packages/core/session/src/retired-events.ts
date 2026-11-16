/**
 * Event vocabulary of features that no longer exist in this build.
 *
 * Released Session logs contain these events. Keeping them in {@link SessionEventMap}
 * keeps those logs readable: the persistence read path refuses a non-ignorable
 * event whose type is outside `KNOWN_SESSION_EVENT_TYPES`. No code in this
 * repository appends any of them, nothing derives model history from them, and
 * no service reads them.
 * @module @deepseek-ai/dsh-session/retired-events
 */

import type { Branded } from '@deepseek-ai/dsh-brand'
import type { MessageId } from '@deepseek-ai/dsh-llm/types'

/** Category a human filed a retired feedback event under. */
type RetiredFeedbackCategory =
  | 'task-result'
  | 'instruction-following'
  | 'product-interaction'
  | 'service-stability'
  | 'resource-cost'
  | 'security-privacy-permission'
  | 'other'

/** Retired payload of `feedback/record`. */
interface RetiredFeedbackRecord {
  /** Free-text remark with surrounding whitespace removed; never empty when present. */
  readonly text?: string
  /** Category the human filed the remark under. */
  readonly category?: RetiredFeedbackCategory
}

/** Retired current value of one message rating. */
interface RetiredMessageFeedbackItem {
  /** Stable identity of the assistant message inside the owning Session. */
  readonly messageId: MessageId
  /** Overall positive or negative judgment. */
  readonly rating: 'positive' | 'negative'
  /** Optional explanation. */
  readonly note?: string
  /** Category the human filed the judgment under. */
  readonly category?: RetiredFeedbackCategory
  /** Equality-only token that changed with every material update. */
  readonly version: Branded<'MessageFeedbackVersion'>
  /** Creation time in Unix epoch milliseconds. */
  readonly createdAt: number
  /** Time of the most recent material update in Unix epoch milliseconds. */
  readonly updatedAt: number
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /** Retired, log-only human remark about a Session; it never entered model context. */
    'feedback/record': RetiredFeedbackRecord
    /** Retired, log-only creation or edit of one message rating. */
    'feedback/message-put': { readonly sessionId: import('@deepseek-ai/dsh-session/types').SessionId; readonly item: RetiredMessageFeedbackItem }
    /** Retired, log-only deletion of one message rating. */
    'feedback/message-delete': { readonly sessionId: import('@deepseek-ai/dsh-session/types').SessionId; readonly messageId: MessageId }
    /** Retired marker that the configured endpoint accepted a Session-log upload through `throughSeq`. */
    'session-log-deepseek/delivery-accepted': {
      /** Session identity the accepted delivery carried; inherited fork markers retain the parent's id. */
      readonly sessionId: import('@deepseek-ai/dsh-session/types').SessionId
      /** Accepted Session format generation; absence identifies version 0. */
      readonly sessionFormatVersion?: number
      /** Last canonical event included in the accepted request. */
      readonly throughSeq: import('@deepseek-ai/dsh-session/types').SessionSeq
    }
  }
}
