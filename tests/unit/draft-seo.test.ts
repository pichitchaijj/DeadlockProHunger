import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { locales } from '@/i18n/config'
import { draftIndexing } from '@/features/draft/seo'

/*
 * Draft Lab indexing: the empty board keeps canonical + hreflang; any query string (a draft, a filter, an unknown
 * parameter) is noindex + nofollow without alternates, in every locale.
 */

const ORIGIN = 'https://deadlock-pro-hunger.vercel.app'

describe('draft indexing', () => {
  const env = process.env.SITE_URL
  beforeEach(() => {
    process.env.SITE_URL = ORIGIN
  })
  afterEach(() => {
    if (env === undefined) delete process.env.SITE_URL
    else process.env.SITE_URL = env
  })

  it('keeps the base Draft page indexable with its own canonical and hreflang', () => {
    expect(draftIndexing({}, 'en')).toEqual({ alternates: expect.objectContaining({ canonical: `${ORIGIN}/draft` }) })
    const ja = draftIndexing({}, 'ja')
    expect(ja.robots).toBeUndefined()
    expect(ja.alternates?.canonical).toBe(`${ORIGIN}/ja/draft`)
    expect(Object.keys(ja.alternates?.languages ?? {})).toEqual([...locales, 'x-default'])
  })

  it('is noindex, nofollow without alternates for a valid draft query, in every locale', () => {
    for (const l of locales) {
      expect(draftIndexing({ allies: 'haze,abrams', enemies: 'seven' }, l)).toEqual({ robots: { index: false, follow: false } })
      expect(draftIndexing({ window: '30d' }, l)).toEqual({ robots: { index: false, follow: false } })
    }
  })

  it('is noindex, nofollow for unknown, empty or repeated parameters too', () => {
    for (const params of [{ utm_source: 'x' }, { allies: '' }, { allies: ['haze', 'abrams'] }, { foo: undefined }]) {
      expect(draftIndexing(params, 'ja'), JSON.stringify(params)).toEqual({ robots: { index: false, follow: false } })
    }
  })
})
