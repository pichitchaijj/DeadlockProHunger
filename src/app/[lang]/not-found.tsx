import { useLocale, useTranslations } from 'next-intl'
import { PageContainer } from '@/components/layout/PageContainer'
import { ButtonLink } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/States'
import { localizeHref } from '@/i18n/config'

/** Also covers sections that are in the navigation but not built yet ([...rest] catches unmatched paths). */
export default function NotFound() {
  const t = useTranslations('NotFound')
  const common = useTranslations('Common')
  const locale = useLocale()
  return (
    <PageContainer width="reading">
      <h1 className="sr-only">{t('heading')}</h1>
      <EmptyState
        title={t('title')}
        description={t('description')}
        action={<ButtonLink href={localizeHref('/', locale)} variant="secondary">{common('backHome')}</ButtonLink>}
      />
    </PageContainer>
  )
}
