import 'server-only'
import { cache } from 'react'
import type { Locale } from './config'
import { mergeMessages, type DeepPartial } from './merge'
import en from './messages/en.json'

export type Messages = typeof en

/** Non-English dictionaries load on demand (server only), so a locale's file is read only when used. */
const translations: Record<Exclude<Locale, 'en'>, () => Promise<DeepPartial<Messages>>> = {
  th: () => import('./messages/th.json').then((m) => m.default),
  ja: () => import('./messages/ja.json').then((m) => m.default),
  ko: () => import('./messages/ko.json').then((m) => m.default),
  'zh-CN': () => import('./messages/zh-CN.json').then((m) => m.default),
}

/** A locale's messages over the full English set (./merge.ts): untranslated keys read in English. */
export const loadMessages = cache(async (locale: Locale): Promise<Messages> => {
  if (locale === 'en') return en
  return mergeMessages(en, await translations[locale]())
})
