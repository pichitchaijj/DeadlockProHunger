import { DeadlockApiError } from './apiError'

/**
 * What went wrong, in terms the UI can explain. Kept separate from the client so pages can
 * classify errors without importing fetch logic.
 *   rate-limit   upstream answered 429 even after one retry
 *   timeout      no answer within the call's budget
 *   invalid      the response didn't match the documented shape (zod)
 *   not-found    4xx other than 429 (e.g. unknown id)
 *   unavailable  network failure or 5xx
 */
export type DataErrorKind = 'rate-limit' | 'timeout' | 'invalid' | 'not-found' | 'unavailable'

/** Carries an already-classified failure across a loader boundary (e.g. a loader that returns { ok: false }). */
export class DataError extends Error {
  readonly kind: DataErrorKind
  constructor(message: string, kind: DataErrorKind) {
    super(message)
    this.name = 'DataError'
    this.kind = kind
  }
}

export function classifyError(error: unknown): DataErrorKind {
  if (error instanceof DataError) return error.kind
  if (!(error instanceof DeadlockApiError)) return 'unavailable'
  if (error.status === 429) return 'rate-limit'
  if (error.status !== null && error.status >= 400 && error.status < 500) return 'not-found'
  if (/Unexpected response shape/.test(error.message)) return 'invalid'
  if (/timeout|aborted/i.test(error.message)) return 'timeout'
  return 'unavailable'
}

/**
 * Upstream says the thing doesn't exist (yet): a 4xx other than 429. A rate limit must never read as
 * "missing": that would tell users a real match or rank doesn't exist (docs/QA.md § Rate limits).
 */
export function isMissing(error: unknown): boolean {
  return error instanceof DeadlockApiError && error.status !== null && error.status >= 400 && error.status < 500 && error.status !== 429
}

/**
 * Awaits a page load and keeps *why* it failed, so the page can say so with DataNotice
 * (rate limited, slow, unexpected data, unavailable) instead of a generic error. Logs the failure.
 */
export async function attempt<T>(label: string, promise: Promise<T>): Promise<{ ok: true; value: T } | { ok: false; kind: DataErrorKind }> {
  try {
    return { ok: true, value: await promise }
  } catch (error) {
    console.error(label, error)
    return { ok: false, kind: classifyError(error) }
  }
}
