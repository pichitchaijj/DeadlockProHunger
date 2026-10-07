import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { parse, TYPE, type MessageFormatElement } from '@formatjs/icu-messageformat-parser'
import { createTranslator } from 'next-intl'
import { describe, expect, it } from 'vitest'
import { primaryNav, secondaryNav } from '@/config/navigation'
import { localeEndonyms, locales, type Locale } from '@/i18n/config'
import { messageFallback } from '@/i18n/fallback'
import { mergeMessages, missingKeys, unknownKeys, type MessageTree } from '@/i18n/merge'
import en from '@/i18n/messages/en'
import ja from '@/i18n/messages/ja'
import ko from '@/i18n/messages/ko'
import th from '@/i18n/messages/th'
import zhCN from '@/i18n/messages/zh-CN'

const catalogs: Record<Locale, MessageTree> = { en, th, ja, ko, 'zh-CN': zhCN }
const translated = locales.filter((l) => l !== 'en')
const DIR = 'src/i18n/messages'

/** Every message as [dotted key, text]. */
function entries(tree: MessageTree, prefix = ''): Array<[string, string]> {
  return Object.entries(tree).flatMap(([k, v]) => (typeof v === 'string' ? [[`${prefix}${k}`, v] as [string, string]] : entries(v, `${prefix}${k}.`)))
}

/** The variables, plural/select arguments and rich-text tags a message uses: what code must supply. */
function signature(message: string): string[] {
  const out = new Set<string>()
  const walk = (els: MessageFormatElement[]) => {
    for (const el of els) {
      if (el.type === TYPE.argument || el.type === TYPE.number || el.type === TYPE.date || el.type === TYPE.time) out.add(`{${el.value}}`)
      if (el.type === TYPE.plural || el.type === TYPE.select) {
        out.add(`{${el.value}, ${el.type === TYPE.plural ? 'plural' : 'select'}}`)
        for (const option of Object.values(el.options)) walk(option.value)
      }
      if (el.type === TYPE.tag) {
        out.add(`<${el.value}>`)
        walk(el.children)
      }
    }
  }
  walk(parse(message))
  return [...out].sort()
}

/** Sample values for every argument a message takes, so it can be rendered. */
function sampleValues(message: string) {
  const values: Record<string, unknown> = {}
  for (const s of signature(message)) {
    const arg = s.match(/^\{(\w+)/)?.[1]
    if (arg) values[arg] = s.includes('plural') ? 3 : 'X'
    const tag = s.match(/^<(\w+)>$/)?.[1]
    if (tag) values[tag] = (chunks: string[]) => chunks.join('')
  }
  return values
}

describe('message catalogs', () => {
  it('every locale has exactly the English namespace files', () => {
    const files = (l: string) => readdirSync(join(DIR, l)).filter((f) => f.endsWith('.json')).sort()
    for (const l of translated) expect(files(l)).toEqual(files('en'))
    expect(Object.keys(en).sort()).toEqual(files('en').map((f) => f.replace(/\.json$/, '')))
  })

  it.each(translated)('%s has every English key and no others', (l) => {
    expect(missingKeys(en, catalogs[l])).toEqual([])
    expect(unknownKeys(en, catalogs[l])).toEqual([])
  })

  it.each(locales)('%s: every message is valid ICU syntax', (l) => {
    for (const [key, text] of entries(catalogs[l])) {
      expect(() => parse(text), `${l} ${key}`).not.toThrow()
    }
  })

  it.each(translated)('%s keeps every placeholder, plural argument and tag of the English message', (l) => {
    const target = new Map(entries(catalogs[l]))
    for (const [key, text] of entries(en)) {
      expect(signature(target.get(key) ?? ''), key).toEqual(signature(text))
    }
  })

  it.each(locales)('%s: plural messages have an "other" form', (l) => {
    for (const [key, text] of entries(catalogs[l])) {
      if (!text.includes('plural')) continue
      const plurals = parse(text).filter((el) => el.type === TYPE.plural)
      for (const el of plurals) expect(Object.keys(el.type === TYPE.plural ? el.options : {}), key).toContain('other')
    }
  })

  it.each(locales)('%s: every message renders to text, never to its key', (l) => {
    const t = createTranslator({ locale: l, messages: catalogs[l], getMessageFallback: messageFallback, onError: () => {} })
    for (const [key, text] of entries(catalogs[l])) {
      const values = sampleValues(text)
      const out = text.includes('<') ? String(t.rich(key as never, values as never)) : t(key as never, values as never)
      expect(out, `${l} ${key}`).not.toBe('')
      expect(out, `${l} ${key}`).not.toContain(key)
    }
  })
})

describe('fallback', () => {
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

  it('shows English for a key a locale lacks', () => {
    const partial = { ...th, header: { ...th.header, search: undefined } } as never
    const t = createTranslator({ locale: 'th', messages: mergeMessages(en, partial), getMessageFallback: messageFallback, onError: () => {} })
    expect(t('header.search')).toBe(en.header.search)
    expect(t('header.menu')).toBe(th.header.menu)
  })

  it('renders an unknown key as nothing, not as the key', () => {
    const t = createTranslator({ locale: 'ja', messages: ja, getMessageFallback: messageFallback, onError: () => {} })
    expect(t('nav.doesNotExist' as never)).toBe('')
  })
})

describe('content rules', () => {
  it('has a label and description for every nav item, English matching navigation.ts', () => {
    for (const item of [...primaryNav, ...secondaryNav]) {
      expect(en.nav.links[item.id]).toEqual({ label: item.label, description: item.description })
    }
  })

  it('names every locale; switcher names stay in their own script', () => {
    for (const l of locales) expect(Object.keys(catalogs[l].languages as MessageTree).sort()).toEqual([...locales].sort())
    expect(localeEndonyms).toEqual({ en: 'English', th: 'ไทย', ja: '日本語', ko: '한국어', 'zh-CN': '简体中文' })
  })

  it.each(locales)('%s: the unofficial-project notice names the project, Valve and the data source', (l) => {
    const notice = (catalogs[l].footer as MessageTree).notice as string
    for (const term of ['Deadlockprohunger', 'Valve', 'Valve Corporation', 'Deadlock', '<source>deadlock-api.com</source>']) expect(notice).toContain(term)
  })

  it('keeps game data out of the catalogs (hero, item and rank names are API data)', () => {
    const all = locales.flatMap((l) => entries(catalogs[l]).map(([, v]) => v)).join('\n')
    for (const name of ['Abrams', 'Haze', 'Seven', 'Vindicta', 'Extra Spirit', 'Kinetic Dash', 'Eternus', 'Obscurus']) expect(all).not.toContain(name)
  })
})
