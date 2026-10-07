import { describe, expect, it } from 'vitest'
import { defaultLocale, isLocale, locales } from '@/i18n/config'
import { routing } from '@/i18n/routing'
import { dateFormat, formatCompact, formatInteger, formatRelativeTime } from '@/lib/format'

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
