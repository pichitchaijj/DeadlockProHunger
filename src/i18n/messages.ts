import 'server-only'
import { cache } from 'react'
import type { Locale } from './config'
import { mergeMessages } from './merge'
import en, { type Messages } from './messages/en'

export type { Messages }

/**
 * Catalogs live in ./messages/<locale>/<namespace>.json (one folder per locale, English is the source).
 * Non-English catalogs load on demand on the server, so only the active locale is ever read.
 */
const translations: Record<Exclude<Locale, 'en'>, () => Promise<Messages>> = {
  th: () => import('./messages/th').then((m) => m.default),
  ja: () => import('./messages/ja').then((m) => m.default),
  ko: () => import('./messages/ko').then((m) => m.default),
  'zh-CN': () => import('./messages/zh-CN').then((m) => m.default),
}

/** A locale's messages over the full English set (./merge.ts): an untranslated key reads in English. */
export const loadMessages = cache(async (locale: Locale): Promise<Messages> => {
  if (locale === 'en') return en
  return mergeMessages(en, await translations[locale]())
})

/**
 * Namespaces client components read (header controls, menus, command palette, dialogs, search inputs,
 * error boundary, and the data badges some client components render). Only these, for the active
 * locale, are sent to the browser (SiteDocument); every other namespace stays on the server.
 */
export const CLIENT_NAMESPACES = ['common', 'errors', 'nav', 'header', 'commandPalette', 'data'] as const satisfies ReadonlyArray<keyof Messages>

export function clientMessages(messages: Messages): Pick<Messages, (typeof CLIENT_NAMESPACES)[number]> {
  return Object.fromEntries(CLIENT_NAMESPACES.map((ns) => [ns, messages[ns]])) as Pick<Messages, (typeof CLIENT_NAMESPACES)[number]>
}
