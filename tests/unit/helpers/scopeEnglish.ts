import { createTranslator } from 'next-intl'
import en from '@/i18n/messages/en'
import { makeScopeWording } from '@/components/data/scopeWording'

/* The shared scope's English wording for tests: the same catalog and formatter the pages use for English. */

const t = createTranslator({ locale: 'en', messages: en, namespace: 'scope' })

export const englishScope = makeScopeWording((key, values) => t(key as 'joined', values), 'en')
