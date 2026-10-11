"use client";

/**
 * DEMO STORE — the local, persistent demonstration dataset.
 * Every write here is synthetic. Nothing in this store represents verified real-world
 * inventory, transactions, or safety assessments. Live mode uses the API provider instead.
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  Alert,
  CommunityEvent,
  ConnectionRequest,
  Donation,
  FridgeyDataset,
  InventoryItem,
  Mission,
  RewardAllocation,
  RewardTransaction,
  SensorMetric,
} from "@/types";
import { SCORING } from "@/types";
import { createSeed } from "./seed";
import type { FridgeyActions } from "@/lib/data/actions";
import type { DemoPersona } from "@/lib/auth/config";

const SEED_VERSION = 3;

export interface DemoState {
  seedVersion: number;
  seededAt: string;
  persona: DemoPersona;
  data: FridgeyDataset;
  hydrated: boolean;
}

type DemoStore = DemoState & { actions: FridgeyActions & { setPersona(p: DemoPersona): void; setHydrated(): void } };

const nowIso = () => new Date().toISOString();
const uid = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;

function unitFor(metric: SensorMetric): "°C" | "%" | "ppm" {
  return metric === "temperature" ? "°C" : metric === "humidity" ? "%" : "ppm";
}

export const useDemoStore = create<DemoStore>()(
  persist(
    (set) => {
      const update = (fn: (d: FridgeyDataset) => FridgeyDataset | void) =>
        set((state) => {
          const draft = structuredClone(state.data);
          const result = fn(draft);
          return { data: result ?? draft };
        });

      const actions: DemoStore["actions"] = {
        setPersona: (persona) => set({ persona }),
        setHydrated: () => set({ hydrated: true }),
        resetDemo: () => set({ data: createSeed(), seededAt: nowIso(), seedVersion: SEED_VERSION }),

        // ---------- Inventory ----------
        addInventoryItem: (input, actor = "operator") => {
          const item: InventoryItem = {
            id: uid("item"),
            fridgeId: input.fridgeId,
            name: input.name.trim(),
            category: input.category,
            quantity: input.quantity,
            unit: input.unit,
            addedAt: nowIso(),
            expiresAt: input.expiresAt,
            recognitionSource: input.recognitionSource ?? "manual",
            recognitionConfidence: input.recognitionConfidence,
            recognitionConfirmed: (input.recognitionSource ?? "manual") === "manual",
            status: (input.recognitionSource ?? "manual") === "manual" ? "available" : "needs_review",
            donationId: input.donationId,
            updatedAt: nowIso(),
          };
          update((d) => {
            d.inventory.unshift(item);
            d.inventoryEvents.unshift({
              id: uid("ev"),
              fridgeId: item.fridgeId,
              itemId: item.id,
              itemName: item.name,
              type: input.donationId ? "donation_received" : "added",
              quantityDelta: item.quantity,
              actor,
              at: item.addedAt,
            });
          });
          return item;
        },
        updateInventoryItem: (id, patch) =>
          update((d) => {
            const item = d.inventory.find((i) => i.id === id);
            if (!item) return;
            const before = item.quantity;
            Object.assign(item, patch, { updatedAt: nowIso() });
            d.inventoryEvents.unshift({
              id: uid("ev"),
              fridgeId: item.fridgeId,
              itemId: id,
              itemName: item.name,
              type: "edited",
              quantityDelta: (patch.quantity ?? before) - before,
              actor: "operator",
              at: nowIso(),
            });
          }),
        removeInventoryItem: (id, note) =>
          update((d) => {
            const item = d.inventory.find((i) => i.id === id);
            if (!item) return;
            item.status = "removed";
            item.updatedAt = nowIso();
            d.inventoryEvents.unshift({
              id: uid("ev"),
              fridgeId: item.fridgeId,
              itemId: id,
              itemName: item.name,
              type: "removed",
              quantityDelta: -item.quantity,
              actor: "operator",
              note,
              at: nowIso(),
            });
          }),
        confirmRecognition: (id, patch) =>
          update((d) => {
            const item = d.inventory.find((i) => i.id === id);
            if (!item) return;
            Object.assign(item, patch ?? {}, { recognitionConfirmed: true, status: "available", updatedAt: nowIso() });
            d.inventoryEvents.unshift({
              id: uid("ev"),
              fridgeId: item.fridgeId,
              itemId: id,
              itemName: item.name,
              type: "confirmed",
              quantityDelta: 0,
              actor: "operator",
              note: "Recognition confirmed by operator",
              at: nowIso(),
            });
          }),

        // ---------- Sensors ----------
        recordSensorReading: (fridgeId, metric, value, source = "demo") => {
          let alert: Alert | undefined;
          update((d) => {
            const fridge = d.fridges.find((f) => f.id === fridgeId);
            if (!fridge) return;
            const at = nowIso();
            d.sensorReadings.push({ id: uid("rd"), fridgeId, metric, value, unit: unitFor(metric), source, at });
            fridge.lastSeenAt = at;
            if (fridge.status === "offline") fridge.status = "online";
            const th = fridge.thresholds;
            const open = (type: Alert["type"]) => d.alerts.find((a) => a.fridgeId === fridgeId && a.type === type && !a.resolvedAt);
            if (metric === "temperature" && (value > th.tempMaxC || value < th.tempMinC) && !open("temperature_excursion")) {
              alert = {
                id: uid("alert"),
                fridgeId,
                type: "temperature_excursion",
                severity: value > th.tempMaxC + 3 || value < th.tempMinC - 2 ? "critical" : "warning",
                title: `Temperature at ${value.toFixed(1)} °C`,
                detail: `Reading is outside the ${th.tempMinC}–${th.tempMaxC} °C range configured for this fridge. Check the door seal and compressor.`,
                createdAt: at,
              };
            } else if (metric === "humidity" && th.humidityMaxPct && value > th.humidityMaxPct && !open("humidity")) {
              alert = { id: uid("alert"), fridgeId, type: "humidity", severity: "warning", title: `Humidity at ${value.toFixed(0)} %`, detail: `Above the ${th.humidityMaxPct} % limit. Condensation can shorten produce shelf life.`, createdAt: at };
            } else if (metric === "air_quality" && th.airQualityMaxPpm && value > th.airQualityMaxPpm && !open("air_quality")) {
              alert = { id: uid("alert"), fridgeId, type: "air_quality", severity: value > th.airQualityMaxPpm * 1.5 ? "critical" : "warning", title: `Air quality at ${Math.round(value)} ppm`, detail: `CO₂-equivalent above ${th.airQualityMaxPpm} ppm. Often caused by spoiling produce; inspect the shelves. This reading does not certify food safety.`, createdAt: at };
            }
            if (alert) d.alerts.unshift(alert);
          });
          return { alert };
        },
        acknowledgeAlert: (id) => update((d) => { const a = d.alerts.find((x) => x.id === id); if (a) a.acknowledgedAt = nowIso(); }),
        resolveAlert: (id) => update((d) => { const a = d.alerts.find((x) => x.id === id); if (a) { a.resolvedAt = nowIso(); a.acknowledgedAt ??= a.resolvedAt; } }),
        updateFridge: (id, patch) => update((d) => { const f = d.fridges.find((x) => x.id === id); if (f) Object.assign(f, patch); }),

        // ---------- Missions ----------
        createMission: (input) => {
          const mission: Mission = {
            id: uid("mission"),
            ...input,
            quantityVerified: 0,
            participantUserIds: [],
            createdAt: nowIso(),
          };
          update((d) => { d.missions.unshift(mission); });
          return mission;
        },
        updateMission: (id, patch) => update((d) => { const m = d.missions.find((x) => x.id === id); if (m) Object.assign(m, patch); }),
        setMissionStatus: (id, status) => update((d) => { const m = d.missions.find((x) => x.id === id); if (m) { m.status = status; if (status === "completed") m.completedAt = nowIso(); } }),
        joinMission: (missionId, userId) => update((d) => { const m = d.missions.find((x) => x.id === missionId); if (m && !m.participantUserIds.includes(userId)) m.participantUserIds.push(userId); }),
        leaveMission: (missionId, userId) => update((d) => { const m = d.missions.find((x) => x.id === missionId); if (m) m.participantUserIds = m.participantUserIds.filter((u) => u !== userId); }),

        // ---------- Donations ----------
        proposeDonation: (input) => {
          const donation: Donation = {
            id: uid("don"),
            ...input,
            status: "proposed",
            proposedAt: nowIso(),
            pointsAwarded: 0,
          };
          update((d) => {
            d.donations.unshift(donation);
            if (input.missionId) {
              const m = d.missions.find((x) => x.id === input.missionId);
              if (m && !m.participantUserIds.includes(input.donorUserId)) m.participantUserIds.push(input.donorUserId);
            }
          });
          return donation;
        },
        markDonationDelivered: (id) => update((d) => { const x = d.donations.find((y) => y.id === id); if (x && x.status === "proposed") { x.status = "delivered"; x.deliveredAt = nowIso(); } }),
        acceptDonation: (id, verifiedByUserId) => {
          let result: { donation: Donation; missionCompleted: boolean } | null = null;
          update((d) => {
            const donation = d.donations.find((x) => x.id === id);
            if (!donation || donation.status === "accepted") return;
            const at = nowIso();
            donation.status = "accepted";
            donation.verifiedAt = at;
            donation.verifiedByUserId = verifiedByUserId;
            donation.deliveredAt ??= at;
            let points = donation.quantity * SCORING.pointsPerAcceptedUnit;
            let missionCompleted = false;

            // Add the accepted food to the fridge inventory.
            const item: InventoryItem = {
              id: uid("item"),
              fridgeId: donation.fridgeId,
              name: donation.itemName,
              category: donation.category,
              quantity: donation.quantity,
              unit: donation.unit,
              addedAt: at,
              expiresAt: donation.expiresAt,
              recognitionSource: "manual",
              recognitionConfirmed: true,
              status: "available",
              donationId: donation.id,
              updatedAt: at,
            };
            d.inventory.unshift(item);
            d.inventoryEvents.unshift({ id: uid("ev"), fridgeId: donation.fridgeId, itemId: item.id, itemName: item.name, type: "donation_received", quantityDelta: item.quantity, actor: "donor", note: "Donation checked in and accepted by operator", at });

            // Mission progress counts only verified donations.
            if (donation.missionId) {
              const m = d.missions.find((x) => x.id === donation.missionId);
              if (m) {
                m.quantityVerified = Math.min(m.quantityNeeded, m.quantityVerified + donation.quantity);
                if (m.status === "open" && m.quantityVerified >= m.quantityNeeded) {
                  m.status = "completed";
                  m.completedAt = at;
                  missionCompleted = true;
                  points += SCORING.missionCompletionBonus;
                  d.leaderboard.unshift({ id: uid("lb"), userId: donation.donorUserId, donationId: donation.id, points: SCORING.missionCompletionBonus, reason: `Completed mission: ${m.title}`, at });
                  // Reward eligibility for every donor with accepted donations on this mission.
                  if (m.rewardSol && m.rewardSol > 0) {
                    const donors = Array.from(new Set(d.donations.filter((x) => x.missionId === m.id && x.status === "accepted").map((x) => x.donorUserId)));
                    const share = Number((m.rewardSol / donors.length).toFixed(4));
                    for (const userId of donors) {
                      if (!d.rewards.some((r) => r.missionId === m.id && r.userId === userId)) {
                        d.rewards.unshift({ id: uid("rw"), missionId: m.id, userId, organizationId: m.organizationId, amountSol: share, status: "eligible", createdAt: at });
                      }
                    }
                  }
                }
              }
            }
            donation.pointsAwarded = points;
            d.leaderboard.unshift({ id: uid("lb"), userId: donation.donorUserId, donationId: donation.id, points: donation.quantity * SCORING.pointsPerAcceptedUnit, reason: `${donation.quantity} ${donation.unit} of ${donation.itemName} accepted`, at });
            result = { donation: structuredClone(donation), missionCompleted };
          });
          if (!result) throw new Error("Donation not found or already accepted");
          return result;
        },
        rejectDonation: (id, verifiedByUserId, reason) =>
          update((d) => {
            const x = d.donations.find((y) => y.id === id);
            if (!x) return;
            x.status = "rejected";
            x.verifiedAt = nowIso();
            x.verifiedByUserId = verifiedByUserId;
            x.rejectionReason = reason;
          }),

        // ---------- Events ----------
        createEvent: (input) => {
          const event: CommunityEvent = { id: uid("event"), ...input, createdAt: nowIso() };
          update((d) => { d.events.unshift(event); });
          return event;
        },
        updateEvent: (id, patch) => update((d) => { const e = d.events.find((x) => x.id === id); if (e) Object.assign(e, patch); }),
        setEventStatus: (id, status) => update((d) => { const e = d.events.find((x) => x.id === id); if (e) e.status = status; }),
        deleteEvent: (id) => update((d) => { d.events = d.events.filter((x) => x.id !== id); }),

        // ---------- Connections ----------
        requestConnection: (organizationId, fridgeId, message, sharing) => {
          const req: ConnectionRequest = { id: uid("conn"), organizationId, fridgeId, status: "pending", message, sharing, requestedAt: nowIso() };
          update((d) => { d.connections.unshift(req); });
          return req;
        },
        respondToConnection: (id, decision, sharing) =>
          update((d) => {
            const c = d.connections.find((x) => x.id === id);
            if (!c) return;
            c.status = decision;
            c.respondedAt = nowIso();
            if (sharing) c.sharing = sharing;
          }),
        updateSharing: (id, sharing) => update((d) => { const c = d.connections.find((x) => x.id === id); if (c) c.sharing = sharing; }),

        // ---------- Rewards ----------
        requestRewardVerification: (allocationId) => update((d) => { const r = d.rewards.find((x) => x.id === allocationId); if (r && r.status === "eligible") r.status = "pending_verification"; }),
        approveReward: (allocationId) => update((d) => { const r = d.rewards.find((x) => x.id === allocationId); if (r && (r.status === "pending_verification" || r.status === "eligible")) { r.status = "approved"; r.approvedAt = nowIso(); } }),
        rejectReward: (allocationId) => update((d) => { const r = d.rewards.find((x) => x.id === allocationId); if (r) r.status = "rejected"; }),
        recordRewardPayout: (allocationId, tx) =>
          update((d) => {
            const r = d.rewards.find((x) => x.id === allocationId);
            if (!r || r.status !== "approved") return;
            const record: RewardTransaction = { id: uid("tx"), allocationId, ...tx };
            d.rewardTransactions.unshift(record);
            r.transactionId = record.id;
            if (tx.status === "confirmed") r.status = "paid";
          }),
        setWalletAddress: (userId, address) => update((d) => { const u = d.users.find((x) => x.id === userId); if (u) u.walletAddress = address; }),
      };

      return {
        seedVersion: SEED_VERSION,
        seededAt: nowIso(),
        persona: "food_bank",
        data: createSeed(),
        hydrated: false,
        actions,
      };
    },
    {
      name: "fridgey-demo-v1",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ seedVersion: s.seedVersion, seededAt: s.seededAt, persona: s.persona, data: s.data }),
      merge: (persisted, current) => {
        const p = persisted as Partial<DemoState> | undefined;
        if (!p || p.seedVersion !== SEED_VERSION || !p.data) return { ...current, hydrated: true };
        return { ...current, ...p, hydrated: true };
      },
      onRehydrateStorage: () => (state) => state?.actions.setHydrated(),
    },
  ),
);

/** Type guard helpers used by the UI to label reward allocations. */
export function isRewardTerminal(r: RewardAllocation) {
  return r.status === "paid" || r.status === "rejected";
}
