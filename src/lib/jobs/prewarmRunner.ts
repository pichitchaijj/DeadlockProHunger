/**
 * Cache-prewarm orchestration, kept pure (clock, sleep and budget are injected) so its rules are
 * unit-tested. The data each task loads lives in lib/jobs/prewarm.ts.
 *
 * Rules:
 * - Stages run in order (a later stage may depend on data an earlier one warmed); tasks inside a
 *   stage run with at most `concurrency` in flight.
 * - Before starting a task, the runner waits until the outbound budget has at least `reserve` tokens,
 *   so background warming never takes the whole budget from users. If the budget doesn't recover
 *   within `maxBudgetWaitMs`, the task is skipped, not forced.
 * - A failed task is recorded and the rest continue. Past `deadlineMs` the remaining tasks are skipped.
 * - Circuit breaker: after `stopAfterRateLimited` rate-limited tasks in a row (upstream or our own
 *   budget saying "slow down"), every remaining task is skipped. Background work backs off; it never
 *   keeps retrying into a rate limit that users would then hit too.
 * - Refused access (401/403, or the client's access breaker): after `stopAfterBlocked` blocked tasks
 *   (default 1) no new task starts; tasks already in flight finish, the rest are skipped. A stage plan
 *   that fails this way (or rate-limited) counts too.
 * - Every task still goes through the normal client (cache → budget → API): the runner only paces.
 */

export type PrewarmTask = { name: string; run: () => Promise<unknown> }
/** A stage is a fixed task list or a function that builds one (e.g. from data an earlier stage loaded). */
export type PrewarmStage = { name: string; tasks: PrewarmTask[] | (() => Promise<PrewarmTask[]>) }

export type TaskStatus = 'ok' | 'failed' | 'rate-limited' | 'blocked' | 'skipped'
export type TaskResult = { stage: string; name: string; status: TaskStatus; ms: number; error?: string }

export type RunnerOptions = {
  concurrency: number
  /** Tokens currently unspent in the budget the tasks draw from. */
  headroom: () => number
  reserve: number
  maxBudgetWaitMs: number
  deadlineMs: number
  now: () => number
  sleep: (ms: number) => Promise<void>
  /** 'rate-limited' for budget/429 failures, 'blocked' for refused access (401/403), 'failed' otherwise. */
  classify: (error: unknown) => 'rate-limited' | 'blocked' | 'failed'
  /** Values that must never appear in results (secrets); replaced before anything is reported. */
  secrets: string[]
  /** Consecutive rate-limited tasks that stop the run (circuit breaker). */
  stopAfterRateLimited: number
  /** Blocked tasks (refused access) that stop the run. Default 1. */
  stopAfterBlocked?: number
}

const BUDGET_POLL_MS = 1_000
export const SKIP_RATE_LIMITED = 'backed off: upstream rate limiting'
export const SKIP_REFUSED = 'backed off: upstream access refused'

export function redact(text: string, secrets: string[]): string {
  return secrets.filter((s) => s.length >= 4).reduce((out, s) => out.split(s).join('[redacted]'), text)
}

/** Seconds a blocked job should wait (Retry-After): until `retryAt`, or `fallbackMs` when it is unknown. At least 1. */
export function retryAfterSeconds(retryAt: number | null, now: number, fallbackMs: number): number {
  return Math.max(1, Math.ceil(((retryAt ?? now + fallbackMs) - now) / 1000))
}

export async function runPrewarm(stages: PrewarmStage[], o: RunnerOptions): Promise<{ results: TaskResult[]; durationMs: number }> {
  const started = o.now()
  const results: TaskResult[] = []
  let rateLimitedInARow = 0
  let blocked = 0
  /** Why no new task may start, or null. Refused access wins: it won't clear by pacing. */
  const stopReason = () => (blocked >= (o.stopAfterBlocked ?? 1) ? SKIP_REFUSED : rateLimitedInARow >= o.stopAfterRateLimited ? SKIP_RATE_LIMITED : null)
  const message = (error: unknown) => redact(error instanceof Error ? error.message : String(error), o.secrets).slice(0, 200)
  const count = (status: 'rate-limited' | 'blocked' | 'failed') => {
    if (status === 'blocked') blocked++
    rateLimitedInARow = status === 'rate-limited' ? rateLimitedInARow + 1 : 0
  }

  /** Waits for budget headroom; false when it didn't recover in time (or the deadline passed). */
  async function budgetReady(): Promise<boolean> {
    const waitStart = o.now()
    while (o.headroom() < o.reserve) {
      if (o.now() - waitStart >= o.maxBudgetWaitMs || o.now() - started >= o.deadlineMs) return false
      await o.sleep(BUDGET_POLL_MS)
    }
    return true
  }

  for (const stage of stages) {
    const stopped = stopReason()
    if (stopped) {
      results.push({ stage: stage.name, name: '(stage)', status: 'skipped', ms: 0, error: stopped })
      continue
    }
    let tasks: PrewarmTask[]
    try {
      tasks = typeof stage.tasks === 'function' ? await stage.tasks() : stage.tasks
    } catch (error) {
      const status = o.classify(error)
      // A plan that is rate limited or refused counts like a task would, but a plain failure doesn't reset the count.
      if (status !== 'failed') count(status)
      results.push({ stage: stage.name, name: '(plan)', status, ms: 0, error: message(error) })
      continue
    }

    let next = 0
    const worker = async () => {
      while (next < tasks.length) {
        const task = tasks[next++]
        const stop = stopReason()
        if (stop) {
          results.push({ stage: stage.name, name: task.name, status: 'skipped', ms: 0, error: stop })
          continue
        }
        if (o.now() - started >= o.deadlineMs) {
          results.push({ stage: stage.name, name: task.name, status: 'skipped', ms: 0, error: 'deadline' })
          continue
        }
        if (!(await budgetReady())) {
          results.push({ stage: stage.name, name: task.name, status: 'skipped', ms: 0, error: 'budget headroom' })
          continue
        }
        const t0 = o.now()
        try {
          await task.run()
          rateLimitedInARow = 0
          results.push({ stage: stage.name, name: task.name, status: 'ok', ms: o.now() - t0 })
        } catch (error) {
          const status = o.classify(error)
          count(status)
          results.push({ stage: stage.name, name: task.name, status, ms: o.now() - t0, error: message(error) })
        }
      }
    }
    await Promise.all(Array.from({ length: Math.max(1, Math.min(o.concurrency, tasks.length)) }, worker))
  }
  return { results, durationMs: o.now() - started }
}

export function summarize(results: TaskResult[]) {
  const count = (s: TaskStatus) => results.filter((r) => r.status === s).length
  return { tasks: results.length, ok: count('ok'), failed: count('failed'), rateLimited: count('rate-limited'), blocked: count('blocked'), skipped: count('skipped') }
}
