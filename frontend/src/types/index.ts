/**
 * Shared Nourish domain types.
 * These types are used by the demo data layer, the API routes, and the UI.
 * Keep them transport-agnostic: dates are ISO strings so they serialize cleanly.
 */

export type ISODate = string;

export type Role = "food_bank" | "operator" | "donor";

export interface Membership {
  role: Role;
  /** Food-bank administrators belong to an organization. */
  organizationId?: string;
  /** Operators are tied to a registered fridge. */
  fridgeId?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  initials: string;
  memberships: Membership[];
  walletAddress?: string;
  /** True for the three demo personas. Never true for a real Clerk account. */
  isDemo: boolean;
  createdAt: ISODate;
}

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface Organization {
  id: string;
  name: string;
  kind: "food_bank";
  description: string;
  city: string;
  location: GeoPoint;
  /** Reward budget available for missions and events (SOL on Devnet or simulated). */
  rewardBudgetSol: number;
  createdAt: ISODate;
}

export type FridgeStatus = "online" | "degraded" | "offline";

export interface FridgeCapabilities {
  temperature: boolean;
  humidity: boolean;
  airQuality: boolean;
  moisture?: boolean;
  movement?: boolean;
  frontCamera: boolean;
  interiorCamera: boolean;
  voiceAssistant: boolean;
}

export interface FridgeThresholds {
  tempMinC: number;
  tempMaxC: number;
  humidityMaxPct?: number;
  airQualityMaxPpm?: number;
  moistureMaxRaw?: number;
  movementMaxG?: number;
}

export interface Fridge {
  id: string;
  name: string;
  operatorUserId: string;
  visibility: "public" | "private";
  /** Approximate location. Precise address is only shared after owner approval. */
  location: GeoPoint;
  neighborhood: string;
  city: string;
  /** Full address, only exposed to organizations with an approved connection. */
  address: string;
  status: FridgeStatus;
  lastSeenAt: ISODate;
  capabilities: FridgeCapabilities;
  thresholds: FridgeThresholds;
  hours: string;
  description: string;
  hardwareVersion: string;
  createdAt: ISODate;
}

export type FoodCategory =
  | "dairy"
  | "produce"
  | "protein"
  | "bakery"
  | "prepared"
  | "beverages"
  | "pantry";

export type InventoryStatus =
  "available" | "needs_review" | "reserved" | "removed" | "expired";

export type RecognitionSource = "gemini" | "demo_recognition" | "manual";

export interface InventoryItem {
  id: string;
  fridgeId: string;
  name: string;
  category: FoodCategory;
  quantity: number;
  unit: string;
  addedAt: ISODate;
  /** Recorded expiration or best-by date when one was read or entered. */
  expiresAt?: ISODate;
  /** 0–1. Only present for camera-recognized items. */
  recognitionConfidence?: number;
  recognitionSource: RecognitionSource;
  /** True once an operator has confirmed the recognition. */
  recognitionConfirmed: boolean;
  status: InventoryStatus;
  donationId?: string;
  updatedAt: ISODate;
}

export type InventoryEventType =
  | "added"
  | "removed"
  | "edited"
  | "confirmed"
  | "expired"
  | "unconfirmed_removal"
  | "donation_received";

export interface InventoryEvent {
  id: string;
  fridgeId: string;
  itemId?: string;
  itemName: string;
  type: InventoryEventType;
  quantityDelta: number;
  actor: "operator" | "camera" | "donor" | "system";
  note?: string;
  at: ISODate;
}

export type SensorMetric =
  "temperature" | "humidity" | "air_quality" | "moisture" | "movement";

export interface SensorReading {
  id: string;
  fridgeId: string;
  metric: SensorMetric;
  value: number;
  unit: "°C" | "%" | "ppm" | "raw" | "g";
  source: "hardware" | "demo";
  at: ISODate;
}

export type AlertType =
  | "temperature_excursion"
  | "sensor_offline"
  | "expiring_soon"
  | "unconfirmed_removal"
  | "air_quality"
  | "humidity"
  | "contact_moisture"
  | "movement";

export type AlertSeverity = "info" | "warning" | "critical";

export interface Alert {
  id: string;
  fridgeId: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  detail: string;
  createdAt: ISODate;
  acknowledgedAt?: ISODate;
  resolvedAt?: ISODate;
}

export type MissionStatus = "draft" | "open" | "completed" | "closed";

export interface Mission {
  id: string;
  organizationId: string;
  title: string;
  foodType: string;
  category: FoodCategory;
  quantityNeeded: number;
  /** Only verified (accepted) donations count toward progress. */
  quantityVerified: number;
  unit: string;
  deadline: ISODate;
  location: {
    mode: "dropoff" | "pickup";
    fridgeId?: string;
    label: string;
  };
  rewardSol?: number;
  rewardCondition: string;
  eligibility: string[];
  status: MissionStatus;
  participantUserIds: string[];
  createdAt: ISODate;
  completedAt?: ISODate;
}

export type DonationStatus = "proposed" | "delivered" | "accepted" | "rejected";

export interface Donation {
  id: string;
  missionId?: string;
  donorUserId: string;
  fridgeId: string;
  itemName: string;
  category: FoodCategory;
  quantity: number;
  unit: string;
  expiresAt?: ISODate;
  note?: string;
  status: DonationStatus;
  proposedAt: ISODate;
  deliveredAt?: ISODate;
  verifiedAt?: ISODate;
  verifiedByUserId?: string;
  rejectionReason?: string;
  pointsAwarded: number;
}

export type EventStatus = "draft" | "published" | "closed";

export interface CommunityEvent {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  startsAt: ISODate;
  endsAt: ISODate;
  fridgeIds: string[];
  donationGoal: number;
  eligibleItems: string[];
  leaderboardRule: "verified_points" | "verified_quantity";
  prizeWinners: number;
  prizeBudgetSol: number;
  status: EventStatus;
  createdAt: ISODate;
}

export interface SharingPreferences {
  inventory: boolean;
  sensors: boolean;
  alerts: boolean;
  preciseLocation: boolean;
}

export type ConnectionStatus = "pending" | "approved" | "rejected";

export interface ConnectionRequest {
  id: string;
  organizationId: string;
  fridgeId: string;
  status: ConnectionStatus;
  message: string;
  sharing: SharingPreferences;
  requestedAt: ISODate;
  respondedAt?: ISODate;
}

export interface LeaderboardEvent {
  id: string;
  userId: string;
  donationId: string;
  points: number;
  reason: string;
  at: ISODate;
}

export type RewardStatus =
  "eligible" | "pending_verification" | "approved" | "paid" | "rejected";

export interface RewardAllocation {
  id: string;
  missionId: string;
  userId: string;
  organizationId: string;
  amountSol: number;
  status: RewardStatus;
  createdAt: ISODate;
  approvedAt?: ISODate;
  transactionId?: string;
}

export interface RewardTransaction {
  id: string;
  allocationId: string;
  /** "devnet" for real Devnet transfers, "simulated" when no RPC/payer is configured. */
  network: "devnet" | "simulated";
  signature: string;
  toAddress: string;
  amountSol: number;
  status: "pending" | "confirmed" | "failed";
  explorerUrl?: string;
  at: ISODate;
}

export interface FridgeyDataset {
  hardwareRisk?: {
    version: string;
    evaluated_at: string;
    overall_score: number | null;
    highest_observed_score: number | null;
    coverage_percent: number;
    temperature_slope_c_per_minute: number | null;
    channels: {
      key: string;
      label: string;
      score: number | null;
      level: string;
      value: number | null;
      threshold: number;
      unit: string;
      state: string;
      reference: number;
      duration_seconds: number;
      recommendation: string;
    }[];
    definition: string;
    dew_point: { available: boolean; reason: string };
  };
  hardwareEvaluatedAt?: string;
  hardwareSampleAgeSeconds?: number | null;
  hardwareConditions?: {
    confidence: number;
    moisture: number | null;
    movement: number | null;
    moistureThreshold: number;
    movementThreshold: number;
  };
  users: User[];
  organizations: Organization[];
  fridges: Fridge[];
  inventory: InventoryItem[];
  inventoryEvents: InventoryEvent[];
  sensorReadings: SensorReading[];
  alerts: Alert[];
  missions: Mission[];
  donations: Donation[];
  events: CommunityEvent[];
  connections: ConnectionRequest[];
  leaderboard: LeaderboardEvent[];
  rewards: RewardAllocation[];
  rewardTransactions: RewardTransaction[];
}

export const FOOD_CATEGORIES: { value: FoodCategory; label: string }[] = [
  { value: "dairy", label: "Dairy" },
  { value: "produce", label: "Produce" },
  { value: "protein", label: "Protein" },
  { value: "bakery", label: "Bakery" },
  { value: "prepared", label: "Prepared meals" },
  { value: "beverages", label: "Beverages" },
  { value: "pantry", label: "Pantry" },
];

export const ROLE_LABELS: Record<Role, string> = {
  food_bank: "Food bank",
  operator: "Fridge operator",
  donor: "Donor",
};

/** Transparent scoring rules, shown in the leaderboard UI. */
export const SCORING = {
  pointsPerAcceptedUnit: 0,
  missionCompletionBonus: 0,
} as const;
