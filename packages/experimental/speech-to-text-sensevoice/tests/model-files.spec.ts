/** Deployer-supplied model files are inspected without writes, downloads or a worker. */
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import LocalSubprocess from '@deepseek-ai/dsh-subprocess-local'
import SpeechToText from '@deepseek-ai/dsh-experimental-speech-to-text'
import { afterEach, expect, it, vi } from 'vitest'
import { inspectRuntime, prepareRuntime } from '../src/runtime.ts'
import { Config } from '../src/config.ts'
import * as Provider from '../src/index.ts'

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return { ...actual, access: vi.fn(actual.access) }
})
const roots: string[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

async function fixture(files: readonly string[] = ['model.int8.onnx', 'tokens.txt', 'silero_vad.onnx']) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-speech-onnx-')); roots.push(root)
  for (const name of files) await writeFile(join(root, name), 'ONNX fixture')
  const config = Config({ dataRoot: root, modelDirectory: root, vadModelPath: join(root, 'silero_vad.onnx') })
  return { root, config }
}

it('restores configured model files on every provider activation without a worker', async () => {
  const { config } = await fixture()
  const ctx = new Context()
  try {
    await ctx.plugin(LocalSubprocess)
    await ctx.plugin(SpeechToText, { defaultProvider: 'sensevoice-local', language: 'auto' })
    const spawn = vi.spyOn(ctx.get('subprocess')!, 'spawn'), speech = ctx.get('speechToText')!
    for (let activation = 0; activation < 2; activation++) {
      const fiber = ctx.plugin(Provider, config)
      await fiber
      await vi.waitFor(() => { expect(speech.snapshot().providers[0]?.preparation.phase).toBe('standby') })
      expect(speech.snapshot().providers[0]?.preparation.steps?.map(({ kind, status }) => [kind, status])).toEqual([
        ['check', 'complete'], ['load', 'pending'],
      ])
      expect(spawn).not.toHaveBeenCalled()
      await fiber.dispose()
      expect(speech.snapshot().providers).toEqual([])
    }
  } finally { await ctx.fiber.dispose() }
})

it.each(['model.int8.onnx', 'tokens.txt', 'silero_vad.onnx'])('requires preparation while %s is missing', async (missing) => {
  const { config, root } = await fixture(['model.int8.onnx', 'tokens.txt', 'silero_vad.onnx'].filter(name => name !== missing))
  const signal = new AbortController().signal
  expect(await inspectRuntime(config, signal)).toBeUndefined()
  await expect(prepareRuntime(new Context(), config, signal)).rejects.toThrow(`Speech model files are missing: ${missing}`)
  expect(root).not.toContain(missing)
})

it('selects the ONNX file name by precision and returns the configured paths', async () => {
  const { config, root } = await fixture()
  const signal = new AbortController().signal
  const paths = await inspectRuntime(config, signal)
  expect(paths).toMatchObject({ model: join(root, 'model.int8.onnx'), tokens: join(root, 'tokens.txt'), vad: join(root, 'silero_vad.onnx') })
  expect(await inspectRuntime(Config(Object.assign({}, config, { precision: 'fp32' })), signal)).toBeUndefined()
  await writeFile(join(root, 'model.onnx'), 'ONNX fixture')
  expect(await inspectRuntime(Config(Object.assign({}, config, { precision: 'fp32' })), signal)).toMatchObject({ model: join(root, 'model.onnx') })
  expect(await prepareRuntime(new Context(), config, signal)).toEqual(paths)
})

it('reports filesystem access errors instead of treating unreadable files as absent', async () => {
  const { config } = await fixture()
  const failure = Object.assign(new Error('model is not readable'), { code: 'EACCES' })
  vi.mocked(access).mockRejectedValueOnce(failure)
  await expect(inspectRuntime(config, new AbortController().signal)).rejects.toBe(failure)
})

it('rejects unsupported platforms and cancelled inspection', async () => {
  const { config } = await fixture()
  vi.stubGlobal('process', { ...process, platform: 'win32', arch: 'arm64' })
  await expect(prepareRuntime(new Context(), config, new AbortController().signal)).rejects.toThrow('unavailable')
  vi.unstubAllGlobals()
  const reason = new Error('cancelled')
  await expect(inspectRuntime(config, AbortSignal.abort(reason))).rejects.toBe(reason)
})

it('contains no download endpoint in the shipped configuration', () => {
  expect(Object.keys(Config({ dataRoot: '/data', modelDirectory: '/models', vadModelPath: '/vad.onnx' })))
    .not.toEqual(expect.arrayContaining(['modelOrigin', 'modelOrigins']))
  expect(() => Config({ dataRoot: '/data' })).toThrow()
})
