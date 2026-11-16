/** Native-owner Host with real JSONL storage, live Sessions, and restartable persistence. */
import type { Context, Fiber } from '@deepseek-ai/cordis'
import { createAssistantMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import { SESSION_FORMAT_VERSION, type SessionId, SessionSeq, type Session, type SessionEvent, type SessionHeader } from '@deepseek-ai/dsh-session'
import type { SessionHandle } from '@deepseek-ai/dsh-session-persistence'
import { readFile, readdir } from 'node:fs/promises'
import type { ServerResponse } from 'node:http'
import { join } from 'node:path'
import type { Config } from '../src/index.ts'
import { brandString } from '@deepseek-ai/dsh-brand'
import { paidFixture, replyEvents, sse, type NativeRequest } from './paid-fixture.ts'

/** One native model request, reduced to the fragment the translator submitted. */
export interface StorageWireCall { path: string; text: string }
/** Fixture-owned response control; the model endpoint is the only simulated external service. */
export interface StorageFixtureOptions {
  reply?: (call: StorageWireCall, response: ServerResponse) => void | Promise<void>
  /** HTTP status of each model response; a function is read per request. */
  responseStatus?: number | (() => number)
  translator?: Partial<Config>
  withPersistence?: boolean
  withSessions?: boolean
}

/** Complete native text reply for the selected request. */
export function storageReply(_call: StorageWireCall, response: ServerResponse, text = 'Stored translation'): void {
  response.end(sse(replyEvents(text)))
}

function wireCall(request: NativeRequest): StorageWireCall {
  const messages = request.body.messages as Array<{ content: Array<{ text: string }> }>
  return { path: request.path, text: messages[0]!.content[0]!.text }
}

function mainEvents(): SessionEvent[] {
  return [
    { type: 'turn/start', seq: SessionSeq(0), time: 1, data: { turn: 1 } },
    { type: 'user/message', seq: SessionSeq(1), time: 2, surfaceOp: 'append',
      data: createUserMessage({ content: [{ type: 'text', text: 'Main conversation' }], source: { kind: 'user' } }) },
    { type: 'step/start', seq: SessionSeq(2), time: 3, data: { turn: 1, step: 1 } },
    { type: 'assistant/message', seq: SessionSeq(3), time: 4, surfaceOp: 'append', data: { turn: 1, step: 1, stream: [],
      message: createAssistantMessage({ content: [{ type: 'reasoning', text: 'Original paragraph' }],
        source: { provider: 'main-provider', model: 'main-model' } }) } },
    { type: 'step/end', seq: SessionSeq(4), time: 5, data: { turn: 1, step: 1 } },
    { type: 'turn/end', seq: SessionSeq(5), time: 6, data: { turn: 1, reason: { kind: 'completed' } } },
  ]
}

/**
 * Create private, atomically allocated resources and register teardown before use.
 * @param cleanups - owning test's reverse-order quiescent cleanup list.
 * @param options - model reply control and optional storage omission.
 * @returns the real Host composition, restart operation, and Session/storage observations.
 */
export async function storageFixture(cleanups: Array<() => Promise<void>>, options: StorageFixtureOptions = {}) {
  const config = options.translator ?? {}
  const native = await paidFixture(cleanups, {
    withSession: false, translator: config,
    ...options.withPersistence === undefined ? {} : { withPersistence: options.withPersistence },
    ...options.withSessions === undefined ? {} : { withSessionStore: options.withSessions },
    ...options.responseStatus === undefined ? {} : { responseStatus: options.responseStatus },
    reply: async (response, request) => {
      const call = wireCall(request)
      if (options.reply === undefined) storageReply(call, response)
      else await options.reply(call, response)
    },
  })
  const createSession = async (id: SessionId = brandString<SessionId>('stored-translation'), live = true) => {
    const ctx = native.ctx
    const events = mainEvents()
    const header: SessionHeader = { version: SESSION_FORMAT_VERSION, id, createdAt: 1, cwd: native.root, isSeeded: false,
      delegationDepth: 0 }
    let session: Session | undefined, scope: Fiber | undefined, writer: SessionHandle | undefined
    if (live) {
      scope = ctx.plugin({ inject: ['sessions'], apply(owner: Context) {
        session = owner.sessions.create(id, { meta: { createdAt: 1, cwd: native.root, isSeeded: false, delegationDepth: 0 } })
      } })
      await scope.await()
      if (session === undefined) throw new Error('Live Session was not published')
      writer = await ctx.sessionPersistence.create(session.header)
      for (const event of events) {
        switch (event.type) {
          case 'user/message': session.append(event.type, event.data, { surfaceOp: 'append' }); break
          case 'assistant/message': session.append(event.type, event.data, { surfaceOp: 'append' }); break
          case 'turn/start': session.append(event.type, event.data); break
          case 'step/start': session.append(event.type, event.data); break
          case 'step/end': session.append(event.type, event.data); break
          case 'turn/end': session.append(event.type, event.data); break
          default: throw new Error('Unexpected main fixture event')
        }
      }
      await ctx.sessions.flush(session)
    } else {
      await using handle = await ctx.sessionPersistence.create(header)
      await handle.append(events)
      await handle.flush()
    }
    const artifacts = (await readdir(native.storedRoot, { recursive: true })).filter(value => value.endsWith(join(id, `session.v${SESSION_FORMAT_VERSION}.jsonl`)))
    if (artifacts.length !== 1) throw new Error('Expected one current Session artifact')
    const file = join(native.storedRoot, artifacts[0]!)
    return { id, session, scope, writer, events: await native.readEvents(id), file, bytes: await readFile(file) }
  }
  return { get ctx() { return native.ctx }, root: native.root, config, errors: native.errors, readEvents: native.readEvents, createSession,
    get requests(): StorageWireCall[] { return native.requests.map(wireCall) },
    async restart() { await native.restart() } }
}
