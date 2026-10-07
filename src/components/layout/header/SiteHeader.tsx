import Link from 'next/link'
import { BrandMark } from '../BrandMark'
import { LoginPlaceholder } from './LoginPlaceholder'
import { MobileNav } from './MobileNav'
import { MoreMenu } from './MoreMenu'
import { PrimaryNav } from './PrimaryNav'
import { SearchTrigger } from './SearchTrigger'

/**
 * Sticky site header.
 * ≥ lg: brand · primary nav + More · search · sign-in.
 * < lg: brand · search icon · hamburger drawer.
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg/85 backdrop-blur-md supports-[not(backdrop-filter:blur(0))]:bg-bg">
      {/* Hairline accent along the top edge: the brand's one restrained glow in the chrome. */}
      <div aria-hidden="true" className="h-px bg-linear-to-r from-transparent via-primary/60 to-transparent" />
      {/* Below 360px (e.g. 320px phones) gaps tighten and the logo steps down so brand + 2 icons fit. */}
      <div className="page-container flex h-16 items-stretch gap-6 max-[359px]:gap-2">
        <Link href="/" aria-label="Deadlockprohunger home" className="flex shrink-0 items-center">
          <BrandMark boot />
        </Link>

        <nav aria-label="Primary" className="hidden items-stretch lg:flex">
          <PrimaryNav />
          <MoreMenu />
        </nav>

        <div className="ml-auto flex items-center gap-2 max-[359px]:gap-0">
          {/* Wrappers own responsive visibility so component display classes never conflict with it. */}
          <div className="hidden xl:block">
            <SearchTrigger variant="field" />
          </div>
          <div className="xl:hidden">
            <SearchTrigger variant="icon" />
          </div>
          <div className="hidden lg:block">
            <LoginPlaceholder />
          </div>
          <div className="lg:hidden">
            <MobileNav />
          </div>
        </div>
      </div>
    </header>
  )
}
