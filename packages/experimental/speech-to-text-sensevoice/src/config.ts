/** Deployment configuration for the managed local SenseVoice recognizer; model files are supplied by the deployer. */
import z from '@deepseek-ai/schemastery'
import { MAX_TIMER_DELAY_MS } from '@deepseek-ai/dsh-timeout'

/** Local runtime, inference, and retention settings. */
export interface Config {
  /** Unique registration id; consumers select this exact id. */
  providerId: string
  /** Absolute working directory of the managed worker process. */
  dataRoot: string
  /** Absolute directory containing the selected SenseVoice ONNX file (`model.int8.onnx` or `model.onnx`) and `tokens.txt`. */
  modelDirectory: string
  /** Absolute path of the Silero VAD ONNX file. */
  vadModelPath: string
  /** Weight precision; selects the ONNX file name inside `modelDirectory`. */
  precision: 'int8' | 'fp32'
  /** CPU intra-operation thread count. */
  threads: number
  /** Maximum speech segment length passed to the recognizer. */
  segmentSeconds: number
  /** Silero speech probability threshold. */
  vadThreshold: number
  /** Minimum speech duration retained by VAD. */
  minSpeechSeconds: number
  /** Silence separating two speech segments. */
  minSilenceSeconds: number
  /** Recording audio restored ahead of the first VAD segment, which cold start reports late; zero disables it. */
  vadOnsetPaddingSeconds: number
  /** Maximum decoded WAV bytes accepted by the private worker. */
  maxAudioBytes: number
  /** Deadline for resource inspection and cold model loading. */
  prepareTimeoutMs: number
  /** Deadline for one inference after the worker is ready. */
  inferenceTimeoutMs: number
  /** Idle period before stopping the worker; zero keeps it warm. */
  idleTimeoutMs: number
  /** Maximum accepted running and waiting transcriptions. */
  maxPending: number
  /** Managed process termination grace period. */
  graceMs: number
  /** Maximum retained worker diagnostic bytes. */
  maxLogBytes: number
  /** Maximum transcript response bytes. */
  maxResponseBytes: number
}

/** Validate deployment-varying runtime choices at plugin activation. */
export const Config: z<Partial<Config>, Config> = z.object({
  providerId: z.string().min(1).default('sensevoice-local'),
  dataRoot: z.string().min(1).required(),
  modelDirectory: z.string().min(1).required(),
  vadModelPath: z.string().min(1).required(),
  precision: z.union(['int8', 'fp32']).default('int8'),
  threads: z.natural().min(1).default(2),
  segmentSeconds: z.number().min(1).max(120).default(30),
  vadThreshold: z.number().min(0).max(1).default(0.5),
  minSpeechSeconds: z.number().min(0).default(0.25),
  minSilenceSeconds: z.number().min(0.01).default(0.5),
  vadOnsetPaddingSeconds: z.number().min(0).max(1).default(0.3),
  maxAudioBytes: z.natural().min(46).default(4 * 1024 * 1024),
  prepareTimeoutMs: z.natural().min(1).max(MAX_TIMER_DELAY_MS).default(3_600_000),
  inferenceTimeoutMs: z.natural().min(1).max(MAX_TIMER_DELAY_MS).default(120_000),
  idleTimeoutMs: z.natural().max(MAX_TIMER_DELAY_MS).default(300_000),
  maxPending: z.natural().min(1).default(4),
  graceMs: z.natural().min(1).max(MAX_TIMER_DELAY_MS).default(1000),
  maxLogBytes: z.natural().min(1).default(64 * 1024),
  maxResponseBytes: z.natural().min(1).default(128 * 1024),
})
