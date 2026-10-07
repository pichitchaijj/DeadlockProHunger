import { NextResponse, type NextRequest } from 'next/server'
import { getDb } from '@/lib/db/client'
import { JOBS, runJob, type JobName } from '@/lib/jobs'
import { isCronAuthorized } from '@/lib/jobs/cronAuth'
import { runPrewarmJob } from '@/lib/jobs/prewarm'

/*
 * GET /api/cron/{reference|daily|builds|prune|prewarm}[?days=N]
 * Called by Vercel Cron (vercel.json) and, for `prewarm`, hourly by GitHub Actions
 * (.github/workflows/prewarm.yml). Both send `Authorization: Bearer $CRON_SECRET`.
 * `prewarm` needs no database; the other jobs do. The daily job makes ~60 upstream requests at 4 in
 * parallel, so it needs more than the default time.
 */
export const maxDuration = 300
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, { params }: { params: Promise<{ job: string }> }) {
  if (!isCronAuthorized(request.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const { job } = await params
  if (job === 'prewarm') {
    const report = await runPrewarmJob()
    return NextResponse.json(report, { status: report.status === 'failed' ? 500 : 200, headers: { 'Cache-Control': 'no-store' } })
  }
  if (!JOBS.includes(job as JobName)) return NextResponse.json({ error: `unknown job; use one of ${[...JOBS, 'prewarm'].join(', ')}` }, { status: 404 })
  const db = getDb()
  if (!db) return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 })
  const days = Number(request.nextUrl.searchParams.get('days') ?? '') || undefined
  const result = await runJob(db, job as JobName, { days })
  return NextResponse.json({ job, ...result }, { status: result.status === 'failed' ? 500 : 200 })
}
