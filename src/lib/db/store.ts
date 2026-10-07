import 'server-only'
import { after } from 'next/server'
import { getDb } from './client'
import { matchRows, playerHeroStatsRows, rankObservation, type ApiMatchDetail } from './mappers'
import * as repo from './repo'

/*
 * Request-path database helpers. Two rules:
 *  1. Never break a page: without a database, or when it fails, reads return null and writes are skipped.
 *  2. Never slow a page: writes run after the response is sent (`after`).
 */

const PROFILE_REFRESH_MS = 10 * 60 * 1000

/** Runs a read; any failure (or no database) is "nothing stored". */
async function read<T>(label: string, fn: (db: repo.Db) => Promise<T>): Promise<T | null> {
  const db = getDb()
  if (!db) return null
  try {
    return await fn(db)
  } catch (error) {
    console.error(`[db] read ${label} failed`, error)
    return null
  }
}

/** Schedules a write after the response; failures are logged, never surfaced. */
function write(label: string, fn: (db: repo.Db) => Promise<unknown>) {
  const db = getDb()
  if (!db) return
  after(async () => {
    try {
      await fn(db)
    } catch (error) {
      console.error(`[db] write ${label} failed`, error)
    }
  })
}

// ── Matches: finished matches are immutable, so the database is the first stop ──

export function readStoredMatch(matchId: number) {
  return read('match', async (db) => (await repo.storedMatchDetail(db, matchId))?.detail ?? null)
}

export function storeMatch(detail: ApiMatchDetail) {
  write('match', (db) => repo.saveMatch(db, matchRows(detail)))
}

// ── Players: public profile, rank history, per-hero totals ──

type ProfileInput = {
  accountId: number
  name: string | null
  avatar: string | null
  rank: { badge: number; rank: number; subrank: number; last_match?: { match_id: number; start_time: number } | null } | null
  heroStats: Array<{ hero_id: number; matches_played: number; wins: number; kills: number; deaths: number; assists: number; last_played?: number | null }>
}

/** Records what a profile view showed, at most once per player every 10 minutes. */
export function storeProfile(p: ProfileInput) {
  write('profile', async (db) => {
    const last = await repo.profileFetchedAt(db, p.accountId)
    if (last && Date.now() - last.getTime() < PROFILE_REFRESH_MS) return
    await repo.upsertPlayers(db, [{ accountId: p.accountId, personaName: p.name, avatarUrl: p.avatar, profileFetched: true }])
    if (p.rank) await repo.recordRank(db, rankObservation(p.accountId, p.rank, 'profile'))
    await repo.replacePlayerHeroStats(db, p.accountId, playerHeroStatsRows(p.accountId, p.heroStats))
  })
}

// ── Fallbacks: last good data when the live API fails ──

/** Our own daily hero history for a full window, or null (see repo.heroStatsHistory). */
export function heroStatsFromHistory(p: { from: string; to: string; rankBand: string }) {
  return read('hero-stats', (db) => repo.heroStatsHistory(db, p))
}

/** Last good payload written by a job (e.g. leaderboards), with its time. */
export function readSnapshot<T>(key: string) {
  return read('snapshot', async (db) => {
    const row = await repo.getSnapshot(db, key)
    return row ? { payload: row.payload as T, fetchedAt: row.fetchedAt } : null
  })
}
