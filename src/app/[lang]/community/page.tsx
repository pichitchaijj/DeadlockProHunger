import type { Metadata } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'
import type { ReactNode } from 'react'
import { PageContainer } from '@/components/layout/PageContainer'
import { Badge } from '@/components/ui/Badge'
import { buttonClasses, type ButtonVariant } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { ArrowRightIcon } from '@/components/ui/icons'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { primaryNav, secondaryNav } from '@/config/navigation'
import {
  CONTRIBUTION_PATHS,
  CONTRIBUTORS_URL,
  DATA_DOCS_URL,
  DATA_SOURCE_URL,
  DEADLOCK_DISCORD_URL,
  ISSUES_URL,
  linkHost,
  ROADMAP_URL,
} from '@/features/community/links'
import { OG_LOCALE } from '@/i18n/config'
import { Link } from '@/i18n/navigation'
import { pageAlternates } from '@/i18n/seo'

/*
 * Community: what the project is, who makes it, where feedback goes, the roadmap, how the data is handled,
 * and six ways to contribute. Static and server-rendered: no data source, no form, no client code. Every
 * outbound link is a verified destination (features/community/links.ts); nothing here names contributors
 * or claims activity the repository doesn't show.
 */

export async function generateMetadata(): Promise<Metadata> {
  const [t, locale] = await Promise.all([getTranslations('community.meta'), getLocale()])
  return {
    title: t('title'),
    description: t('description'),
    alternates: pageAlternates('/community', locale),
    openGraph: { title: t('title'), description: t('description'), locale: OG_LOCALE[locale], type: 'website' },
  }
}

const SECTIONS = ['about', 'contributors', 'feedback', 'roadmap', 'data', 'contribute'] as const
const RULES = ['context', 'sample', 'intervals', 'wording'] as const

const sourceLink = (chunks: ReactNode) => (
  <a href={DATA_SOURCE_URL} rel="noopener noreferrer" className="text-text underline decoration-steel underline-offset-2 hover:decoration-primary">
    {chunks}
  </a>
)

export default async function CommunityPage() {
  const [t, navT] = await Promise.all([getTranslations('community'), getTranslations('nav.links')])
  const built = [...primaryNav, ...secondaryNav].filter((item) => item.built && item.id !== 'community')

  return (
    <PageContainer className="flex flex-col gap-(--spacing-section)">
      <div className="flex flex-col gap-6">
        <SectionHeader as="h1" eyebrow={t('eyebrow')} title={t('title')} description={t('intro')} />
        <nav aria-labelledby="community-toc">
          <h2 id="community-toc" className="mb-2 text-eyebrow">
            {t('onThisPage')}
          </h2>
          <ul className="flex flex-wrap gap-x-5 gap-y-1">
            {SECTIONS.map((id) => (
              <li key={id}>
                <a href={`#${id}`} className="inline-flex min-h-9 items-center justify-center font-ui text-sm font-semibold text-primary hover:text-highlight pointer-coarse:min-h-11 pointer-coarse:min-w-11">
                  {t(`${id}.title`)}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <Section id="about" title={t('about.title')}>
        <Card className="flex max-w-3xl flex-col gap-3 p-(--spacing-card)">
          <p className="text-text">{t('about.body')}</p>
          <p className="text-sm text-text-muted">{t('about.unofficial')}</p>
        </Card>
      </Section>

      <Section id="contributors" title={t('contributors.title')}>
        <Card className="flex max-w-3xl flex-col items-start gap-4 p-(--spacing-card)">
          <p className="text-text">{t('contributors.body')}</p>
          <ExternalLink href={CONTRIBUTORS_URL}>{t('contributors.link')}</ExternalLink>
          <p className="text-sm text-text-muted">{t.rich('contributors.credit', { source: sourceLink })}</p>
        </Card>
      </Section>

      <Section id="feedback" title={t('feedback.title')}>
        <ul className="grid gap-4 md:grid-cols-2">
          <Card as="li" className="flex flex-col items-start gap-4 p-(--spacing-card)">
            <h3 className="font-ui text-title font-semibold text-text">GitHub Issues</h3>
            <p className="text-text-muted">{t('feedback.body')}</p>
            <ExternalLink href={ISSUES_URL}>{t('feedback.issues')}</ExternalLink>
            <p className="text-caption text-text-muted">{t('feedback.account')}</p>
          </Card>
          <Card as="li" className="flex flex-col items-start gap-4 p-(--spacing-card)">
            <h3 className="font-ui text-title font-semibold text-text">{t('feedback.discordTitle')}</h3>
            <p className="text-text-muted">{t('feedback.discordBody')}</p>
            <ExternalLink href={DEADLOCK_DISCORD_URL} variant="secondary">
              {t('feedback.discordLink')}
            </ExternalLink>
          </Card>
        </ul>
      </Section>

      <Section id="roadmap" title={t('roadmap.title')}>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Card className="flex flex-col items-start gap-4 p-(--spacing-card)">
            <p className="text-text">{t('roadmap.body')}</p>
            <ExternalLink href={ROADMAP_URL}>{t('roadmap.link')}</ExternalLink>
          </Card>
          <Card className="flex flex-col gap-3 p-(--spacing-card)">
            <div>
              <h3 className="font-ui text-title font-semibold text-text">{t('roadmap.builtTitle')}</h3>
              <p className="text-sm text-text-muted">{t('roadmap.builtNote')}</p>
            </div>
            <ul className="flex flex-wrap gap-2">
              {built.map((item) => (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    className="inline-flex min-h-9 items-center justify-center rounded-sm border border-border px-3 font-ui text-sm text-text-muted hover:border-primary hover:text-text pointer-coarse:min-h-11 pointer-coarse:min-w-11"
                  >
                    {navT(`${item.id}.label`)}
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </Section>

      <Section id="data" title={t('data.title')}>
        <Card className="flex max-w-3xl flex-col items-start gap-4 p-(--spacing-card)">
          <p className="text-text">{t.rich('data.source', { source: sourceLink })}</p>
          <div>
            <h3 className="mb-2 font-ui text-title font-semibold text-text">{t('data.rulesTitle')}</h3>
            <ul className="flex list-disc flex-col gap-2 pl-5 text-text-muted marker:text-primary">
              {RULES.map((rule) => (
                <li key={rule}>{t(`data.rules.${rule}`)}</li>
              ))}
            </ul>
          </div>
          <ExternalLink href={DATA_DOCS_URL} variant="secondary">
            {t('data.docsLink')}
          </ExternalLink>
        </Card>
      </Section>

      <Section id="contribute" title={t('contribute.title')} description={t('contribute.intro')}>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CONTRIBUTION_PATHS.map((path) => (
            <Card as="li" key={path.id} className="flex flex-col items-start gap-3 p-(--spacing-card)">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-ui text-title font-semibold text-text">{t(`contribute.paths.${path.id}.title`)}</h3>
                {path.byInvitation && <Badge tone="warning">{t('contribute.byInvitation')}</Badge>}
              </div>
              <p className="flex-1 text-sm text-text-muted">{t(`contribute.paths.${path.id}.body`)}</p>
              <ExternalLink href={path.href} variant={path.byInvitation ? 'secondary' : 'primary'} size="sm">
                {t(`contribute.paths.${path.id}.action`)}
              </ExternalLink>
            </Card>
          ))}
        </ul>
      </Section>
    </PageContainer>
  )
}

function Section({ id, title, description, children }: { id: (typeof SECTIONS)[number]; title: string; description?: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`${id}-title`} className="flex scroll-mt-24 flex-col gap-5" id={id}>
      <SectionHeader id={`${id}-title`} title={title} description={description} />
      {children}
    </section>
  )
}

/** An outbound link styled as a button, with its destination host printed beside the label (same tab, like the rest of the site). */
function ExternalLink({ href, variant = 'primary', size = 'md', children }: { href: string; variant?: ButtonVariant; size?: 'sm' | 'md'; children: ReactNode }) {
  return (
    <a href={href} rel="noopener noreferrer" className={buttonClasses({ variant, size, className: 'max-w-full flex-wrap text-left' })}>
      <span>{children}</span>
      <span className="font-normal opacity-80">{linkHost(href)}</span>
      <ArrowRightIcon size={16} />
    </a>
  )
}
