import { timingSafeEqual } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { getDb } from '@/lib/db/client'
import { JOBS, runJob, type JobName } from '@/lib/jobs'

/*
 * GET /api/cron/{reference|daily|builds|prune}[?days=N]
 * Called by Vercel Cron (vercel.json), which sends `Authorization: Bearer $CRON_SECRET`.
 * The daily job makes ~60 upstream requests at 4 in parallel, so it needs more than the default time.
 */
export const maxDuration = 300
export const dynamic = 'force-dynamic'

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  const header = request.headers.get('authorization') ?? ''
  if (!secret) return false
  const expected = Buffer.from(`Bearer ${secret}`)
  const given = Buffer.from(header)
  return given.length === expected.length && timingSafeEqual(given, expected)
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ job: string }> }) {
  if (!authorized(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { job } = await params
  if (!JOBS.includes(job as JobName)) return NextResponse.json({ error: `unknown job; use one of ${JOBS.join(', ')}` }, { status: 404 })
  const db = getDb()
  if (!db) return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 })
  const days = Number(request.nextUrl.searchParams.get('days') ?? '') || undefined
  const result = await runJob(db, job as JobName, { days })
  return NextResponse.json({ job, ...result }, { status: result.status === 'failed' ? 500 : 200 })
}
