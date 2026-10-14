import { isAccessDenied, isWithheld } from './errors'

/**
 * Awaits an optional input and falls back on failure, except refused access (401/403, or the client's access
 * breaker): that is rethrown, so the caller fails instead of returning (and caching) a result that silently
 * lacks the input. Withheld data (pending / limited: nothing was sent) is rethrown too, so it is never shown as an
 * empty result. Any other failure (404, 429, 5xx, timeout, network) keeps the fallback, as before.
 */
export async function softFail<T>(promise: Promise<T>, fallback: T, onError?: (error: unknown) => void): Promise<T> {
  try {
    return await promise
  } catch (error) {
    if (isAccessDenied(error) || isWithheld(error)) throw error
    onError?.(error)
    return fallback
  }
}
