import { PageContainer } from '@/components/layout/PageContainer'
import { ButtonLink } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/States'

/** Also covers sections that are in the navigation but not built yet. */
export default function NotFound() {
  return (
    <PageContainer width="reading">
      <h1 className="sr-only">Page not found</h1>
      <EmptyState
        title="Nothing here yet"
        description="This page doesn’t exist, or this section hasn’t been built yet. The navigation already lists the sections that are planned."
        action={<ButtonLink href="/" variant="secondary">Back to home</ButtonLink>}
      />
    </PageContainer>
  )
}
