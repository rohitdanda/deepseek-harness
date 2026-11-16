/**
 * Host owner of the `authorization` Remote namespace: the human-guided sign-in
 * flows of `ctx.authorization` as a browser configuration page runs them.
 *
 * The seam hands a flow an interaction object that lives as long as one call;
 * this namespace keeps that shape by making the attempt one Remote stream. The
 * stream carries the flow's notices and prompts down and the page's answers
 * back up, and it ends when the attempt does. Closing the stream withdraws the
 * attempt, so a page that goes away never leaves a sign-in running that nobody
 * can answer.
 *
 * @module @deepseek-ai/dsh-api-settings-controller/src/authorization.ts
 */

import { Context } from '@deepseek-ai/cordis'
import { AuthorizationDeclinedError, AuthorizationError } from '@deepseek-ai/dsh-authorization'
import type {
  AuthorizationEntry, AuthorizationInteraction, AuthorizationNotice, AuthorizationPrompt, AuthorizationService,
} from '@deepseek-ai/dsh-authorization'
import { isCredentialKeySegment, parseCredentialKey } from '@deepseek-ai/dsh-credentials'
import type { CredentialProvider } from '@deepseek-ai/dsh-credentials'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { RemoteStream } from '@deepseek-ai/dsh-typert-protocol'
import { z } from 'zod'
import { parseRequest } from './parse-request.ts'
import type { AuthorizationFrame, AuthorizationReply, AuthorizationStatusView } from './types.ts'

/** Whether a wire string is exactly `<scope>/<id>` with both segments in the key grammar. */
function isCredentialKey(value: string): boolean {
  const segments = value.split('/')
  return segments.length === 2 && segments.every(isCredentialKeySegment)
}

const keySchema = z.string()
  .refine(isCredentialKey, { message: 'must be "<scope>/<id>" with lowercase hyphenated segments' })
  .transform(value => parseCredentialKey(value))
const keyRequestSchema = z.object({ key: keySchema })
const beginRequestSchema = z.object({ key: keySchema, method: z.string().min(1).optional() })

/** The waiting end of one prompt frame. */
interface PendingPrompt {
  /** The option ids a `select` prompt accepts; absent for free text. */
  readonly options?: ReadonlySet<string>
  answer(value: string): void
  decline(): void
  fail(error: Error): void
}

/**
 * The surface half of one attempt, over one Remote stream. The seam's callbacks
 * fill an ordered frame queue the stream drains; the page's replies settle the
 * prompt each one names.
 */
class RemoteInteraction implements AuthorizationInteraction {
  private readonly frames: AuthorizationFrame[] = []
  private readonly pending = new Map<string, PendingPrompt>()
  private counter = 0
  private consumerWake: (() => void) | undefined
  private ended: { readonly error?: unknown } | undefined

  /**
   * Queue a flow notice for the page.
   * @param notice - the flow's message and any page or code it refers to.
   */
  notify(notice: AuthorizationNotice): void {
    this.push({
      type: 'notice',
      message: notice.message,
      ...notice.url === undefined ? {} : { url: notice.url },
      ...notice.code === undefined ? {} : { code: notice.code },
    })
  }

  /**
   * Queue a question for the page and wait for its reply. A `secret` question is
   * refused here: a key typed into this stream would travel in a call argument,
   * and the Models page already has a write-only field for keys.
   * @param prompt - what to ask, and how it is presented.
   * @returns the typed text or the chosen option's id.
   * @throws {AuthorizationDeclinedError} when the page declines or stops answering.
   * @throws {AuthorizationError} when the prompt is a `secret`, its choice is not an offered option,
   *   or the flow withdrew it.
   */
  prompt(prompt: AuthorizationPrompt): Promise<string> {
    if (prompt.kind === 'secret') {
      return Promise.reject(new AuthorizationError(
        'a secret prompt cannot be answered over this channel; store the key through the credentials page',
        'SECRET_PROMPT_UNSUPPORTED',
      ))
    }
    if (prompt.signal?.aborted === true) {
      return Promise.reject(new AuthorizationError('the prompt was withdrawn before it was shown', 'PROMPT_WITHDRAWN'))
    }
    const id = String(++this.counter)
    return new Promise<string>((resolve, reject) => {
      const settle = (outcome: () => void): void => {
        prompt.signal?.removeEventListener('abort', withdraw)
        outcome()
      }
      const withdraw = (): void => {
        if (!this.pending.delete(id)) return
        this.push({ type: 'prompt-withdrawn', id })
        reject(new AuthorizationError('the prompt was withdrawn', 'PROMPT_WITHDRAWN'))
      }
      this.pending.set(id, {
        ...prompt.kind === 'select' ? { options: new Set(prompt.options.map(option => option.id)) } : {},
        answer: (value) => { settle(() => { resolve(value) }) },
        decline: () => { settle(() => { reject(new AuthorizationDeclinedError()) }) },
        fail: (error) => { settle(() => { reject(error) }) },
      })
      prompt.signal?.addEventListener('abort', withdraw, { once: true })
      this.push(prompt.kind === 'select'
        ? {
          type: 'prompt',
          id,
          kind: 'select',
          message: prompt.message,
          options: prompt.options.map(option => ({
            id: option.id,
            label: option.label,
            ...option.description === undefined ? {} : { description: option.description },
          })),
        }
        : {
          type: 'prompt',
          id,
          kind: 'text',
          message: prompt.message,
          ...prompt.placeholder === undefined ? {} : { placeholder: prompt.placeholder },
        })
    })
  }

  /**
   * Read the page's replies until its uplink ends, answering the prompt each names.
   * @param uplink - the Remote invocation's uplink.
   * @returns after the uplink ends, by which point no prompt is left open.
   */
  async consume(uplink: AsyncIterable<AuthorizationReply>): Promise<void> {
    try {
      for await (const reply of uplink) this.reply(reply)
    } catch (_uplinkFailure) {
      // The Gateway fails the stream itself when an uplink item is rejected;
      // what is left to do here is to stop waiting for answers that cannot come.
    } finally {
      this.declineAll()
    }
  }

  /**
   * Finish the stream after its last queued frame.
   * @param frame - the closing frame, queued before the stream ends.
   */
  finish(frame: AuthorizationFrame): void {
    this.push(frame)
    this.end({})
  }

  /**
   * Fail the stream after every frame already queued.
   * @param error - what the stream's consumer receives once the queue is drained.
   */
  fail(error: Error): void {
    this.end({ error })
  }

  /**
   * Drain the queued frames in order, waiting for more until the attempt ends.
   * @returns the frames, completing at `finish` and throwing the `fail` error.
   */
  async *drain(): AsyncGenerator<AuthorizationFrame> {
    while (true) {
      const next = this.frames.shift()
      if (next !== undefined) {
        yield next
        continue
      }
      if (this.ended !== undefined) {
        if ('error' in this.ended) throw this.ended.error
        return
      }
      await new Promise<void>((resolve) => { this.consumerWake = resolve })
    }
  }

  /** Decline every prompt still waiting: nobody is left to answer it. */
  private declineAll(): void {
    for (const [id, waiting] of [...this.pending]) {
      this.pending.delete(id)
      waiting.decline()
    }
  }

  /**
   * Settle the prompt a reply names. A reply for a prompt that is gone — one
   * the flow withdrew while the answer was in flight — is dropped: there is no
   * question left for it to answer.
   */
  private reply(reply: AuthorizationReply): void {
    const waiting = this.pending.get(reply.id)
    if (waiting === undefined) return
    this.pending.delete(reply.id)
    if (reply.value === null) {
      waiting.decline()
    } else if (waiting.options !== undefined && !waiting.options.has(reply.value)) {
      waiting.fail(new AuthorizationError(`"${reply.value}" is not one of the offered options`, 'INVALID_ANSWER'))
    } else {
      waiting.answer(reply.value)
    }
  }

  private push(frame: AuthorizationFrame): void {
    if (this.ended !== undefined) return
    this.frames.push(frame)
    this.wakeConsumer()
  }

  private end(outcome: { readonly error?: unknown }): void {
    this.ended ??= outcome
    this.wakeConsumer()
  }

  private wakeConsumer(): void {
    const wake = this.consumerWake
    this.consumerWake = undefined
    wake?.()
  }
}

/**
 * Report one seam or flow failure as the namespace's refusal, carrying the
 * flow's own message the way a settings page shows a credential refusal.
 * @param key - the credential record the attempt addressed.
 * @param error - whatever the seam or the flow threw.
 * @returns the failure to raise.
 */
function rejection(key: string, error: unknown): RemoteError {
  return new RemoteError(
    'authorization/rejected',
    error instanceof Error ? error.message : String(error),
    { key },
    { cause: error },
  )
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Host owner of the `authorization` Remote namespace. */
    authorizationController: AuthorizationController
  }
}

/**
 * Host service backing the generated `ctx.remote.authorization` namespace. It
 * lets one browser page run a registered authorization flow and answer its
 * questions. No frame or result carries a credential: the flow commits the
 * record through the credential store itself, and this namespace reports only
 * whether one is stored.
 */
export class AuthorizationController extends TypertRemoteService {
  /** @param ctx - Host context where the authorization and credential services may be mounted. */
  constructor(ctx: Context) {
    super(ctx, 'authorizationController', { namespace: 'authorization' })
  }

  /**
   * Describe one flow and whether its credential is stored.
   * @param key - credential record key the flow writes, as `<scope>/<id>`.
   * @returns the flow's methods, whether an attempt runs, and whether a record is stored;
   *   null when no flow is registered for the key.
   * @throws RemoteError when the key is malformed or no authorization service is mounted.
   */
  @Remote
  async status(key: string): Promise<AuthorizationStatusView | null> {
    const request = parseRequest('authorization.status', keyRequestSchema, { key })
    const entry = this.service().describe(request.key)
    return entry === undefined ? null : this.view(entry)
  }

  /**
   * Run one sign-in attempt, streaming what the flow tells the human.
   * @param key - credential record key whose flow to run, as `<scope>/<id>`.
   * @param method - which of the flow's methods to run; omitted runs its first.
   * @param signal - the stream's lifetime; ending it withdraws the attempt.
   * @returns notice and prompt frames in order, ending with one `settled` frame. The page answers a
   *   prompt by sending an {@link AuthorizationReply} on the same stream.
   * @throws RemoteError `authorization/rejected` when no flow claims the key, the method is not
   *   offered, an attempt is already running, or the flow fails; `gateway/bad-request` for a malformed key.
   */
  @Remote({ mode: 'stream' })
  async *begin(
    key: string,
    method: string | undefined,
    signal: AbortSignal,
  ): RemoteStream<AuthorizationFrame, AuthorizationReply> {
    const request = parseRequest('authorization.begin', beginRequestSchema, { key, method })
    const service = this.service()
    const { invocation } = this.ctx
    if (invocation === undefined) {
      throw new RemoteError('gateway/internal', 'authorization.begin runs only inside a Remote invocation', {})
    }
    const interaction = new RemoteInteraction()
    // Taken before the attempt starts: the uplink is available once, and a
    // prompt can be shown the moment the flow runs.
    void interaction.consume(invocation.uplink<AuthorizationReply>())
    const lifetime = new AbortController()
    const attempt = service.begin({
      key: request.key,
      ...request.method === undefined ? {} : { method: request.method },
      interaction,
      signal: AbortSignal.any([signal, lifetime.signal]),
    }).then(
      (outcome) => { interaction.finish({ type: 'settled', status: outcome.status }) },
      (error: unknown) => { interaction.fail(rejection(key, error)) },
    )
    // `consume` is not awaited: the Gateway ends the uplink only after this
    // stream returns, so waiting for it here would wait on ourselves.
    try {
      yield* interaction.drain()
    } finally {
      lifetime.abort()
      await attempt
    }
  }

  /**
   * Forget the stored credential of one flow. Nothing is revoked at the issuer.
   * @param key - credential record key whose record to delete, as `<scope>/<id>`.
   * @returns the flow's status after the record is gone.
   * @throws RemoteError `authorization/rejected` when no flow claims the key, an attempt is
   *   running, or the store refuses the delete.
   */
  @Remote
  async signOut(key: string): Promise<AuthorizationStatusView> {
    const request = parseRequest('authorization.signOut', keyRequestSchema, { key })
    const entry = this.service().describe(request.key)
    if (entry === undefined) {
      throw new RemoteError('authorization/rejected', `no authorization flow is registered for "${key}"`, { key })
    }
    if (entry.inFlight) {
      throw new RemoteError('authorization/rejected', `a sign-in for "${key}" is running; cancel it first`, { key })
    }
    try {
      await this.credentials().deleteRecord(request.key)
    } catch (error: unknown) {
      throw rejection(key, error)
    }
    return this.view(entry)
  }

  /** One flow's wire view, with whether its record is stored. */
  private async view(entry: AuthorizationEntry): Promise<AuthorizationStatusView> {
    const stored = await this.credentials().describeRecord(entry.key)
    return {
      key: entry.key,
      label: entry.label,
      methods: entry.methods.map(({ id, label }) => ({ id, label })),
      inFlight: entry.inFlight,
      signedIn: stored.configured,
    }
  }

  /** Resolve the optional authorization service or report how to supply it. */
  private service(): AuthorizationService {
    const service = this.ctx.get('authorization')
    if (service === undefined) {
      throw new RemoteError(
        'gateway/internal',
        'authorization service is absent: mount @deepseek-ai/dsh-authorization in the profile composition',
        {},
      )
    }
    return service
  }

  /** Resolve the optional credential provider or report how to supply it. */
  private credentials(): CredentialProvider {
    const credentials = this.ctx.get('credentials')
    if (credentials === undefined) {
      throw new RemoteError(
        'gateway/internal',
        'credentials service is absent: this deployment does not mount a credential provider (e.g. @deepseek-ai/dsh-credentials-local) in its composition',
        {},
      )
    }
    return credentials
  }
}

export default AuthorizationController
