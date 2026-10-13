import { describe, expect, it, vi } from 'vitest'
import { DeadlockApiError } from '@/lib/deadlock/apiError'
import { softFail } from '@/lib/deadlock/softFail'

const apiError = (status: number | null, options: { circuitOpen?: boolean } = {}) => new DeadlockApiError(`HTTP ${status}`, status, '/v1/x', options)

describe('softFail', () => {
  it('returns the value when the input loads', async () => {
    await expect(softFail(Promise.resolve([1, 2]), [])).resolves.toEqual([1, 2])
  })

  it('rethrows refused access (401, 403, the access breaker) without calling onError', async () => {
    for (const error of [apiError(401), apiError(403), apiError(403, { circuitOpen: true })]) {
      const onError = vi.fn()
      await expect(softFail(Promise.reject(error), null, onError)).rejects.toBe(error)
      expect(onError).not.toHaveBeenCalled()
    }
  })

  it('falls back and reports every other failure: 404, 400, 429, 5xx, network, timeout, plain errors', async () => {
    const others = [apiError(404), apiError(400), apiError(429), apiError(500), apiError(503), apiError(null), new Error('boom'), new DeadlockApiError('Request failed: The operation was aborted due to timeout', null, '/v1/x')]
    for (const error of others) {
      const onError = vi.fn()
      await expect(softFail(Promise.reject(error), 'fallback', onError)).resolves.toBe('fallback')
      expect(onError).toHaveBeenCalledWith(error)
    }
  })
})
