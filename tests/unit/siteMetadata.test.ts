import { afterEach, describe, expect, it, vi } from 'vitest'

// next/font only works inside Next's compiler; the translator echoes keys so only the metadata shape matters.
vi.mock('next/font/google', () => ({ Barlow_Condensed: () => ({ variable: 'display' }), Inter: () => ({ variable: 'ui' }) }))
vi.mock('server-only', () => ({}))
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }))

const { getSiteMetadata } = await import('@/components/layout/SiteDocument')

const FAKE_TOKEN = 'fake-google-verification-token'

describe('site metadata: Google Search Console verification', () => {
  const env = { google: process.env.GOOGLE_SITE_VERIFICATION, site: process.env.SITE_URL }
  afterEach(() => {
    for (const [key, value] of [['GOOGLE_SITE_VERIFICATION', env.google], ['SITE_URL', env.site]] as const) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })

  it('adds the google verification value when GOOGLE_SITE_VERIFICATION is set, trimmed', async () => {
    process.env.GOOGLE_SITE_VERIFICATION = `  ${FAKE_TOKEN}\n`
    expect((await getSiteMetadata()).verification).toEqual({ google: FAKE_TOKEN })
  })

  it('omits verification when the variable is unset or blank', async () => {
    delete process.env.GOOGLE_SITE_VERIFICATION
    expect(await getSiteMetadata()).not.toHaveProperty('verification')
    process.env.GOOGLE_SITE_VERIFICATION = '   '
    expect(await getSiteMetadata()).not.toHaveProperty('verification')
  })

  it('leaves the rest of the site metadata unchanged', async () => {
    process.env.SITE_URL = 'https://deadlock-pro-hunger.vercel.app'
    delete process.env.GOOGLE_SITE_VERIFICATION
    const without = await getSiteMetadata()
    process.env.GOOGLE_SITE_VERIFICATION = FAKE_TOKEN
    const { verification, ...rest } = await getSiteMetadata()
    expect(verification).toEqual({ google: FAKE_TOKEN })
    expect(rest).toEqual(without)
    expect(String(rest.metadataBase)).toBe('https://deadlock-pro-hunger.vercel.app/')
    expect(rest.title).toEqual({ default: 'title', template: 'Deadlockprohunger — %s' })
  })
})
