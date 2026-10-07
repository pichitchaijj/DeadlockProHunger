import { RankBandIcons } from '@/components/game-assets/RankBadge'
import type { FilterOption } from '@/components/ui/Filter'
import { RANK_BANDS, type RankBandId } from '@/lib/analytics/rankBands'
import { bandRanks, type RankCatalog } from '@/lib/deadlock/rankAssets'

/** Options for every rank-band filter: the band's name plus its first/last tier emblems ("All ranks" has none). */
export function rankBandOptions(labels: Record<RankBandId, string>, ranks: RankCatalog, href: (rank: RankBandId) => string): FilterOption[] {
  return RANK_BANDS.map((band) => {
    const pair = bandRanks(band.tiers, ranks)
    return { value: band.id, label: labels[band.id], href: href(band.id), icon: pair ? <RankBandIcons ranks={pair} /> : undefined }
  })
}
