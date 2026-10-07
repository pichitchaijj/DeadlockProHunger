import type { Locale } from './config'
import type { Messages } from './messages/en'

// Typed locales and message keys: a key missing from the English catalog is a type error.
declare module 'next-intl' {
  interface AppConfig {
    Locale: Locale
    Messages: Messages
  }
}
