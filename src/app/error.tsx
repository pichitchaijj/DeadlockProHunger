'use client'

import { useEffect } from 'react'
import { PageContainer } from '@/components/layout/PageContainer'
import { Button, ButtonLink } from '@/components/ui/Button'
import { ErrorState } from '@/components/ui/States'

/**
 * Route error boundary: anything a page doesn't catch itself (data failures are caught per page and
 * explained with DataNotice). Replaces Next's bare default screen with the site's own, with a retry.
 */
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[route] unhandled error', error)
  }, [error])

  return (
    <PageContainer width="reading">
      <h1 className="sr-only">Something went wrong</h1>
      <ErrorState
        title="This page couldn’t load"
        description={`Something went wrong while building this page. No numbers are shown rather than possibly wrong ones.${error.digest ? ` (Reference ${error.digest})` : ''}`}
        action={
          <span className="flex flex-wrap gap-3">
            <Button variant="secondary" size="sm" onClick={reset}>Try again</Button>
            <ButtonLink href="/" variant="ghost" size="sm">Back to home</ButtonLink>
          </span>
        }
      />
    </PageContainer>
  )
}
