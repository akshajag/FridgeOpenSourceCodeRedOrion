/**
 * TigerData / PostgreSQL schema (Drizzle ORM).
 * Ordinary application records live in regular tables; sensor readings are a separate
 * time-series table intended to become a TigerData hypertable (see sql/hypertable.sql).
 */
import { pgTable, text, timestamp, integer, real, boolean, jsonb, index, primaryKey } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey(), // Clerk user id
  name: text("name").notNull(),
  email: text("email").notNull(),
  walletAddress: text("wallet_address"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const organizations = pgTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  kind: text("kind").notNull().default("food_bank"),
  description: text("description").notNull().default(""),
  city: text("city").notNull().default(""),
  lat: real("lat").notNull().default(0),
  lng: real("lng").notNull().default(0),
  rewardBudgetSol: real("reward_budget_sol").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Role memberships: one user can hold several roles across organizations and fridges. */
export const memberships = pgTable(
  "memberships",
  {
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // food_bank | operator | donor
    organizationId: text("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
    fridgeId: text("fridge_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.role, t.organizationId, t.fridgeId] }), index("memberships_user_idx").on(t.userId)],
);

export const fridges = pgTable("fridges", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  operatorUserId: text("operator_user_id").notNull().references(() => users.id),
  visibility: text("visibility").notNull().default("public"),
  lat: real("lat").notNull().default(0),
  lng: real("lng").notNull().default(0),
  neighborhood: text("neighborhood").notNull().default(""),
  city: text("city").notNull().default(""),
  address: text("address").notNull().default(""),
  status: text("status").notNull().default("offline"),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
  capabilities: jsonb("capabilities").notNull().default({}),
  thresholds: jsonb("thresholds").notNull().default({ tempMinC: 1, tempMaxC: 5 }),
  hours: text("hours").notNull().default(""),
  description: text("description").notNull().default(""),
  hardwareVersion: text("hardware_version").notNull().default(""),
  /** Per-device ingest token hash, used by the hardware to post readings. */
  ingestTokenHash: text("ingest_token_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Organization ↔ fridge relationships (connection requests and approved links). */
export const connections = pgTable(
  "connections",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    fridgeId: text("fridge_id").notNull().references(() => fridges.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("pending"),
    message: text("message").notNull().default(""),
    sharing: jsonb("sharing").notNull().default({ inventory: false, sensors: false, alerts: false, preciseLocation: false }),
    requestedAt: timestamp("requested_at", { withTimezone: true }).defaultNow().notNull(),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
  },
  (t) => [index("connections_fridge_idx").on(t.fridgeId), index("connections_org_idx").on(t.organizationId)],
);

export const inventoryItems = pgTable(
  "inventory_items",
  {
    id: text("id").primaryKey(),
    fridgeId: text("fridge_id").notNull().references(() => fridges.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    category: text("category").notNull(),
    quantity: integer("quantity").notNull().default(1),
    unit: text("unit").notNull().default("pcs"),
    addedAt: timestamp("added_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    recognitionConfidence: real("recognition_confidence"),
    recognitionSource: text("recognition_source").notNull().default("manual"),
    recognitionConfirmed: boolean("recognition_confirmed").notNull().default(false),
    status: text("status").notNull().default("available"),
    donationId: text("donation_id"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("inventory_fridge_idx").on(t.fridgeId)],
);

export const inventoryEvents = pgTable(
  "inventory_events",
  {
    id: text("id").primaryKey(),
    fridgeId: text("fridge_id").notNull().references(() => fridges.id, { onDelete: "cascade" }),
    itemId: text("item_id"),
    itemName: text("item_name").notNull(),
    type: text("type").notNull(),
    quantityDelta: integer("quantity_delta").notNull().default(0),
    actor: text("actor").notNull(),
    note: text("note"),
    at: timestamp("at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("inventory_events_fridge_idx").on(t.fridgeId, t.at)],
);

/** Time-series: convert to a TigerData hypertable on `at` (sql/hypertable.sql). */
export const sensorReadings = pgTable(
  "sensor_readings",
  {
    fridgeId: text("fridge_id").notNull(),
    metric: text("metric").notNull(),
    value: real("value").notNull(),
    unit: text("unit").notNull(),
    source: text("source").notNull().default("hardware"),
    at: timestamp("at", { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.fridgeId, t.metric, t.at] }), index("sensor_readings_at_idx").on(t.at)],
);

export const sensorAlerts = pgTable(
  "sensor_alerts",
  {
    id: text("id").primaryKey(),
    fridgeId: text("fridge_id").notNull().references(() => fridges.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    severity: text("severity").notNull(),
    title: text("title").notNull(),
    detail: text("detail").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [index("alerts_fridge_idx").on(t.fridgeId)],
);

export const missions = pgTable("missions", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  foodType: text("food_type").notNull(),
  category: text("category").notNull(),
  quantityNeeded: integer("quantity_needed").notNull(),
  quantityVerified: integer("quantity_verified").notNull().default(0),
  unit: text("unit").notNull(),
  deadline: timestamp("deadline", { withTimezone: true }).notNull(),
  location: jsonb("location").notNull(),
  rewardSol: real("reward_sol"),
  rewardCondition: text("reward_condition").notNull().default(""),
  eligibility: jsonb("eligibility").notNull().default([]),
  status: text("status").notNull().default("draft"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const missionParticipants = pgTable(
  "mission_participants",
  {
    missionId: text("mission_id").notNull().references(() => missions.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.missionId, t.userId] })],
);

export const donations = pgTable(
  "donations",
  {
    id: text("id").primaryKey(),
    missionId: text("mission_id").references(() => missions.id, { onDelete: "set null" }),
    donorUserId: text("donor_user_id").notNull().references(() => users.id),
    fridgeId: text("fridge_id").notNull().references(() => fridges.id),
    itemName: text("item_name").notNull(),
    category: text("category").notNull(),
    quantity: integer("quantity").notNull(),
    unit: text("unit").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    note: text("note"),
    status: text("status").notNull().default("proposed"),
    proposedAt: timestamp("proposed_at", { withTimezone: true }).defaultNow().notNull(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    pointsAwarded: integer("points_awarded").notNull().default(0),
  },
  (t) => [index("donations_fridge_idx").on(t.fridgeId), index("donations_donor_idx").on(t.donorUserId)],
);

/** One verification record per donation decision; keeps the audit trail separate from the donation row. */
export const donationVerifications = pgTable("donation_verifications", {
  id: text("id").primaryKey(),
  donationId: text("donation_id").notNull().references(() => donations.id, { onDelete: "cascade" }),
  verifiedByUserId: text("verified_by_user_id").notNull().references(() => users.id),
  decision: text("decision").notNull(), // accepted | rejected
  reason: text("reason"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }).defaultNow().notNull(),
});

export const communityEvents = pgTable("community_events", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  fridgeIds: jsonb("fridge_ids").notNull().default([]),
  donationGoal: integer("donation_goal").notNull().default(0),
  eligibleItems: jsonb("eligible_items").notNull().default([]),
  leaderboardRule: text("leaderboard_rule").notNull().default("verified_points"),
  prizeWinners: integer("prize_winners").notNull().default(0),
  prizeBudgetSol: real("prize_budget_sol").notNull().default(0),
  status: text("status").notNull().default("draft"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const leaderboardEvents = pgTable(
  "leaderboard_events",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    donationId: text("donation_id").notNull().references(() => donations.id, { onDelete: "cascade" }),
    points: integer("points").notNull(),
    reason: text("reason").notNull(),
    at: timestamp("at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("leaderboard_user_idx").on(t.userId)],
);

export const rewardAllocations = pgTable("reward_allocations", {
  id: text("id").primaryKey(),
  missionId: text("mission_id").notNull().references(() => missions.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  amountSol: real("amount_sol").notNull(),
  status: text("status").notNull().default("eligible"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  transactionId: text("transaction_id"),
});

export const rewardTransactions = pgTable("reward_transactions", {
  id: text("id").primaryKey(),
  allocationId: text("allocation_id").notNull().references(() => rewardAllocations.id, { onDelete: "cascade" }),
  network: text("network").notNull(),
  signature: text("signature").notNull(),
  toAddress: text("to_address").notNull(),
  amountSol: real("amount_sol").notNull(),
  status: text("status").notNull(),
  explorerUrl: text("explorer_url"),
  at: timestamp("at", { withTimezone: true }).defaultNow().notNull(),
});
