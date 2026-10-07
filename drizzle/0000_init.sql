CREATE TABLE "ability_orders" (
	"snapshot_day" date NOT NULL,
	"hero_id" smallint NOT NULL,
	"rank_band" text NOT NULL,
	"sequence_key" text NOT NULL,
	"abilities" bigint[] NOT NULL,
	"matches" integer NOT NULL,
	"wins" integer NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"window_end" timestamp with time zone NOT NULL,
	CONSTRAINT "ability_orders_snapshot_day_hero_id_rank_band_sequence_key_pk" PRIMARY KEY("snapshot_day","hero_id","rank_band","sequence_key"),
	CONSTRAINT "ability_orders_band_chk" CHECK (rank_band in ('all','low','mid','high','top'))
);
--> statement-breakpoint
CREATE TABLE "build_items" (
	"build_id" bigint NOT NULL,
	"category_index" smallint NOT NULL,
	"position" smallint NOT NULL,
	"item_id" bigint NOT NULL,
	"category_name" text,
	CONSTRAINT "build_items_build_id_category_index_position_pk" PRIMARY KEY("build_id","category_index","position")
);
--> statement-breakpoint
CREATE TABLE "builds" (
	"build_id" bigint PRIMARY KEY NOT NULL,
	"version" integer NOT NULL,
	"hero_id" smallint NOT NULL,
	"name" text NOT NULL,
	"author_account_id" bigint,
	"language" integer,
	"tags" integer[],
	"weekly_favorites" integer,
	"favorites" integer,
	"published_at" timestamp with time zone,
	"updated_at" timestamp with time zone,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_snapshots" (
	"key" text PRIMARY KEY NOT NULL,
	"endpoint" text NOT NULL,
	"params" jsonb NOT NULL,
	"window_start" timestamp with time zone,
	"window_end" timestamp with time zone,
	"min_badge" smallint,
	"max_badge" smallint,
	"sample_size" integer,
	"payload" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hero_matchups" (
	"day" date NOT NULL,
	"hero_id" smallint NOT NULL,
	"enemy_hero_id" smallint NOT NULL,
	"rank_band" text NOT NULL,
	"same_lane" boolean NOT NULL,
	"matches" integer NOT NULL,
	"wins" integer NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hero_matchups_day_hero_id_enemy_hero_id_rank_band_same_lane_pk" PRIMARY KEY("day","hero_id","enemy_hero_id","rank_band","same_lane"),
	CONSTRAINT "hero_matchups_band_chk" CHECK (rank_band in ('all','low','mid','high','top'))
);
--> statement-breakpoint
CREATE TABLE "hero_stats_snapshots" (
	"day" date NOT NULL,
	"hero_id" smallint NOT NULL,
	"rank_band" text NOT NULL,
	"game_mode" text DEFAULT 'normal' NOT NULL,
	"match_mode" text DEFAULT 'ranked,unranked' NOT NULL,
	"matches" integer NOT NULL,
	"wins" integer NOT NULL,
	"losses" integer NOT NULL,
	"kills" bigint NOT NULL,
	"deaths" bigint NOT NULL,
	"assists" bigint NOT NULL,
	"net_worth" bigint NOT NULL,
	"player_damage" bigint,
	"damage_taken" bigint,
	"objective_damage" bigint,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hero_stats_snapshots_day_hero_id_rank_band_game_mode_match_mode_pk" PRIMARY KEY("day","hero_id","rank_band","game_mode","match_mode"),
	CONSTRAINT "hero_stats_band_chk" CHECK (rank_band in ('all','low','mid','high','top')),
	CONSTRAINT "hero_stats_wins_chk" CHECK ("hero_stats_snapshots"."wins" <= "hero_stats_snapshots"."matches")
);
--> statement-breakpoint
CREATE TABLE "hero_synergies" (
	"day" date NOT NULL,
	"hero_id_1" smallint NOT NULL,
	"hero_id_2" smallint NOT NULL,
	"rank_band" text NOT NULL,
	"matches" integer NOT NULL,
	"wins" integer NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hero_synergies_day_hero_id_1_hero_id_2_rank_band_pk" PRIMARY KEY("day","hero_id_1","hero_id_2","rank_band"),
	CONSTRAINT "hero_synergies_order_chk" CHECK ("hero_synergies"."hero_id_1" < "hero_synergies"."hero_id_2"),
	CONSTRAINT "hero_synergies_band_chk" CHECK (rank_band in ('all','low','mid','high','top'))
);
--> statement-breakpoint
CREATE TABLE "heroes" (
	"hero_id" smallint PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"class_name" text NOT NULL,
	"hero_type" text,
	"complexity" smallint,
	"icon_url" text,
	"card_url" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "heroes_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "items" (
	"item_id" bigint PRIMARY KEY NOT NULL,
	"class_name" text NOT NULL,
	"name" text,
	"type" text NOT NULL,
	"slot" text,
	"tier" smallint,
	"cost" integer,
	"shopable" boolean DEFAULT false NOT NULL,
	"hero_id" smallint,
	"icon_url" text,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "match_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"match_id" bigint NOT NULL,
	"time_s" integer NOT NULL,
	"kind" text NOT NULL,
	"team" smallint,
	"actor_slot" smallint,
	"target_slot" smallint,
	"objective_id" integer,
	CONSTRAINT "match_events_kind_chk" CHECK ("match_events"."kind" in ('kill','objective','mid_boss'))
);
--> statement-breakpoint
CREATE TABLE "match_heroes" (
	"match_id" bigint NOT NULL,
	"hero_id" smallint NOT NULL,
	"kind" text NOT NULL,
	"team" smallint,
	"won" boolean,
	"started_at" timestamp with time zone NOT NULL,
	CONSTRAINT "match_heroes_match_id_hero_id_kind_pk" PRIMARY KEY("match_id","hero_id","kind"),
	CONSTRAINT "match_heroes_kind_chk" CHECK ("match_heroes"."kind" in ('picked','banned','swapped_from'))
);
--> statement-breakpoint
CREATE TABLE "match_players" (
	"match_id" bigint NOT NULL,
	"player_slot" smallint NOT NULL,
	"account_id" bigint NOT NULL,
	"team" smallint NOT NULL,
	"hero_id" smallint NOT NULL,
	"won" boolean,
	"lane" smallint,
	"kills" smallint NOT NULL,
	"deaths" smallint NOT NULL,
	"assists" smallint NOT NULL,
	"net_worth" integer NOT NULL,
	"last_hits" integer NOT NULL,
	"denies" integer NOT NULL,
	"level" smallint NOT NULL,
	"hero_build_id" bigint,
	"started_at" timestamp with time zone NOT NULL,
	CONSTRAINT "match_players_match_id_player_slot_pk" PRIMARY KEY("match_id","player_slot")
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"match_id" bigint PRIMARY KEY NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"duration_s" integer NOT NULL,
	"game_mode" smallint NOT NULL,
	"match_mode" smallint NOT NULL,
	"winning_team" smallint,
	"average_badge_team0" smallint,
	"average_badge_team1" smallint,
	"not_scored" boolean,
	"detail" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "patches" (
	"guid" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"title" text NOT NULL,
	"link" text,
	"effective_at" timestamp with time zone NOT NULL,
	"posted_at" timestamp with time zone,
	"excerpt" text,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player_hero_stats" (
	"account_id" bigint NOT NULL,
	"hero_id" smallint NOT NULL,
	"matches" integer NOT NULL,
	"wins" integer NOT NULL,
	"kills" integer NOT NULL,
	"deaths" integer NOT NULL,
	"assists" integer NOT NULL,
	"last_played_at" timestamp with time zone,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_hero_stats_account_id_hero_id_pk" PRIMARY KEY("account_id","hero_id")
);
--> statement-breakpoint
CREATE TABLE "player_rank_snapshots" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"badge" smallint NOT NULL,
	"rank_tier" smallint,
	"subrank" smallint,
	"last_match_id" bigint,
	"last_match_at" timestamp with time zone,
	"source" text NOT NULL,
	CONSTRAINT "player_rank_state_uq" UNIQUE NULLS NOT DISTINCT("account_id","badge","last_match_id")
);
--> statement-breakpoint
CREATE TABLE "players" (
	"account_id" bigint PRIMARY KEY NOT NULL,
	"persona_name" text,
	"avatar_url" text,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"profile_fetched_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"job" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text NOT NULL,
	"requests" integer DEFAULT 0 NOT NULL,
	"rows" jsonb,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "ability_orders" ADD CONSTRAINT "ability_orders_hero_id_heroes_hero_id_fk" FOREIGN KEY ("hero_id") REFERENCES "public"."heroes"("hero_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "build_items" ADD CONSTRAINT "build_items_build_id_builds_build_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."builds"("build_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "builds" ADD CONSTRAINT "builds_hero_id_heroes_hero_id_fk" FOREIGN KEY ("hero_id") REFERENCES "public"."heroes"("hero_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hero_stats_snapshots" ADD CONSTRAINT "hero_stats_snapshots_hero_id_heroes_hero_id_fk" FOREIGN KEY ("hero_id") REFERENCES "public"."heroes"("hero_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_hero_id_heroes_hero_id_fk" FOREIGN KEY ("hero_id") REFERENCES "public"."heroes"("hero_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_match_id_matches_match_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("match_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_heroes" ADD CONSTRAINT "match_heroes_match_id_matches_match_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("match_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_players" ADD CONSTRAINT "match_players_match_id_matches_match_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("match_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_hero_stats" ADD CONSTRAINT "player_hero_stats_account_id_players_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."players"("account_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_rank_snapshots" ADD CONSTRAINT "player_rank_snapshots_account_id_players_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."players"("account_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "build_items_item_idx" ON "build_items" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "builds_hero_favorites_idx" ON "builds" USING btree ("hero_id","weekly_favorites" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "builds_name_lower_idx" ON "builds" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "data_snapshots_fetched_idx" ON "data_snapshots" USING btree ("fetched_at");--> statement-breakpoint
CREATE INDEX "hero_matchups_pair_idx" ON "hero_matchups" USING btree ("hero_id","enemy_hero_id","day" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "hero_stats_hero_day_idx" ON "hero_stats_snapshots" USING btree ("hero_id","rank_band","day" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "items_type_shopable_idx" ON "items" USING btree ("type","shopable");--> statement-breakpoint
CREATE INDEX "items_name_lower_idx" ON "items" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "match_events_match_idx" ON "match_events" USING btree ("match_id","time_s");--> statement-breakpoint
CREATE INDEX "match_heroes_hero_idx" ON "match_heroes" USING btree ("hero_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "match_players_account_idx" ON "match_players" USING btree ("account_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "matches_started_idx" ON "matches" USING btree ("started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "patches_effective_idx" ON "patches" USING btree ("effective_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "player_hero_stats_hero_idx" ON "player_hero_stats" USING btree ("hero_id","matches" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "player_rank_account_idx" ON "player_rank_snapshots" USING btree ("account_id","observed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "players_name_lower_idx" ON "players" USING btree (lower("persona_name"));--> statement-breakpoint
CREATE INDEX "sync_runs_job_idx" ON "sync_runs" USING btree ("job","started_at" DESC NULLS LAST);