ALTER TABLE "items" ALTER COLUMN "class_name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "ability_orders" ADD COLUMN "patch_guid" text;--> statement-breakpoint
ALTER TABLE "data_snapshots" ADD COLUMN "patch_guid" text;--> statement-breakpoint
ALTER TABLE "hero_matchups" ADD COLUMN "patch_guid" text;--> statement-breakpoint
ALTER TABLE "hero_stats_snapshots" ADD COLUMN "patch_guid" text;--> statement-breakpoint
ALTER TABLE "hero_synergies" ADD COLUMN "patch_guid" text;--> statement-breakpoint
ALTER TABLE "match_heroes" ADD COLUMN "patch_guid" text;--> statement-breakpoint
ALTER TABLE "match_players" ADD COLUMN "patch_guid" text;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "patch_guid" text;--> statement-breakpoint
ALTER TABLE "player_rank_snapshots" ADD COLUMN "patch_guid" text;--> statement-breakpoint
ALTER TABLE "ability_orders" ADD CONSTRAINT "ability_orders_patch_guid_patches_guid_fk" FOREIGN KEY ("patch_guid") REFERENCES "public"."patches"("guid") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_snapshots" ADD CONSTRAINT "data_snapshots_patch_guid_patches_guid_fk" FOREIGN KEY ("patch_guid") REFERENCES "public"."patches"("guid") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hero_matchups" ADD CONSTRAINT "hero_matchups_patch_guid_patches_guid_fk" FOREIGN KEY ("patch_guid") REFERENCES "public"."patches"("guid") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hero_stats_snapshots" ADD CONSTRAINT "hero_stats_snapshots_patch_guid_patches_guid_fk" FOREIGN KEY ("patch_guid") REFERENCES "public"."patches"("guid") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hero_synergies" ADD CONSTRAINT "hero_synergies_patch_guid_patches_guid_fk" FOREIGN KEY ("patch_guid") REFERENCES "public"."patches"("guid") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_heroes" ADD CONSTRAINT "match_heroes_patch_guid_patches_guid_fk" FOREIGN KEY ("patch_guid") REFERENCES "public"."patches"("guid") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_players" ADD CONSTRAINT "match_players_patch_guid_patches_guid_fk" FOREIGN KEY ("patch_guid") REFERENCES "public"."patches"("guid") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_patch_guid_patches_guid_fk" FOREIGN KEY ("patch_guid") REFERENCES "public"."patches"("guid") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_rank_snapshots" ADD CONSTRAINT "player_rank_snapshots_patch_guid_patches_guid_fk" FOREIGN KEY ("patch_guid") REFERENCES "public"."patches"("guid") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ability_orders" ADD CONSTRAINT "ability_orders_window_chk" CHECK ("ability_orders"."window_start" <= "ability_orders"."window_end");--> statement-breakpoint
-- Backfill: the patch in effect on each row's UTC day (same rule as src/lib/db/repo.ts PATCH_SCOPES).
CREATE FUNCTION pg_temp.patch_on(d date) RETURNS text LANGUAGE sql STABLE AS $$ SELECT p.guid FROM patches p WHERE (p.effective_at AT TIME ZONE 'UTC')::date <= d ORDER BY p.effective_at DESC, p.guid DESC LIMIT 1 $$;--> statement-breakpoint
UPDATE "hero_stats_snapshots" SET "patch_guid" = pg_temp.patch_on("day");--> statement-breakpoint
UPDATE "hero_matchups" SET "patch_guid" = pg_temp.patch_on("day");--> statement-breakpoint
UPDATE "hero_synergies" SET "patch_guid" = pg_temp.patch_on("day");--> statement-breakpoint
UPDATE "player_rank_snapshots" SET "patch_guid" = pg_temp.patch_on(("observed_at" AT TIME ZONE 'UTC')::date);--> statement-breakpoint
UPDATE "matches" SET "patch_guid" = pg_temp.patch_on(("started_at" AT TIME ZONE 'UTC')::date);--> statement-breakpoint
UPDATE "match_players" SET "patch_guid" = pg_temp.patch_on(("started_at" AT TIME ZONE 'UTC')::date);--> statement-breakpoint
UPDATE "match_heroes" SET "patch_guid" = pg_temp.patch_on(("started_at" AT TIME ZONE 'UTC')::date);--> statement-breakpoint
UPDATE "ability_orders" SET "patch_guid" = CASE WHEN pg_temp.patch_on(("window_start" AT TIME ZONE 'UTC')::date) = pg_temp.patch_on(("window_end" AT TIME ZONE 'UTC')::date) THEN pg_temp.patch_on(("window_end" AT TIME ZONE 'UTC')::date) END;--> statement-breakpoint
UPDATE "data_snapshots" SET "patch_guid" = CASE WHEN pg_temp.patch_on((coalesce("window_start", "window_end", "fetched_at") AT TIME ZONE 'UTC')::date) = pg_temp.patch_on((coalesce("window_end", "fetched_at") AT TIME ZONE 'UTC')::date) THEN pg_temp.patch_on((coalesce("window_end", "fetched_at") AT TIME ZONE 'UTC')::date) END;
