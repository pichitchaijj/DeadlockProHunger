import { createTranslator } from 'next-intl'
import { describe, expect, it } from 'vitest'
import { primaryNav, secondaryNav } from '@/config/navigation'
import {
  CONTRIBUTION_PATHS,
  CONTRIBUTORS_URL,
  DATA_DOCS_URL,
  DATA_SOURCE_URL,
  DEADLOCK_DISCORD_URL,
  ISSUES_URL,
  linkHost,
  newIssueUrl,
  REPO_URL,
  ROADMAP_URL,
} from '@/features/community/links'
import { locales, type Locale } from '@/i18n/config'
import en from '@/i18n/messages/en'
import ja from '@/i18n/messages/ja'
import ko from '@/i18n/messages/ko'
import th from '@/i18n/messages/th'
import zhCN from '@/i18n/messages/zh-CN'

/*
 * Community page: verified destinations only, six contribution paths (code by invitation: the repository has
 * no license), the official Deadlock Discord presented as Valve's, and no invented contributors.
 */

const CATALOGS = { en, th, ja, ko, 'zh-CN': zhCN } as const
const community = (l: Locale) => CATALOGS[l].community

describe('community links', () => {
  it('point at the verified repository and its real pages', () => {
    expect(REPO_URL).toBe('https://github.com/pichitchaijj/DeadlockProHunger')
    expect(CONTRIBUTORS_URL).toBe(`${REPO_URL}/graphs/contributors`)
    expect(ISSUES_URL).toBe(`${REPO_URL}/issues`)
    expect(ROADMAP_URL).toBe(`${REPO_URL}/blob/main/docs/ROADMAP.md`)
    expect(DATA_DOCS_URL).toBe(`${REPO_URL}/blob/main/docs/API.md`)
    expect(DATA_SOURCE_URL).toBe('https://deadlock-api.com')
  })

  it('use the exact official Deadlock Discord invite', () => {
    expect(DEADLOCK_DISCORD_URL).toBe('https://discord.com/invite/deadlockgame')
  })

  it('has exactly the six contribution paths, in order, all https', () => {
    expect(CONTRIBUTION_PATHS.map((p) => p.id)).toEqual(['bug', 'feature', 'data', 'design', 'docs', 'code'])
    for (const path of CONTRIBUTION_PATHS) expect(new URL(path.href).protocol).toBe('https:')
  })

  it('opens new issues with a title prefix only (no labels or templates assumed)', () => {
    const prefixes = { bug: '[Bug] ', feature: '[Feature] ', data: '[Data] ', design: '[Design] ', docs: '[Docs] ' }
    for (const path of CONTRIBUTION_PATHS.filter((p) => p.id !== 'code')) {
      const url = new URL(path.href)
      expect(`${url.origin}${url.pathname}`).toBe(`${ISSUES_URL}/new`)
      expect([...url.searchParams.keys()]).toEqual(['title'])
      expect(url.searchParams.get('title')).toBe(prefixes[path.id as keyof typeof prefixes])
      expect(path.byInvitation).toBe(false)
    }
    expect(newIssueUrl('[Bug]')).toBe(`${ISSUES_URL}/new?title=%5BBug%5D+`)
  })

  it('marks only code contributions as by invitation, linking to the repository itself', () => {
    const code = CONTRIBUTION_PATHS.find((p) => p.id === 'code')!
    expect(code).toEqual({ id: 'code', href: REPO_URL, byInvitation: true })
    expect(CONTRIBUTION_PATHS.filter((p) => p.byInvitation)).toHaveLength(1)
  })

  it('names each destination host', () => {
    expect(linkHost(DEADLOCK_DISCORD_URL)).toBe('discord.com')
    expect(linkHost(CONTRIBUTORS_URL)).toBe('github.com')
  })
})

describe('community wording', () => {
  it.each(locales)('%s: every contribution path has a title, body and action', (l) => {
    for (const path of CONTRIBUTION_PATHS) {
      const text = community(l).contribute.paths[path.id]
      for (const key of ['title', 'body', 'action'] as const) expect(text[key].trim(), `${path.id}.${key}`).not.toBe('')
    }
    expect(community(l).contribute.byInvitation.trim()).not.toBe('')
  })

  it.each(locales)('%s: the Discord is presented as Valve’s, not this project’s', (l) => {
    const { discordTitle, discordBody } = community(l).feedback
    expect(discordTitle).toContain('Deadlock')
    expect(discordBody).toContain('Valve')
    expect(discordBody).toContain('Discord')
    expect(discordBody).toContain('GitHub Issues')
  })

  it('English states it plainly: operated by Valve, not this project’s own server', () => {
    const { discordBody } = en.community.feedback
    expect(discordBody).toContain('operated by Valve')
    expect(discordBody).toContain('not this project’s own community server')
  })

  it.each(locales)('%s: keeps the unofficial notice and the data source', (l) => {
    expect(community(l).about.unofficial).toContain('Valve Corporation')
    expect(community(l).data.source).toContain('<source>deadlock-api.com</source>')
    expect(community(l).contributors.credit).toContain('<source>deadlock-api.com</source>')
    expect(community(l).contributors.link).toContain('GitHub')
  })

  it.each(locales)('%s: names no contributors and claims no activity (people are listed by GitHub, not here)', (l) => {
    const all = JSON.stringify(community(l))
    for (const invented of ['pichitchaijj', '@', 'Claude', 'thousands', 'users']) expect(all).not.toContain(invented)
    expect(all).not.toMatch(/\d{2,}\s*(contributors|members)/i)
  })

  it('English explains why code is by invitation without granting rights', () => {
    const { body } = en.community.contribute.paths.code
    expect(body).toContain('license')
    expect(body).toContain('by invitation')
    expect(body).not.toMatch(/MIT|Apache|GPL|free to use|pull request/i)
  })

  it.each(locales)('%s: rich text renders (source link) and no placeholder is left raw', (l) => {
    const t = createTranslator({ locale: l, messages: CATALOGS[l], namespace: 'community' })
    const out = String(t.markup('data.source', { source: (chunks) => `[${chunks}]` }))
    expect(out).toContain('[deadlock-api.com]')
    expect(out).not.toContain('<source>')
  })
})

describe('community navigation', () => {
  it('is built and no longer marked "later"', () => {
    const item = [...primaryNav, ...secondaryNav].find((i) => i.id === 'community')!
    expect(item).toMatchObject({ href: '/community', built: true, phase: 'mvp' })
  })
})
