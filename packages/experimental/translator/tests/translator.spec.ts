/** Service configuration, request resolution and unload behavior that need no native model route. */
import { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session'
import { afterEach, describe, expect, it } from 'vitest'
import Translator, { TranslationError, type Config, type TranslationSpec } from '../src/index.ts'

const cleanups: Array<() => Promise<void>> = []
const sessionId = brandString<SessionId>('source-session')

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})

async function mount(overrides: Partial<Config> = {}) {
  const ctx = new Context()
  cleanups.push(async () => { await ctx.fiber.dispose() })
  const fiber = ctx.plugin(Translator, Translator.Config(overrides))
  await fiber
  return { ctx, fiber, translator: ctx.translator }
}

describe('translator service', () => {
  it('resolves the official route and automatic source detection by default', async () => {
    const { translator } = await mount()
    expect(translator.maxTextChars).toBe(4000)
    expect(translator.resolve({ text: 'Hello world.', targetLanguage: 'zh', sessionId }))
      .toEqual({ text: 'Hello world.', targetLanguage: 'zh', sourceLanguage: 'auto', provider: 'deepseek-official', sessionId })
    expect(translator.resolve({ text: 'Hello', targetLanguage: 'ja', sourceLanguage: 'en', provider: 'deepseek-official', sessionId }))
      .toEqual({ text: 'Hello', targetLanguage: 'ja', sourceLanguage: 'en', provider: 'deepseek-official', sessionId })
  })

  it('requires a durable Session and accepts the exact UTF-16 limit', async () => {
    const { translator } = await mount({ maxTextChars: 2 })
    expect(() => translator.resolve({ text: '😀', targetLanguage: 'zh' }))
      .toThrow(expect.objectContaining({ code: 'TRANSLATION_SESSION_REQUIRED' }))
    expect(translator.resolve({ text: '😀', targetLanguage: 'zh', sessionId }).text).toBe('😀')
    expect(() => translator.resolve({ text: '😀a', targetLanguage: 'zh', sessionId })).toThrow(TranslationError)
    expect(() => translator.resolve({ text: '😀a', targetLanguage: 'zh', sessionId }))
      .toThrow(expect.objectContaining({ code: 'TRANSLATION_TEXT_LIMIT' }))
    const oversized: TranslationSpec = { text: '😀a', targetLanguage: 'zh', sourceLanguage: 'auto', provider: 'deepseek-official', sessionId }
    await expect(translator.translate(oversized)).rejects.toThrow(expect.objectContaining({ code: 'TRANSLATION_TEXT_LIMIT' }))
  })

  it('validates routes and numerical limits before activation', () => {
    expect(Translator.Config({})).toMatchObject({ provider: 'deepseek-official', maxTextChars: 4000, maxResponseBytes: 1024 * 1024,
      deepseekTimeoutMs: 60_000, deepseekMaxOutputTokens: 8192 })
    for (const field of ['maxTextChars', 'maxResponseBytes', 'deepseekTimeoutMs', 'deepseekMaxOutputTokens']) {
      expect(() => Translator.Config({ [field]: 0 })).toThrow()
    }
    expect(() => Translator.Config({ maxTextChars: 1 })).toThrow()
    for (const provider of ['bing', 'google', 'other']) {
      expect(() => z.resolve({ provider }, Translator.Config, {})).toThrow()
    }
  })

  it('rejects calls after the service unloads', async () => {
    const { ctx, fiber, translator } = await mount()
    const spec = translator.resolve({ text: 'hello', targetLanguage: 'zh', sessionId })
    await fiber.dispose()
    expect(ctx.get('translator')).toBeUndefined()
    expect(() => translator.resolve({ text: 'hello', targetLanguage: 'zh', sessionId })).toThrow('Translator service disposed')
    await expect(translator.translate(spec)).rejects.toThrow('Translator service disposed')
  })
})
