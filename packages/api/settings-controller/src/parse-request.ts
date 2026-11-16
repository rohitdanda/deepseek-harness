/**
 * Request validation shared by the Remote namespaces this package owns.
 *
 * @module @deepseek-ai/dsh-api-settings-controller/src/parse-request.ts
 */

import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import type { z } from 'zod'

/**
 * Parse the domain constraints that are more specific than generated TypeScript codecs.
 * @param method - namespace-qualified method name, for the failure message.
 * @param schema - the request's Zod schema.
 * @param value - the wire arguments, as the Gateway delivered them.
 * @returns the parsed request.
 * @throws RemoteError code `gateway/bad-request`, carrying the schema's issues.
 */
export function parseRequest<T>(method: string, schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value)
  if (!parsed.success) {
    throw new RemoteError('gateway/bad-request', `invalid payload for ${method}`, { issues: parsed.error.issues })
  }
  return parsed.data
}
