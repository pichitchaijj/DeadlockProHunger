import type { IncomingMessage } from 'node:http'
import { isValidElement, type ReactElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getPathMatch } from 'next/dist/shared/lib/router/utils/path-match'
import { matchHas } from 'next/dist/shared/lib/router/utils/prepare-destination'
import { defaultLocale, locales } from '@/i18n/config'
import { localizedPath, pageAlternates } from '@/i18n/seo'
import { DRAFT_PARAMS, parseDraftQuery } from '@/features/draft/query'
import { draftRedirects, draftRewrites } from '@/features/draft/routing'

/*
 * The cached empty Draft board (src/features/draft/routing.ts, app/[lang]/draft/board): which requests are
 * rewritten to it, the board path's direct-access redirect, its metadata, and its stale-on-error behavior.
 * Routes are evaluated with Next's own matchers (path match + has/missing), as next.config.ts applies them.
 */

vi.mock('server-only', () => ({}))
const getDraftData = vi.fn()
vi.mock('@/features/draft/loaders', () => ({ getDraftData: (...args: unknown[]) => getDraftData(...args) }))
const redirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT ${url}`)
})
vi.mock('next/navigation', async (importOriginal) => ({ ...(await importOriginal<object>()), redirect: (url: string) => redirect(url) }))
let currentLocale = 'en'
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => key,
  getLocale: async () => currentLocale,
}))

const ORIGIN = 'https://deadlock-pro-hunger.vercel.app'
const REQ = { headers: {} } as IncomingMessage

/** Where a request ends up after the beforeFiles rewrite (pathname as the proxy hands it on: English as /en/…). */
function rewritten(pathname: string, query: Record<string, string> = {}): string {
  for (const r of draftRewrites()) {
    const params = getPathMatch(r.source)(pathname)
    if (params && matchHas(REQ, query, [], r.missing)) return r.destination.replace(':lang', String(params.lang))
  }
  return pathname
}

/** The redirect for an incoming URL, or null. */
function redirected(pathname: string): string | null {
  for (const r of draftRedirects()) {
    const params = getPathMatch(r.source)(pathname)
    if (params) return r.destination.replace(':lang', String(params.lang))
  }
  return null
}

/** A valid, non-default value for each Draft parameter. */
const SAMPLE: Record<(typeof DRAFT_PARAMS)[number], string> = { allies: 'haze', enemies: 'seven', side: 'enemies', window: '30d', rank: 'top' }

describe('DRAFT_PARAMS', () => {
  it('lists exactly the keys parseDraftQuery reads', () => {
    const read = new Set<string>()
    parseDraftQuery(new Proxy({}, { get: (_, key) => (read.add(String(key)), undefined) }))
    expect([...read].sort()).toEqual([...DRAFT_PARAMS].sort())
  })

  it('each parameter changes the board on its own', () => {
    const empty = parseDraftQuery({})
    for (const key of DRAFT_PARAMS) expect(parseDraftQuery({ [key]: SAMPLE[key] }), key).not.toEqual(empty)
  })

  it('unknown parameters (tracking) leave the empty board unchanged', () => {
    expect(parseDraftQuery({ utm_source: 'x', utm_campaign: 'y', ref: 'z', fbclid: '1' })).toEqual(parseDraftQuery({}))
  })
})

describe('rewrite to the cached board', () => {
  const internal = (l: string) => `/${l}/draft` // what the proxy hands on (English is rewritten to /en/…)

  it('serves the clean Draft URL in every locale from the cached route', () => {
    for (const l of locales) expect(rewritten(internal(l)), l).toBe(`/${l}/draft/board`)
  })

  it('keeps every URL with a Draft parameter on the dynamic route, in every locale', () => {
    for (const l of locales) {
      for (const key of DRAFT_PARAMS) expect(rewritten(internal(l), { [key]: SAMPLE[key] }), `${l} ${key}`).toBe(internal(l))
      expect(rewritten(internal(l), { allies: 'haze,abrams', enemies: 'seven', utm_source: 'x' })).toBe(internal(l))
    }
  })

  it('serves tracking-only and empty Draft parameters from the cached route (the board they render is the empty one)', () => {
    for (const l of locales) {
      expect(rewritten(internal(l), { utm_source: 'x' }), l).toBe(`/${l}/draft/board`)
      expect(rewritten(internal(l), { allies: '' }), l).toBe(`/${l}/draft/board`)
      expect(parseDraftQuery({ allies: '' })).toEqual(parseDraftQuery({}))
    }
  })

  it('only matches the Draft page itself', () => {
    for (const path of ['/xx/draft', '/ja/draft/board', '/ja/drafts', '/ja/meta', '/draft']) expect(rewritten(path), path).toBe(path)
  })
})

describe('direct access to the board path', () => {
  it('redirects to the clean Draft URL in every locale', () => {
    for (const l of locales) expect(redirected(`/${l}/draft/board`), l).toBe(localizedPath('/draft', l))
    expect(redirected('/draft/board')).toBe('/draft')
    expect(redirected(`/${defaultLocale}/draft/board`)).toBe('/draft')
  })

  it('never redirects the Draft page itself', () => {
    for (const l of locales) expect(redirected(localizedPath('/draft', l)), l).toBeNull()
  })

  it('redirects are temporary', () => {
    for (const r of draftRedirects()) expect(r.permanent).toBe(false)
  })
})

describe('cached board route', () => {
  const env = { site: process.env.SITE_URL, phase: process.env.NEXT_PHASE }
  beforeEach(() => {
    process.env.SITE_URL = ORIGIN
    delete process.env.NEXT_PHASE
    getDraftData.mockReset()
  })
  afterEach(() => {
    if (env.site === undefined) delete process.env.SITE_URL
    else process.env.SITE_URL = env.site
    if (env.phase === undefined) delete process.env.NEXT_PHASE
    else process.env.NEXT_PHASE = env.phase
  })

  it('revalidates every 900 seconds', async () => {
    const board = await import('@/app/[lang]/draft/board/page')
    expect(board.revalidate).toBe(900)
  })

  it('carries the clean Draft canonical and hreflang in every locale, never its own path', async () => {
    const board = await import('@/app/[lang]/draft/board/page')
    for (const l of locales) {
      currentLocale = l
      const meta = await board.generateMetadata()
      expect(meta.alternates, l).toEqual(pageAlternates('/draft', l))
      expect(String(meta.alternates?.canonical)).not.toContain('/board')
      expect(meta.robots, l).toBeUndefined()
    }
  })

  it('renders the empty board from the default query', async () => {
    getDraftData.mockResolvedValue({ any: 'data' })
    const board = await import('@/app/[lang]/draft/board/page')
    const el = (await board.default()) as ReactElement<{ query: unknown; data: unknown }>
    expect(getDraftData).toHaveBeenCalledWith(parseDraftQuery({}))
    expect(el.props.query).toEqual(parseDraftQuery({}))
    expect(el.props.data).toEqual({ any: 'data' })
  })

  it('throws when the data fails at request time, so ISR keeps the last good page', async () => {
    getDraftData.mockImplementation(async () => {
      throw new Error('upstream down')
    })
    const board = await import('@/app/[lang]/draft/board/page')
    await expect(board.default()).rejects.toThrow(/Draft board data unavailable/)
  })

  it('renders the failure notice during next build instead of failing the deploy', async () => {
    process.env.NEXT_PHASE = 'phase-production-build'
    getDraftData.mockImplementation(async () => {
      throw new Error('upstream down')
    })
    const board = await import('@/app/[lang]/draft/board/page')
    const el = (await board.default()) as ReactElement<{ data: unknown; failed: string }>
    expect(isValidElement(el)).toBe(true)
    expect(el.props.data).toBeNull()
    expect(el.props.failed).toBe('unavailable')
  })
})

describe('dynamic Draft route', () => {
  /** What getDraftData resolves for the heroes it knows (the page reads `allies`/`enemies` to find unknown ones). */
  const known = new Set(['haze', 'abrams', 'seven'])
  const dataFor = (q: { allies: string[]; enemies: string[] }) => ({
    any: 'data',
    allies: q.allies.filter((s) => known.has(s)).map((slug) => ({ slug })),
    enemies: q.enemies.filter((s) => known.has(s)).map((slug) => ({ slug })),
  })
  const render = async (params: Record<string, string | string[]>) => {
    const page = await import('@/app/[lang]/draft/page')
    return page.default({ searchParams: Promise.resolve(params) })
  }

  beforeEach(() => {
    getDraftData.mockReset()
    redirect.mockClear()
    currentLocale = 'en'
  })

  it('still renders the board for its Draft parameters', async () => {
    getDraftData.mockImplementation(async (q) => dataFor(q))
    const el = (await render({ allies: 'haze', enemies: 'seven', window: '30d' })) as ReactElement<{ query: unknown }>
    expect(el.props.query).toEqual(parseDraftQuery({ allies: 'haze', enemies: 'seven', window: '30d' }))
    expect(redirect).not.toHaveBeenCalled()
  })

  it('still shows the failure notice instead of throwing', async () => {
    getDraftData.mockImplementation(async () => {
      throw new Error('upstream down')
    })
    const el = (await render({ allies: 'haze' })) as ReactElement<{ data: unknown }>
    expect(el.props.data).toBeNull()
  })

  it('redirects non-canonical Draft parameters to the canonical URL in the active locale', async () => {
    getDraftData.mockImplementation(async (q) => dataFor(q))
    await expect(render({ allies: 'haze,haze,zzz', window: '7d', utm_source: 'x' })).rejects.toThrow('NEXT_REDIRECT /draft?allies=haze')
    currentLocale = 'ja'
    await expect(render({ allies: 'zzz' })).rejects.toThrow('NEXT_REDIRECT /ja/draft')
    await expect(render({ allies: ['haze', 'abrams'], enemies: 'seven' })).rejects.toThrow('NEXT_REDIRECT /ja/draft?enemies=seven')
  })

  it('never redirects when the data (and so the hero list) failed to load: unknown heroes are unknowable then', async () => {
    getDraftData.mockImplementation(async () => {
      throw new Error('upstream down')
    })
    const el = (await render({ allies: 'haze,haze,zzz', window: '7d' })) as ReactElement<{ data: unknown; query: unknown }>
    expect(redirect).not.toHaveBeenCalled()
    expect(el.props.data).toBeNull()
    expect(el.props.query).toEqual(parseDraftQuery({ allies: 'haze,haze,zzz', window: '7d' }))
  })

  it('renders canonical URLs and tracking parameters on them without redirecting', async () => {
    getDraftData.mockImplementation(async (q) => dataFor(q))
    await render({ allies: 'abrams,haze', enemies: 'seven', side: 'enemies' })
    await render({ allies: 'haze', utm_source: 'x' })
    expect(redirect).not.toHaveBeenCalled()
  })
})
