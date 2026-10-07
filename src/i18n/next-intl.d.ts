import type { Locale } from './config'
import type en from './messages/en.json'

// Typed locales and message keys: a key missing from en.json is a type error.
declare module 'next-intl' {
  interface AppConfig {
    Locale: Locale
    Messages: typeof en
  }
}
