import "server-only";

/**
 * Repository: typed server functions over the Drizzle schema.
 * Every function takes explicit ids/sessions; authorization decisions live in `authorize.ts`
 * and the route handlers, close to the data.
 */
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db, schema } from "./client";
import type { Fridge, FridgeyDataset, Membership, Organization, SensorMetric } from "@/types";
import type { FridgeySession } from "@/lib/auth/session";
import { SCORING } from "@/types";

const uid = (p: string) => `${p}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : undefined);

export async function ensureUser(input: { id: string; name: string; email: string }) {
  await db().insert(schema.users).values(input).onConflictDoUpdate({ target: schema.users.id, set: { name: input.name, email: input.email } });
}

export async function createOrganizationForUser(userId: string, name: string): Promise<Organization> {
  const id = uid("org");
  const [row] = await db().insert(schema.organizations).values({ id, name }).returning();
  await db().insert(schema.memberships).values({ userId, role: "food_bank", organizationId: id }).onConflictDoNothing();
  return { id: row.id, name: row.name, kind: "food_bank", description: row.description, city: row.city, location: { lat: row.lat, lng: row.lng }, rewardBudgetSol: row.rewardBudgetSol, createdAt: row.createdAt.toISOString() };
}

export async function createFridgeForUser(userId: string, name: string): Promise<Fridge> {
  const id = uid("fridge");
  const [row] = await db().insert(schema.fridges).values({ id, name, operatorUserId: userId, capabilities: { temperature: true, humidity: false, airQuality: false, frontCamera: false, interiorCamera: false, voiceAssistant: false } }).returning();
  await db().insert(schema.memberships).values({ userId, role: "operator", fridgeId: id }).onConflictDoNothing();
  return mapFridge(row);
}

function mapFridge(row: typeof schema.fridges.$inferSelect): Fridge {
  return {
    id: row.id,
    name: row.name,
    operatorUserId: row.operatorUserId,
    visibility: row.visibility as Fridge["visibility"],
    location: { lat: row.lat, lng: row.lng },
    neighborhood: row.neighborhood,
    city: row.city,
    address: row.address,
    status: row.status as Fridge["status"],
    lastSeenAt: row.lastSeenAt.toISOString(),
    capabilities: row.capabilities as Fridge["capabilities"],
    thresholds: row.thresholds as Fridge["thresholds"],
    hours: row.hours,
    description: row.description,
    hardwareVersion: row.hardwareVersion,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Memberships from the database (source of truth in live mode; mirrored to Clerk metadata). */
export async function membershipsForUser(userId: string): Promise<Membership[]> {
  const rows = await db().select().from(schema.memberships).where(eq(schema.memberships.userId, userId));
  return rows.map((r) => ({ role: r.role as Membership["role"], organizationId: r.organizationId ?? undefined, fridgeId: r.fridgeId ?? undefined }));
}

/**
 * Load the dataset visible to a session. Scoping rules:
 * - Fridges: public ones for everyone; private ones only to their operator and organizations with approved connections.
 * - Precise address: only operator and approved organizations with preciseLocation sharing. Otherwise blanked.
 * - Inventory / sensors / alerts: operator; organizations with the matching sharing flag; donors see public inventory only.
 */
export async function loadDataset(session: FridgeySession): Promise<FridgeyDataset> {
  const d = db();
  const orgIds = session.memberships.filter((m) => m.role === "food_bank" && m.organizationId).map((m) => m.organizationId!);
  const myFridgeIds = session.memberships.filter((m) => m.role === "operator" && m.fridgeId).map((m) => m.fridgeId!);

  const [users, organizations, fridgesRows, connections] = await Promise.all([
    d.select({ id: schema.users.id, name: schema.users.name, email: schema.users.email, walletAddress: schema.users.walletAddress, createdAt: schema.users.createdAt }).from(schema.users),
    d.select().from(schema.organizations),
    d.select().from(schema.fridges),
    d.select().from(schema.connections),
  ]);

  const approvedForMe = connections.filter((c) => c.status === "approved" && orgIds.includes(c.organizationId));
  const visibleFridges = fridgesRows.filter((f) => f.visibility === "public" || myFridgeIds.includes(f.id) || f.operatorUserId === session.userId || approvedForMe.some((c) => c.fridgeId === f.id));
  const fridgeIds = visibleFridges.map((f) => f.id);
  const canSee = (fridgeId: string, flag: "inventory" | "sensors" | "alerts" | "preciseLocation") =>
    myFridgeIds.includes(fridgeId) || approvedForMe.some((c) => c.fridgeId === fridgeId && (c.sharing as Record<string, boolean>)[flag]);

  const since = new Date(Date.now() - 7 * 86_400_000);
  const [inventory, inventoryEvents, readings, alerts, missionRows, participants, donationRows, verifications, events, leaderboard, rewards, rewardTx, membershipsRows] = await Promise.all([
    fridgeIds.length ? d.select().from(schema.inventoryItems).where(inArray(schema.inventoryItems.fridgeId, fridgeIds)) : [],
    fridgeIds.length ? d.select().from(schema.inventoryEvents).where(inArray(schema.inventoryEvents.fridgeId, fridgeIds)).orderBy(desc(schema.inventoryEvents.at)).limit(500) : [],
    fridgeIds.length ? d.select().from(schema.sensorReadings).where(and(inArray(schema.sensorReadings.fridgeId, fridgeIds), gte(schema.sensorReadings.at, since))) : [],
    fridgeIds.length ? d.select().from(schema.sensorAlerts).where(inArray(schema.sensorAlerts.fridgeId, fridgeIds)) : [],
    d.select().from(schema.missions),
    d.select().from(schema.missionParticipants),
    d.select().from(schema.donations),
    d.select().from(schema.donationVerifications),
    d.select().from(schema.communityEvents),
    d.select().from(schema.leaderboardEvents),
    d.select().from(schema.rewardAllocations),
    d.select().from(schema.rewardTransactions),
    d.select().from(schema.memberships),
  ]);

  const verificationByDonation = new Map(verifications.map((v) => [v.donationId, v]));

  return {
    users: users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.id === session.userId ? u.email : "",
      initials: u.name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase(),
      memberships: membershipsRows.filter((m) => m.userId === u.id).map((m) => ({ role: m.role as Membership["role"], organizationId: m.organizationId ?? undefined, fridgeId: m.fridgeId ?? undefined })),
      walletAddress: u.walletAddress ?? undefined,
      isDemo: false,
      createdAt: u.createdAt.toISOString(),
    })),
    organizations: organizations.map((o) => ({ id: o.id, name: o.name, kind: "food_bank", description: o.description, city: o.city, location: { lat: o.lat, lng: o.lng }, rewardBudgetSol: o.rewardBudgetSol, createdAt: o.createdAt.toISOString() })),
    fridges: visibleFridges.map((f) => ({ ...mapFridge(f), address: canSee(f.id, "preciseLocation") || f.visibility === "public" ? f.address : "" })),
    inventory: inventory
      .filter((i) => canSee(i.fridgeId, "inventory") || visibleFridges.find((f) => f.id === i.fridgeId)?.visibility === "public")
      .map((i) => ({ ...i, addedAt: i.addedAt.toISOString(), updatedAt: i.updatedAt.toISOString(), expiresAt: iso(i.expiresAt), recognitionConfidence: i.recognitionConfidence ?? undefined, donationId: i.donationId ?? undefined, category: i.category as FridgeyDataset["inventory"][number]["category"], recognitionSource: i.recognitionSource as FridgeyDataset["inventory"][number]["recognitionSource"], status: i.status as FridgeyDataset["inventory"][number]["status"] })),
    inventoryEvents: inventoryEvents.filter((e) => canSee(e.fridgeId, "inventory")).map((e) => ({ ...e, itemId: e.itemId ?? undefined, note: e.note ?? undefined, at: e.at.toISOString(), type: e.type as FridgeyDataset["inventoryEvents"][number]["type"], actor: e.actor as FridgeyDataset["inventoryEvents"][number]["actor"] })),
    sensorReadings: readings.filter((r) => canSee(r.fridgeId, "sensors")).map((r, i) => ({ id: `rd_${i}`, fridgeId: r.fridgeId, metric: r.metric as SensorMetric, value: r.value, unit: r.unit as "°C" | "%" | "ppm", source: r.source as "hardware" | "demo", at: r.at.toISOString() })),
    alerts: alerts.filter((a) => canSee(a.fridgeId, "alerts")).map((a) => ({ ...a, createdAt: a.createdAt.toISOString(), acknowledgedAt: iso(a.acknowledgedAt), resolvedAt: iso(a.resolvedAt), type: a.type as FridgeyDataset["alerts"][number]["type"], severity: a.severity as FridgeyDataset["alerts"][number]["severity"] })),
    missions: missionRows.map((m) => ({
      ...m,
      category: m.category as FridgeyDataset["missions"][number]["category"],
      status: m.status as FridgeyDataset["missions"][number]["status"],
      location: m.location as FridgeyDataset["missions"][number]["location"],
      eligibility: m.eligibility as string[],
      rewardSol: m.rewardSol ?? undefined,
      deadline: m.deadline.toISOString(),
      createdAt: m.createdAt.toISOString(),
      completedAt: iso(m.completedAt),
      participantUserIds: participants.filter((p) => p.missionId === m.id).map((p) => p.userId),
    })),
    donations: donationRows.map((x) => {
      const v = verificationByDonation.get(x.id);
      return {
        ...x,
        missionId: x.missionId ?? undefined,
        note: x.note ?? undefined,
        category: x.category as FridgeyDataset["donations"][number]["category"],
        status: x.status as FridgeyDataset["donations"][number]["status"],
        expiresAt: iso(x.expiresAt),
        proposedAt: x.proposedAt.toISOString(),
        deliveredAt: iso(x.deliveredAt),
        verifiedAt: iso(v?.verifiedAt),
        verifiedByUserId: v?.verifiedByUserId,
        rejectionReason: v?.reason ?? undefined,
      };
    }),
    events: events.map((e) => ({ ...e, fridgeIds: e.fridgeIds as string[], eligibleItems: e.eligibleItems as string[], leaderboardRule: e.leaderboardRule as FridgeyDataset["events"][number]["leaderboardRule"], status: e.status as FridgeyDataset["events"][number]["status"], startsAt: e.startsAt.toISOString(), endsAt: e.endsAt.toISOString(), createdAt: e.createdAt.toISOString() })),
    connections: connections
      .filter((c) => orgIds.includes(c.organizationId) || myFridgeIds.includes(c.fridgeId))
      .map((c) => ({ ...c, status: c.status as FridgeyDataset["connections"][number]["status"], sharing: c.sharing as FridgeyDataset["connections"][number]["sharing"], requestedAt: c.requestedAt.toISOString(), respondedAt: iso(c.respondedAt) })),
    leaderboard: leaderboard.map((l) => ({ ...l, at: l.at.toISOString() })),
    rewards: rewards
      .filter((r) => r.userId === session.userId || orgIds.includes(r.organizationId))
      .map((r) => ({ ...r, status: r.status as FridgeyDataset["rewards"][number]["status"], createdAt: r.createdAt.toISOString(), approvedAt: iso(r.approvedAt), transactionId: r.transactionId ?? undefined })),
    rewardTransactions: rewardTx.map((t) => ({ ...t, network: t.network as "devnet" | "simulated", status: t.status as "pending" | "confirmed" | "failed", explorerUrl: t.explorerUrl ?? undefined, at: t.at.toISOString() })),
  };
}

// ---------- Mutations (each is called only after the route handler authorized the caller) ----------

export async function insertSensorReading(fridgeId: string, metric: SensorMetric, value: number, source: "hardware" | "demo") {
  const unit = metric === "temperature" ? "°C" : metric === "humidity" ? "%" : "ppm";
  const at = new Date();
  const d = db();
  await d.insert(schema.sensorReadings).values({ fridgeId, metric, value, unit, source, at }).onConflictDoNothing();
  const [fridge] = await d.update(schema.fridges).set({ lastSeenAt: at, status: "online" }).where(eq(schema.fridges.id, fridgeId)).returning();
  if (!fridge) return;
  const th = fridge.thresholds as Fridge["thresholds"];
  const outOfRange =
    (metric === "temperature" && (value > th.tempMaxC || value < th.tempMinC)) ||
    (metric === "humidity" && th.humidityMaxPct !== undefined && value > th.humidityMaxPct) ||
    (metric === "air_quality" && th.airQualityMaxPpm !== undefined && value > th.airQualityMaxPpm);
  if (!outOfRange) return;
  const type = metric === "temperature" ? "temperature_excursion" : metric === "humidity" ? "humidity" : "air_quality";
  const open = await d.select({ id: schema.sensorAlerts.id }).from(schema.sensorAlerts).where(and(eq(schema.sensorAlerts.fridgeId, fridgeId), eq(schema.sensorAlerts.type, type), sql`${schema.sensorAlerts.resolvedAt} IS NULL`)).limit(1);
  if (open.length) return;
  await d.insert(schema.sensorAlerts).values({ id: uid("alert"), fridgeId, type, severity: "warning", title: `${metric.replace("_", " ")} at ${value}${unit}`, detail: "Reading is outside the configured threshold for this fridge." });
}

export async function acceptDonation(donationId: string, verifiedByUserId: string) {
  const d = db();
  const [donation] = await d.select().from(schema.donations).where(eq(schema.donations.id, donationId));
  if (!donation || donation.status === "accepted") throw new Error("Donation not found or already accepted");
  const at = new Date();
  let points = donation.quantity * SCORING.pointsPerAcceptedUnit;
  await d.update(schema.donations).set({ status: "accepted", deliveredAt: donation.deliveredAt ?? at }).where(eq(schema.donations.id, donationId));
  await d.insert(schema.donationVerifications).values({ id: uid("ver"), donationId, verifiedByUserId, decision: "accepted", verifiedAt: at });
  const itemId = uid("item");
  await d.insert(schema.inventoryItems).values({ id: itemId, fridgeId: donation.fridgeId, name: donation.itemName, category: donation.category, quantity: donation.quantity, unit: donation.unit, expiresAt: donation.expiresAt, recognitionSource: "manual", recognitionConfirmed: true, status: "available", donationId });
  await d.insert(schema.inventoryEvents).values({ id: uid("ev"), fridgeId: donation.fridgeId, itemId, itemName: donation.itemName, type: "donation_received", quantityDelta: donation.quantity, actor: "donor", note: "Donation checked in and accepted by operator" });
  if (donation.missionId) {
    const [m] = await d.select().from(schema.missions).where(eq(schema.missions.id, donation.missionId));
    if (m) {
      const verified = Math.min(m.quantityNeeded, m.quantityVerified + donation.quantity);
      const completed = m.status === "open" && verified >= m.quantityNeeded;
      await d.update(schema.missions).set({ quantityVerified: verified, ...(completed ? { status: "completed", completedAt: at } : {}) }).where(eq(schema.missions.id, m.id));
      if (completed) {
        points += SCORING.missionCompletionBonus;
        await d.insert(schema.leaderboardEvents).values({ id: uid("lb"), userId: donation.donorUserId, donationId, points: SCORING.missionCompletionBonus, reason: `Completed mission: ${m.title}` });
        if (m.rewardSol && m.rewardSol > 0) {
          const accepted = await d.select({ donorUserId: schema.donations.donorUserId }).from(schema.donations).where(and(eq(schema.donations.missionId, m.id), eq(schema.donations.status, "accepted")));
          const donors = Array.from(new Set(accepted.map((a) => a.donorUserId)));
          const share = Number((m.rewardSol / donors.length).toFixed(4));
          for (const userId of donors) {
            await d.insert(schema.rewardAllocations).values({ id: uid("rw"), missionId: m.id, userId, organizationId: m.organizationId, amountSol: share, status: "eligible" }).onConflictDoNothing();
          }
        }
      }
    }
  }
  await d.update(schema.donations).set({ pointsAwarded: points }).where(eq(schema.donations.id, donationId));
  await d.insert(schema.leaderboardEvents).values({ id: uid("lb"), userId: donation.donorUserId, donationId, points: donation.quantity * SCORING.pointsPerAcceptedUnit, reason: `${donation.quantity} ${donation.unit} of ${donation.itemName} accepted` });
}

export async function getRewardAllocation(id: string) {
  const [row] = await db().select().from(schema.rewardAllocations).where(eq(schema.rewardAllocations.id, id));
  return row ?? null;
}

export async function recordRewardTransaction(allocationId: string, tx: { network: "devnet" | "simulated"; signature: string; toAddress: string; amountSol: number; status: "confirmed" | "failed"; explorerUrl?: string }) {
  const d = db();
  const id = uid("tx");
  await d.insert(schema.rewardTransactions).values({ id, allocationId, ...tx });
  await d.update(schema.rewardAllocations).set({ transactionId: id, ...(tx.status === "confirmed" ? { status: "paid" } : {}) }).where(eq(schema.rewardAllocations.id, allocationId));
}

export { uid as newId };
