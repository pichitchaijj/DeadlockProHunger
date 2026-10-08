import 'server-only'
import { getLocale, getTranslations } from 'next-intl/server'
import { getScopeWording } from '@/components/data/scopeWording'
import type { Locale } from '@/i18n/config'
import type { WhyFact } from './model'
import { makeMetaFormat, whyFactText, whyParagraph, type MetaTranslate, type WhyFactText, type WhyIntro } from './text'

export type MetaWhyWording = {
  fact: (fact: WhyFact) => WhyFactText
  paragraph: (facts: WhyFact[], intro?: WhyIntro) => string
}

/**
 * "Why?" wording for the current request (catalog `meta.why` + shared scope words). Server-only and cheap:
 * the facts come from the caller's locale-neutral (and possibly cached) data.
 */
export async function getMetaWhyWording(): Promise<MetaWhyWording> {
  const [t, locale, scope] = await Promise.all([getTranslations('meta.why'), getLocale(), getScopeWording()])
  const format = makeMetaFormat(locale as Locale, scope.scope)
  const translate: MetaTranslate = (key, values) => t(key as 'result', values)
  return {
    fact: (fact) => whyFactText(fact, translate, format),
    paragraph: (facts, intro) => whyParagraph(facts, intro, translate, format),
  }
}
