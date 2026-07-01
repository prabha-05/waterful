/**
 * Waterful — Drizzle schema.
 *
 * Canonical source: decisions doc §7 (which adopts BUILD_GUIDE §2 + HANDOVER deltas
 * with two refinements from us):
 *   - #5 REFINES: `creatives.file_ref` is replaced by a `creative_files` child table
 *     (Video/Static = 1 row; Carousel = N rows ordered by `position`).
 *   - #7 CONFIRMS: `users.role_id` is a NULLABLE FK (one role per user; NULL = no access).
 *   - #8 CONFIRMS: design's field names — `ad_metrics`, `sync_runs`, `last_synced_at`.
 *
 * Aggregation note (§6 G1/G2): `ad_metrics.reach` is stored per day for the 7-day
 * series but MUST NOT be summed for lifetime (reach is de-duplicated). Range-level
 * reach/frequency from Meta is stored separately in `ad_range_metrics`.
 *
 * Workflow (§2): define here → `drizzle-kit generate` → hand-add RLS + seed to the
 * migration SQL.
 */
import {
  bigint,
  boolean,
  date,
  integer,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------
export const creativeStatus = pgEnum("creative_status", [
  "draft",
  "live",
  "paused",
  "archived",
]);

// Ad status mirrored from Meta (read-only in v1, §6). Kept as text-ish enum.
export const adStatus = pgEnum("ad_status", [
  "active",
  "paused",
  "archived",
  "pending",
  "unknown",
]);

export const syncKind = pgEnum("sync_kind", ["auto", "manual", "rebuild"]);
export const syncWindow = pgEnum("sync_window", ["28d", "full"]);
export const syncStatus = pgEnum("sync_status", [
  "running",
  "success",
  "failed",
]);

// Range buckets for de-duplicated reach/frequency (§6 G1; open decision #4).
export const metricRange = pgEnum("metric_range", [
  "lifetime",
  "last_7",
  "prior_7",
]);

// ---------------------------------------------------------------------------
// Access: roles + users (HANDOVER §3–5, decisions §5)
// ---------------------------------------------------------------------------
export const roles = pgTable("roles", {
  id: uuid("id").primaryKey().defaultRandom(),
  label: text("label").notNull(),
  isSystem: boolean("is_system").notNull().default(false),
  isLocked: boolean("is_locked").notNull().default(false),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  // The six permission booleans (decisions §4).
  permUpload: boolean("perm_upload").notNull().default(false),
  permLink: boolean("perm_link").notNull().default(false),
  permUnlink: boolean("perm_unlink").notNull().default(false),
  permLog: boolean("perm_log").notNull().default(false),
  permMaster: boolean("perm_master").notNull().default(false),
  permAccess: boolean("perm_access").notNull().default(false),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  // Stable Google identifier captured on first sight (decisions §3).
  googleSub: text("google_sub").unique(),
  // #7: nullable FK — one role per user; NULL = deactivated / no access.
  roleId: uuid("role_id").references(() => roles.id, { onDelete: "set null" }),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ---------------------------------------------------------------------------
// Master data / taxonomy (README "Seeded values")
// ---------------------------------------------------------------------------
export const personas = pgTable("personas", {
  id: uuid("id").primaryKey().defaultRandom(),
  label: text("label").notNull(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
});

export const angles = pgTable("angles", {
  id: uuid("id").primaryKey().defaultRandom(),
  label: text("label").notNull(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
});

// Angle ↔ Persona mapping (M:N). Locked-when-in-use enforced in app/RLS, not schema.
export const anglePersonas = pgTable(
  "angle_personas",
  {
    angleId: uuid("angle_id")
      .notNull()
      .references(() => angles.id, { onDelete: "cascade" }),
    personaId: uuid("persona_id")
      .notNull()
      .references(() => personas.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.angleId, t.personaId] })],
);

export const types = pgTable("types", {
  id: uuid("id").primaryKey().defaultRandom(),
  label: text("label").notNull(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
});

export const subtypes = pgTable("subtypes", {
  id: uuid("id").primaryKey().defaultRandom(),
  typeId: uuid("type_id")
    .notNull()
    .references(() => types.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
});

export const awarenessStages = pgTable("awareness_stages", {
  id: uuid("id").primaryKey().defaultRandom(),
  label: text("label").notNull(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
});

export const hookTypes = pgTable("hook_types", {
  id: uuid("id").primaryKey().defaultRandom(),
  label: text("label").notNull(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
});

// ---------------------------------------------------------------------------
// Creatives + files + personas (decisions §7, #5)
// ---------------------------------------------------------------------------
export const creatives = pgTable("creatives", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  typeId: uuid("type_id")
    .notNull()
    .references(() => types.id),
  subtypeId: uuid("subtype_id")
    .notNull()
    .references(() => subtypes.id),
  angleId: uuid("angle_id")
    .notNull()
    .references(() => angles.id),
  awarenessId: uuid("awareness_id").references(() => awarenessStages.id),
  hookId: uuid("hook_id").references(() => hookTypes.id),
  // Both required at upload (README §6).
  reviewLink: text("review_link").notNull(),
  reviewSummary: text("review_summary").notNull(),
  status: creativeStatus("status").notNull().default("draft"),
  // Attribution references the user, survives role_id = NULL (decisions §5).
  uploadedBy: uuid("uploaded_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const creativePersonas = pgTable(
  "creative_personas",
  {
    creativeId: uuid("creative_id")
      .notNull()
      .references(() => creatives.id, { onDelete: "cascade" }),
    personaId: uuid("persona_id")
      .notNull()
      .references(() => personas.id),
  },
  (t) => [primaryKey({ columns: [t.creativeId, t.personaId] })],
);

// #5: replaces single creatives.file_ref. Carousel = many rows ordered by position.
export const creativeFiles = pgTable("creative_files", {
  id: uuid("id").primaryKey().defaultRandom(),
  creativeId: uuid("creative_id")
    .notNull()
    .references(() => creatives.id, { onDelete: "cascade" }),
  storagePath: text("storage_path").notNull(),
  position: integer("position").notNull().default(0),
});

// ---------------------------------------------------------------------------
// Meta: activations + metrics + decision log (decisions §6, §7)
// ---------------------------------------------------------------------------
// PK = meta_ad_id, globally unique across all creatives (friendly "already linked to X").
export const adActivations = pgTable("ad_activations", {
  metaAdId: text("meta_ad_id").primaryKey(),
  creativeId: uuid("creative_id")
    .notNull()
    .references(() => creatives.id, { onDelete: "cascade" }),
  campaignId: text("campaign_id"),
  adsetId: text("adset_id"),
  placement: text("placement"),
  // Mirrored from Meta (read-only, §6).
  status: adStatus("status").notNull().default("unknown"),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
});

// Daily grain. ADDITIVE metrics only get summed (§6 G1). reach is stored per day
// for the 7-day series but is NOT summed for lifetime.
export const adMetrics = pgTable(
  "ad_metrics",
  {
    adId: text("ad_id")
      .notNull()
      .references(() => adActivations.metaAdId, { onDelete: "cascade" }),
    asOfDate: date("as_of_date").notNull(),
    // Additive across days:
    spend: numeric("spend", { precision: 14, scale: 2 }).notNull().default("0"),
    revenue: numeric("revenue", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    impressions: bigint("impressions", { mode: "number" })
      .notNull()
      .default(0),
    clicks: bigint("clicks", { mode: "number" }).notNull().default(0),
    conversions: bigint("conversions", { mode: "number" })
      .notNull()
      .default(0),
    // Non-additive — stored per day for the series, never summed for lifetime (G1):
    reach: bigint("reach", { mode: "number" }).notNull().default(0),
    // Video-only — null for Static/Carousel; render "No data" (BUILD_GUIDE §3):
    thumbstop: numeric("thumbstop", { precision: 6, scale: 4 }),
    hold: numeric("hold", { precision: 6, scale: 4 }),
  },
  // Upsert on (ad_id, as_of_date) so the trailing 28-day re-pull overwrites recent days.
  (t) => [primaryKey({ columns: [t.adId, t.asOfDate] })],
);

// Range-level de-duplicated reach/frequency pulled directly from Meta (§6 G1).
// Open decision #4: confirm exact windows — at minimum lifetime + last_7 + prior_7.
export const adRangeMetrics = pgTable(
  "ad_range_metrics",
  {
    adId: text("ad_id")
      .notNull()
      .references(() => adActivations.metaAdId, { onDelete: "cascade" }),
    range: metricRange("range").notNull(),
    reach: bigint("reach", { mode: "number" }).notNull().default(0),
    frequency: numeric("frequency", { precision: 8, scale: 4 }),
    asOfDate: date("as_of_date").notNull(),
  },
  (t) => [primaryKey({ columns: [t.adId, t.range] })],
);

export const adDecisionLog = pgTable("ad_decision_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  adId: text("ad_id")
    .notNull()
    .references(() => adActivations.metaAdId, { onDelete: "cascade" }),
  authorId: uuid("author_id")
    .notNull()
    .references(() => users.id),
  text: text("text").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ---------------------------------------------------------------------------
// Sync tracking (decisions §6, #8)
// ---------------------------------------------------------------------------
export const syncRuns = pgTable("sync_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: syncKind("kind").notNull(),
  window: syncWindow("window").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  adsCount: integer("ads_count").notNull().default(0),
  status: syncStatus("status").notNull().default("running"),
  triggeredBy: uuid("triggered_by").references(() => users.id),
});

// Note: concurrent-run guarding (rate-limit + lock; decisions §6) is enforced in the
// worker/app layer, not via a schema constraint.
