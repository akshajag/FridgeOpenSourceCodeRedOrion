"use client";

/**
 * Live-mode data client. Talks to the Next.js route handlers under /api, which enforce
 * authorization server-side and persist to TigerData/PostgreSQL when DATABASE_URL is configured.
 */
import type { FridgeyDataset } from "@/types";
import type { FridgeyActions } from "./actions";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchDataset(): Promise<FridgeyDataset> {
  return request<FridgeyDataset>("/api/dataset");
}

const post = (path: string, body: unknown) => request(path, { method: "POST", body: JSON.stringify(body) });

/**
 * In live mode every action is a POST to a route handler. Each returns a promise even though
 * the shared interface is synchronous-looking; dashboards treat results optimistically and the
 * dataset query is invalidated afterwards.
 */
export function createRemoteActions(invalidate: () => Promise<unknown>): FridgeyActions {
  const fire = (path: string, body: unknown) => {
    if (process.env.NEXT_PUBLIC_FRIDGE_HARDWARE_MODE === "1") throw new Error("Use the fridge kiosk to record verified donations. Hardware alerts clear when sensor conditions recover.");
    void post(path, body).then(invalidate).catch(error => console.error("Dashboard update failed", error));
  };
  const notLive = (name: string) => {
    throw new Error(`${name} requires a live backend. Configure DATABASE_URL and Clerk, or use demo mode.`);
  };
  return {
    addInventoryItem: (input, actor) => {
      fire("/api/inventory", { action: "add", input, actor });
      return { ...input, id: "pending", addedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), recognitionSource: input.recognitionSource ?? "manual", recognitionConfirmed: true, status: "available" };
    },
    updateInventoryItem: (id, patch) => fire("/api/inventory", { action: "update", id, patch }),
    removeInventoryItem: (id, note) => fire("/api/inventory", { action: "remove", id, note }),
    confirmRecognition: (id, patch) => fire("/api/inventory", { action: "confirm", id, patch }),
    recordSensorReading: (fridgeId, metric, value, source) => {
      fire("/api/sensors", { fridgeId, metric, value, source });
      return {};
    },
    acknowledgeAlert: (id) => fire("/api/alerts", { action: "acknowledge", id }),
    resolveAlert: (id) => fire("/api/alerts", { action: "resolve", id }),
    updateFridge: (id, patch) => fire("/api/fridges", { action: "update", id, patch }),
    createMission: (input) => {
      fire("/api/missions", { action: "create", input });
      return { ...input, id: "pending", quantityVerified: 0, participantUserIds: [], createdAt: new Date().toISOString() };
    },
    updateMission: (id, patch) => fire("/api/missions", { action: "update", id, patch }),
    setMissionStatus: (id, status) => fire("/api/missions", { action: "status", id, status }),
    joinMission: (missionId, userId) => fire("/api/missions", { action: "join", missionId, userId }),
    leaveMission: (missionId, userId) => fire("/api/missions", { action: "leave", missionId, userId }),
    proposeDonation: (input) => {
      fire("/api/donations", { action: "propose", input });
      return { ...input, id: "pending", status: "proposed", proposedAt: new Date().toISOString(), pointsAwarded: 0 };
    },
    markDonationDelivered: (id) => fire("/api/donations", { action: "delivered", id }),
    acceptDonation: (id) => {
      // Server verifies operator ownership, writes inventory, mission progress, points, and rewards atomically.
      fire("/api/donations", { action: "accept", id });
      return { donation: { id, status: "accepted", donorUserId: "", fridgeId: "", itemName: "", category: "pantry", quantity: 0, unit: "", proposedAt: new Date().toISOString(), pointsAwarded: 0 }, missionCompleted: false };
    },
    rejectDonation: (id, verifiedByUserId, reason) => fire("/api/donations", { action: "reject", id, reason }),
    createEvent: (input) => {
      fire("/api/events", { action: "create", input });
      return { ...input, id: "pending", createdAt: new Date().toISOString() };
    },
    updateEvent: (id, patch) => fire("/api/events", { action: "update", id, patch }),
    setEventStatus: (id, status) => fire("/api/events", { action: "status", id, status }),
    deleteEvent: (id) => fire("/api/events", { action: "delete", id }),
    requestConnection: (organizationId, fridgeId, message, sharing) => {
      fire("/api/connections", { action: "request", organizationId, fridgeId, message, sharing });
      return { id: "pending", organizationId, fridgeId, status: "pending", message, sharing, requestedAt: new Date().toISOString() };
    },
    respondToConnection: (id, decision, sharing) => fire("/api/connections", { action: "respond", id, decision, sharing }),
    updateSharing: (id, sharing) => fire("/api/connections", { action: "sharing", id, sharing }),
    requestRewardVerification: (id) => fire("/api/rewards", { action: "request", id }),
    approveReward: (id) => fire("/api/rewards", { action: "approve", id }),
    rejectReward: (id) => fire("/api/rewards", { action: "reject", id }),
    recordRewardPayout: (id) => fire("/api/rewards", { action: "payout", id }),
    setWalletAddress: (userId, address) => fire("/api/users", { action: "wallet", userId, address }),
    resetDemo: () => notLive("resetDemo"),
  };
}
