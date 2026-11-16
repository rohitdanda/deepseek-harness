/** Deployer-supplied model files and managed command execution for local transcription. */
import { access } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-subprocess'
import type { Config } from './config.ts'

/** ONNX file names inside `modelDirectory`, selected by `precision`. */
const MODEL_FILES: Readonly<Record<Config['precision'], string>> = { int8: 'model.int8.onnx', fp32: 'model.onnx' }
const TOKENS_FILE = 'tokens.txt'

/** Model and process paths, private to the local provider. */
export interface RuntimePaths {
  readonly model: string
  readonly tokens: string
  readonly vad: string
  readonly worker: string
}

function resolveRuntime(config: Config): RuntimePaths {
  const supported = ['darwin-arm64', 'darwin-x64', 'linux-arm64', 'linux-x64', 'win32-x64']
  if (!supported.includes(`${process.platform}-${process.arch}`)) throw new Error(`Local speech is unavailable for ${process.platform}-${process.arch}`)
  return {
    model: join(config.modelDirectory, MODEL_FILES[config.precision]), tokens: join(config.modelDirectory, TOKENS_FILE),
    vad: config.vadModelPath,
    /* v8 ignore next -- built worker resolution is exercised by real Node and Electron process smokes */
    worker: fileURLToPath(new URL(import.meta.url.endsWith('.ts') ? './worker.ts' : './worker.js', import.meta.url)),
  }
}

async function missingFiles(paths: RuntimePaths, signal: AbortSignal): Promise<string[]> {
  const missing: string[] = []
  for (const path of [paths.model, paths.tokens, paths.vad]) {
    signal.throwIfAborted()
    try { await access(path) }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      missing.push(path)
    }
  }
  return missing
}

/**
 * Inspect the configured model files without writing files or starting the worker.
 * @param config - model directory, VAD file and selected precision.
 * @param signal - provider cancellation or inspection deadline.
 * @returns the model paths when all three files exist; otherwise undefined. Unreadable paths reject.
 */
export async function inspectRuntime(config: Config, signal: AbortSignal): Promise<RuntimePaths | undefined> {
  const paths = resolveRuntime(config)
  return (await missingFiles(paths, signal)).length === 0 ? paths : undefined
}

/**
 * Resolve the configured model files and the bundled native runtime.
 * @param _ctx - Host context owning the preparation task.
 * @param config - model directory, VAD file and selected precision.
 * @param signal - preparation cancellation or deadline.
 * @returns model and worker paths; rejects naming each missing file's base name when a file is absent.
 */
export async function prepareRuntime(_ctx: Context, config: Config, signal: AbortSignal): Promise<RuntimePaths> {
  const paths = resolveRuntime(config)
  const missing = await missingFiles(paths, signal)
  if (missing.length > 0) throw new Error(`Speech model files are missing: ${missing.map(path => path.split(/[\\/]/u).at(-1)).join(', ')}`)
  return paths
}
