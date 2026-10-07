import { describe, expect, it } from 'vitest'
import { heroPerformance, isStale, patchExcerpt } from '@/features/home/model'
import { classifyError, isMissing } from '@/lib/deadlock/errors'
import { DeadlockApiError } from '@/lib/deadlock/apiError'

/* Synthetic inputs only. */
describe('patchExcerpt', () => {
  const preview = `<div class="bbWrapper"><div class="unfurl">Deadlock -  Minor Update - 08-22-2026 - Steam News<br />
				- Radiant Regeneration: Heal on cast reduced from 70 to 65 - Restorative Locket: Spirit &quot;Resistance&quot; reduced<br />
				store.steampowered.com</div></div>`

  it('shows the preview as headline + truncated text, nothing counted', () => {
    expect(patchExcerpt(preview, 60)).toEqual({
      headline: 'Deadlock - Minor Update - 08-22-2026',
      text: '- Radiant Regeneration: Heal on cast reduced from 70 to 65 -…',
    })
  })

  it('returns null for an empty preview', () => {
    expect(patchExcerpt('<div></div>')).toBeNull()
  })
})

describe('freshness', () => {
  it('marks data stale only past its budget', () => {
    expect(isStale(0, 1000, 999)).toBe(true)
    expect(isStale(0, 1000, 1000)).toBe(false)
  })
})

describe('classifyError', () => {
  it('maps upstream failures to explainable kinds', () => {
    expect(classifyError(new DeadlockApiError('HTTP 429', 429, '/x'))).toBe('rate-limit')
    expect(classifyError(new DeadlockApiError('HTTP 404', 404, '/x'))).toBe('not-found')
    expect(classifyError(new DeadlockApiError('Unexpected response shape: bad', 200, '/x'))).toBe('invalid')
    expect(classifyError(new DeadlockApiError('Request failed: The operation was aborted due to timeout', null, '/x'))).toBe('timeout')
    expect(classifyError(new DeadlockApiError('HTTP 503', 503, '/x'))).toBe('unavailable')
    expect(classifyError(new Error('boom'))).toBe('unavailable')
  })

  it('never treats a rate limit as "doesn’t exist"', () => {
    expect(isMissing(new DeadlockApiError('HTTP 404', 404, '/x'))).toBe(true)
    expect(isMissing(new DeadlockApiError('HTTP 400', 400, '/x'))).toBe(true)
    expect(isMissing(new DeadlockApiError('HTTP 429', 429, '/x'))).toBe(false)
    expect(isMissing(new DeadlockApiError('HTTP 503', 503, '/x'))).toBe(false)
    expect(isMissing(new Error('boom'))).toBe(false)
  })
})

describe('heroPerformance', () => {
  const h = (id: number, winRate: number, pickRate: number, sample: 'low' | 'moderate' | 'high' = 'high') => ({
    id, slug: `h${id}`, name: `Hero ${id}`, iconUrl: null, winRate, pickRate, matches: 1_000, sample,
  })
  const heroes = [h(1, 0.55, 0.1), h(2, 0.6, 0.05, 'low'), h(3, 0.52, 0.4), h(4, 0.5, 0.3), h(5, 0.49, 0.2), h(6, 0.48, 0.25), h(7, 0.47, 0.15)]

  it('ranks the top 5 by win rate and pick rate, never Low-sample heroes', () => {
    const p = heroPerformance(heroes, null)
    expect(p.winRate.map((r) => r.slug)).toEqual(['h1', 'h3', 'h4', 'h5', 'h6'])
    expect(p.pickRate.map((r) => r.slug)).toEqual(['h3', 'h4', 'h6', 'h5', 'h7'])
    expect(p.bans).toBeNull()
  })

  it('reports bans as counts and shares of recorded bans, not a rate', () => {
    const p = heroPerformance(heroes, [{ hero_id: 1, bans: 30 }, { hero_id: 3, bans: 50 }, { hero_id: 99, bans: 20 }, { hero_id: 4, bans: 0 }])
    expect(p.bans!.total).toBe(100)
    expect(p.bans!.rows).toEqual([
      { slug: 'h3', name: 'Hero 3', imageSrc: undefined, bans: 50, share: 0.5 },
      { slug: 'h1', name: 'Hero 1', imageSrc: undefined, bans: 30, share: 0.3 },
    ])
  })
})
