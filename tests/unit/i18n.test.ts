import { describe, expect, it } from 'vitest'
import { primaryNav, secondaryNav } from '@/config/navigation'
import { defaultLocale, isLocale, localizeHref, locales, splitLocale } from '@/i18n/config'
import { mergeMessages, missingKeys, unknownKeys, type MessageTree } from '@/i18n/merge'
import { routing } from '@/i18n/routing'
import { dateFormat, formatCompact, formatInteger, formatRelativeTime } from '@/lib/format'
import en from '@/i18n/messages/en.json'
import ja from '@/i18n/messages/ja.json'
import ko from '@/i18n/messages/ko.json'
import th from '@/i18n/messages/th.json'
import zhCN from '@/i18n/messages/zh-CN.json'

const dictionaries: Record<string, MessageTree> = { th, ja, ko, 'zh-CN': zhCN }

describe('locale config', () => {
  it('supports exactly the five launch locales, English first and default', () => {
    expect(locales).toEqual(['en', 'th', 'ja', 'ko', 'zh-CN'])
    expect(defaultLocale).toBe('en')
    expect(isLocale('zh-CN')).toBe(true)
    expect(isLocale('zh-cn')).toBe(false)
    expect(isLocale('api')).toBe(false)
  })

  it('routes English unprefixed and never by browser language or cookie', () => {
    expect(routing.localePrefix).toBe('as-needed')
    expect(routing.localeDetection).toBe(false)
    expect(routing.localeCookie).toBe(false)
  })

  it('localizes links without touching English or the query string', () => {
    expect(localizeHref('/', 'en')).toBe('/')
    expect(localizeHref('/heroes?window=30d', 'en')).toBe('/heroes?window=30d')
    expect(localizeHref('/', 'th')).toBe('/th')
    expect(localizeHref('/heroes/abrams?tab=items', 'zh-CN')).toBe('/zh-CN/heroes/abrams?tab=items')
    expect(localizeHref('https://deadlock-api.com', 'ja')).toBe('https://deadlock-api.com')
  })

  it('splits a browser pathname into locale and app path', () => {
    expect(splitLocale('/heroes')).toEqual({ locale: 'en', pathname: '/heroes' })
    expect(splitLocale('/th')).toEqual({ locale: 'th', pathname: '/' })
    expect(splitLocale('/ko/items/x')).toEqual({ locale: 'ko', pathname: '/items/x' })
    // A hero or path that merely starts with a locale's letters is not a prefix.
    expect(splitLocale('/thermal')).toEqual({ locale: 'en', pathname: '/thermal' })
    expect(splitLocale('/en/heroes')).toEqual({ locale: 'en', pathname: '/en/heroes' })
  })
})

describe('messages', () => {
  it('falls back to English key by key, never to a raw key or empty string', () => {
    const source = { a: 'A', group: { b: 'B', c: 'C' } }
    const merged = mergeMessages(source, { group: { b: 'บี', c: '  ' } })
    expect(merged).toEqual({ a: 'A', group: { b: 'บี', c: 'C' } })
    expect(mergeMessages(source, undefined)).toBe(source)
  })

  it('ignores values of the wrong shape', () => {
    const merged = mergeMessages({ a: 'A', g: { b: 'B' } }, { a: { x: 'x' }, g: 'flat' } as never)
    expect(merged).toEqual({ a: 'A', g: { b: 'B' } })
  })

  it.each(Object.entries(dictionaries))('%s has no keys that English lacks', (_, dict) => {
    expect(unknownKeys(en, dict)).toEqual([])
  })

  it.each(Object.entries(dictionaries))('%s: every merged message resolves to text', (_, dict) => {
    expect(missingKeys(en, mergeMessages(en, dict))).toEqual([])
  })

  it('has a label and description for every nav item', () => {
    for (const item of [...primaryNav, ...secondaryNav]) {
      expect(en.Nav.links[item.id]).toEqual({ label: item.label, description: item.description })
    }
  })

  it('names every locale', () => {
    expect(Object.keys(en.Languages).sort()).toEqual([...locales].sort())
  })
})

describe('locale-aware formatting', () => {
  it('keeps the English output when no locale is given', () => {
    expect(formatInteger(12345)).toBe('12,345')
    expect(formatCompact(12400)).toBe('12.4K')
    expect(formatRelativeTime(0, 3 * 3_600_000)).toBe('3 hours ago')
  })

  it('formats for the requested locale', () => {
    expect(formatCompact(12400, 'ja')).toBe('1.2万')
    expect(formatRelativeTime(0, 86_400_000, 'ko')).toBe('어제')
  })

  it('uses the Gregorian year in Thai', () => {
    const date = Date.UTC(2026, 9, 8)
    expect(dateFormat('th', { year: 'numeric', timeZone: 'UTC' }).format(date)).toContain('2026')
  })
})
