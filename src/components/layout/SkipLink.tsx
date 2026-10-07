/** First focusable element on every page; targets <main id="content">. */
export function SkipLink() {
  return (
    <a
      href="#content"
      className="sr-only rounded-sm bg-primary px-4 py-2 font-ui text-sm font-semibold text-on-primary focus:not-sr-only focus:fixed focus:inline-flex focus:min-h-11 focus:items-center focus:top-3 focus:left-3 focus:z-[100]"
    >
      Skip to content
    </a>
  )
}
