'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useEffect } from 'react'
import { PageContainer } from '@/components/layout/PageContainer'
import { Button, ButtonLink } from '@/components/ui/Button'
import { ErrorState } from '@/components/ui/States'
import { localizeHref } from '@/i18n/config'

/**
 * Route error boundary: anything a page doesn't catch itself (data failures are caught per page and
 * explained with DataNotice). Replaces Next's bare default screen with the site's own, with a retry.
 * Its messages (Errors, Common) are the only ones the root layout sends to the browser.
 */
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[route] unhandled error', error)
  }, [error])
  const t = useTranslations('Errors')
  const common = useTranslations('Common')
  const locale = useLocale()

  return (
    <PageContainer width="reading">
      <h1 className="sr-only">{t('heading')}</h1>
      <ErrorState
        title={t('title')}
        description={`${t('description')}${error.digest ? ` (${t('reference', { digest: error.digest })})` : ''}`}
        action={
          <span className="flex flex-wrap gap-3">
            <Button variant="secondary" size="sm" onClick={reset}>{common('tryAgain')}</Button>
            <ButtonLink href={localizeHref('/', locale)} variant="ghost" size="sm">{common('backHome')}</ButtonLink>
          </span>
        }
      />
    </PageContainer>
  )
}
