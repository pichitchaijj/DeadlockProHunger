/*
 * Community page destinations. Every URL here was checked to resolve (2026-10-10): the public repository
 * (issues on, discussions off, no license), its contributors graph, the roadmap and API docs in the repo,
 * the official Deadlock Discord invite (Valve's server, not this project's) and the data source.
 * Pure: no fetch; the page words each destination from the `community` catalog.
 */

export const REPO_URL = 'https://github.com/pichitchaijj/DeadlockProHunger'
export const CONTRIBUTORS_URL = `${REPO_URL}/graphs/contributors`
export const ISSUES_URL = `${REPO_URL}/issues`
export const ROADMAP_URL = `${REPO_URL}/blob/main/docs/ROADMAP.md`
export const DATA_DOCS_URL = `${REPO_URL}/blob/main/docs/API.md`
export const DATA_SOURCE_URL = 'https://deadlock-api.com'
/** The official Deadlock community Discord, run by Valve. Never presented as this project's server. */
export const DEADLOCK_DISCORD_URL = 'https://discord.com/invite/deadlockgame'

/**
 * A new GitHub issue with a title prefix, so reports sort themselves. Only `title` is prefilled: the
 * repository has no issue templates or labels to rely on. Opening it needs a GitHub account.
 */
export function newIssueUrl(prefix: string): string {
  return `${ISSUES_URL}/new?${new URLSearchParams({ title: `${prefix} ` })}`
}

export type ContributionId = 'bug' | 'feature' | 'data' | 'design' | 'docs' | 'code'

export type ContributionPath = {
  id: ContributionId
  href: string
  /** Code contributions are by invitation: the repository has no license yet. */
  byInvitation: boolean
}

/** The six ways to contribute, in page order. Issue title prefixes stay English (they're for the maintainer). */
export const CONTRIBUTION_PATHS: readonly ContributionPath[] = [
  { id: 'bug', href: newIssueUrl('[Bug]'), byInvitation: false },
  { id: 'feature', href: newIssueUrl('[Feature]'), byInvitation: false },
  { id: 'data', href: newIssueUrl('[Data]'), byInvitation: false },
  { id: 'design', href: newIssueUrl('[Design]'), byInvitation: false },
  { id: 'docs', href: newIssueUrl('[Docs]'), byInvitation: false },
  { id: 'code', href: REPO_URL, byInvitation: true },
]

/** The host shown next to an external link, so readers know where it goes ("github.com"). */
export const linkHost = (href: string) => new URL(href).hostname.replace(/^www\./, '')
