import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DeadlockApiError } from '@/lib/deadlock/apiError'
import { classifyError, DataError, isAccessDenied, isMissing } from '@/lib/deadlock/errors'

/*
 * Refused access (401/403) is its own error kind: it says nothing about whether the data exists, so it must
 * never read as "not found" (no rank, match not available). 404 keeps meaning "the source has no data".
 */

const deadlockGet = vi.fn()
vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ unstable_cache: (fn: (...args: unknown[]) => unknown) => fn }))
vi.mock('@/lib/deadlock/client', () => ({ deadlockGet: (...args: unknown[]) => deadlockGet(...args), DeadlockApiError }))

const { getPlayerRank } = await import('@/lib/deadlock/playerEndpoints')
const { getMatchDetail } = await import('@/lib/deadlock/matchDetail')

const apiError = (status: number | null, message = `HTTP ${status}`) => new DeadlockApiError(message, status, '/v1/x')

beforeEach(() => {
  deadlockGet.mockReset()
})

describe('classifyError', () => {
  it('classifies 401 and 403 as forbidden', () => {
    expect(classifyError(apiError(401))).toBe('forbidden')
    expect(classifyError(apiError(403))).toBe('forbidden')
  })

  it('keeps 404 and other 4xx as not-found, 429 as rate-limit', () => {
    expect(classifyError(apiError(404))).toBe('not-found')
    expect(classifyError(apiError(400))).toBe('not-found')
    expect(classifyError(apiError(429))).toBe('rate-limit')
  })

  it('keeps 5xx, network failures, shape mismatches and timeouts as before', () => {
    expect(classifyError(apiError(503))).toBe('unavailable')
    expect(classifyError(apiError(null, 'Request failed: fetch failed'))).toBe('unavailable')
    expect(classifyError(apiError(200, 'Unexpected response shape: invalid'))).toBe('invalid')
    expect(classifyError(apiError(null, 'Request failed: The operation was aborted due to timeout'))).toBe('timeout')
    expect(classifyError(new Error('boom'))).toBe('unavailable')
  })

  it('passes an already classified DataError through', () => {
    expect(classifyError(new DataError('refused', 'forbidden'))).toBe('forbidden')
  })
})

describe('isAccessDenied', () => {
  it('is true only for 401 and 403 from the client', () => {
    expect(isAccessDenied(apiError(401))).toBe(true)
    expect(isAccessDenied(apiError(403))).toBe(true)
    for (const status of [400, 404, 429, 500, null]) expect(isAccessDenied(apiError(status)), String(status)).toBe(false)
    expect(isAccessDenied(new Error('HTTP 403'))).toBe(false)
  })
})

describe('isMissing', () => {
  it('never treats refused access or a rate limit as missing data', () => {
    for (const status of [401, 403, 429]) expect(isMissing(apiError(status)), String(status)).toBe(false)
  })

  it('treats 400 and 404 as missing, 5xx and other errors as not', () => {
    expect(isMissing(apiError(404))).toBe(true)
    expect(isMissing(apiError(400))).toBe(true)
    expect(isMissing(apiError(503))).toBe(false)
    expect(isMissing(new Error('boom'))).toBe(false)
  })
})

describe('DeadlockApiError', () => {
  it('marks client-side refusals separately and defaults to an upstream answer', () => {
    expect(apiError(403).circuitOpen).toBe(false)
    expect(new DeadlockApiError('circuit open', 403, '/v1/x', { circuitOpen: true }).circuitOpen).toBe(true)
  })
})

describe('getPlayerRank', () => {
  it('returns null when the source has no rank (404)', async () => {
    deadlockGet.mockRejectedValue(apiError(404))
    await expect(getPlayerRank(1)).resolves.toBeNull()
  })

  it('throws on refused access (403) instead of reporting "no rank"', async () => {
    deadlockGet.mockRejectedValue(apiError(403))
    await expect(getPlayerRank(1)).rejects.toMatchObject({ status: 403 })
  })
})

describe('getMatchDetail', () => {
  it('returns null when the match is not available (404)', async () => {
    deadlockGet.mockRejectedValue(apiError(404))
    await expect(getMatchDetail(1)).resolves.toBeNull()
  })

  it('throws on refused access (403) instead of reporting "not available"', async () => {
    deadlockGet.mockRejectedValue(apiError(403))
    await expect(getMatchDetail(1)).rejects.toMatchObject({ status: 403 })
  })
})
