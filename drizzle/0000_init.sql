CREATE TYPE "public"."ad_status" AS ENUM('active', 'paused', 'archived', 'pending', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."creative_status" AS ENUM('draft', 'live', 'paused', 'archived');--> statement-breakpoint
CREATE TYPE "public"."metric_range" AS ENUM('lifetime', 'last_7', 'prior_7');--> statement-breakpoint
CREATE TYPE "public"."sync_kind" AS ENUM('auto', 'manual', 'rebuild');--> statement-breakpoint
CREATE TYPE "public"."sync_status" AS ENUM('running', 'success', 'failed');--> statement-breakpoint
CREATE TYPE "public"."sync_window" AS ENUM('28d', 'full');--> statement-breakpoint
CREATE TABLE "ad_activations" (
	"meta_ad_id" text PRIMARY KEY NOT NULL,
	"creative_id" uuid NOT NULL,
	"campaign_id" text,
	"adset_id" text,
	"placement" text,
	"status" "ad_status" DEFAULT 'unknown' NOT NULL,
	"last_synced_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ad_decision_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ad_id" text NOT NULL,
	"author_id" uuid NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ad_metrics" (
	"ad_id" text NOT NULL,
	"as_of_date" date NOT NULL,
	"spend" numeric(14, 2) DEFAULT '0' NOT NULL,
	"revenue" numeric(14, 2) DEFAULT '0' NOT NULL,
	"impressions" bigint DEFAULT 0 NOT NULL,
	"clicks" bigint DEFAULT 0 NOT NULL,
	"conversions" bigint DEFAULT 0 NOT NULL,
	"reach" bigint DEFAULT 0 NOT NULL,
	"thumbstop" numeric(6, 4),
	"hold" numeric(6, 4),
	CONSTRAINT "ad_metrics_ad_id_as_of_date_pk" PRIMARY KEY("ad_id","as_of_date")
);
--> statement-breakpoint
CREATE TABLE "ad_range_metrics" (
	"ad_id" text NOT NULL,
	"range" "metric_range" NOT NULL,
	"reach" bigint DEFAULT 0 NOT NULL,
	"frequency" numeric(8, 4),
	"as_of_date" date NOT NULL,
	CONSTRAINT "ad_range_metrics_ad_id_range_pk" PRIMARY KEY("ad_id","range")
);
--> statement-breakpoint
CREATE TABLE "angle_personas" (
	"angle_id" uuid NOT NULL,
	"persona_id" uuid NOT NULL,
	CONSTRAINT "angle_personas_angle_id_persona_id_pk" PRIMARY KEY("angle_id","persona_id")
);
--> statement-breakpoint
CREATE TABLE "angles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "awareness_stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "creative_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creative_id" uuid NOT NULL,
	"storage_path" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creative_personas" (
	"creative_id" uuid NOT NULL,
	"persona_id" uuid NOT NULL,
	CONSTRAINT "creative_personas_creative_id_persona_id_pk" PRIMARY KEY("creative_id","persona_id")
);
--> statement-breakpoint
CREATE TABLE "creatives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"type_id" uuid NOT NULL,
	"subtype_id" uuid NOT NULL,
	"angle_id" uuid NOT NULL,
	"awareness_id" uuid,
	"hook_id" uuid,
	"review_link" text NOT NULL,
	"review_summary" text NOT NULL,
	"status" "creative_status" DEFAULT 'draft' NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hook_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "personas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"is_locked" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp with time zone,
	"perm_upload" boolean DEFAULT false NOT NULL,
	"perm_link" boolean DEFAULT false NOT NULL,
	"perm_unlink" boolean DEFAULT false NOT NULL,
	"perm_log" boolean DEFAULT false NOT NULL,
	"perm_master" boolean DEFAULT false NOT NULL,
	"perm_access" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subtypes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type_id" uuid NOT NULL,
	"label" text NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "sync_kind" NOT NULL,
	"window" "sync_window" NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"ads_count" integer DEFAULT 0 NOT NULL,
	"status" "sync_status" DEFAULT 'running' NOT NULL,
	"triggered_by" uuid
);
--> statement-breakpoint
CREATE TABLE "types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"google_sub" text,
	"role_id" uuid,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_google_sub_unique" UNIQUE("google_sub")
);
--> statement-breakpoint
ALTER TABLE "ad_activations" ADD CONSTRAINT "ad_activations_creative_id_creatives_id_fk" FOREIGN KEY ("creative_id") REFERENCES "public"."creatives"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_decision_log" ADD CONSTRAINT "ad_decision_log_ad_id_ad_activations_meta_ad_id_fk" FOREIGN KEY ("ad_id") REFERENCES "public"."ad_activations"("meta_ad_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_decision_log" ADD CONSTRAINT "ad_decision_log_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_metrics" ADD CONSTRAINT "ad_metrics_ad_id_ad_activations_meta_ad_id_fk" FOREIGN KEY ("ad_id") REFERENCES "public"."ad_activations"("meta_ad_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_range_metrics" ADD CONSTRAINT "ad_range_metrics_ad_id_ad_activations_meta_ad_id_fk" FOREIGN KEY ("ad_id") REFERENCES "public"."ad_activations"("meta_ad_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "angle_personas" ADD CONSTRAINT "angle_personas_angle_id_angles_id_fk" FOREIGN KEY ("angle_id") REFERENCES "public"."angles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "angle_personas" ADD CONSTRAINT "angle_personas_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_files" ADD CONSTRAINT "creative_files_creative_id_creatives_id_fk" FOREIGN KEY ("creative_id") REFERENCES "public"."creatives"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_personas" ADD CONSTRAINT "creative_personas_creative_id_creatives_id_fk" FOREIGN KEY ("creative_id") REFERENCES "public"."creatives"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_personas" ADD CONSTRAINT "creative_personas_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creatives" ADD CONSTRAINT "creatives_type_id_types_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creatives" ADD CONSTRAINT "creatives_subtype_id_subtypes_id_fk" FOREIGN KEY ("subtype_id") REFERENCES "public"."subtypes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creatives" ADD CONSTRAINT "creatives_angle_id_angles_id_fk" FOREIGN KEY ("angle_id") REFERENCES "public"."angles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creatives" ADD CONSTRAINT "creatives_awareness_id_awareness_stages_id_fk" FOREIGN KEY ("awareness_id") REFERENCES "public"."awareness_stages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creatives" ADD CONSTRAINT "creatives_hook_id_hook_types_id_fk" FOREIGN KEY ("hook_id") REFERENCES "public"."hook_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creatives" ADD CONSTRAINT "creatives_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subtypes" ADD CONSTRAINT "subtypes_type_id_types_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_triggered_by_users_id_fk" FOREIGN KEY ("triggered_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE set null ON UPDATE no action;