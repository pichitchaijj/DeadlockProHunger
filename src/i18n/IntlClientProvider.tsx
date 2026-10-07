'use client'

import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl'
import type { ReactNode } from 'react'
import type { Locale } from './config'
import { messageFallback, onIntlError } from './fallback'

/**
 * The client side of the translation provider. A thin wrapper so client components get the same
 * fallback as the server (./fallback.ts: never a raw key): functions can't be passed from a Server
 * Component, so they're attached here.
 */
export function IntlClientProvider({ locale, messages, children }: { locale: Locale; messages: AbstractIntlMessages; children: ReactNode }) {
  return (
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC" onError={onIntlError} getMessageFallback={messageFallback}>
      {children}
    </NextIntlClientProvider>
  )
}
