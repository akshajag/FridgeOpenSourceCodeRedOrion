import type {
  Alert,
  CommunityEvent,
  ConnectionRequest,
  Donation,
  FoodCategory,
  Fridge,
  InventoryItem,
  Mission,
  RewardTransaction,
  SensorMetric,
  SharingPreferences,
} from "@/types";

/**
 * The action surface shared by the demo (local) provider and the live (API) provider.
 * Dashboards call these through `useFridgeyData()`; they never touch storage directly.
 */
export interface AddInventoryInput {
  fridgeId: string;
  name: string;
  category: FoodCategory;
  quantity: number;
  unit: string;
  expiresAt?: string;
  recognitionSource?: InventoryItem["recognitionSource"];
  recognitionConfidence?: number;
  donationId?: string;
}

export interface CreateMissionInput {
  organizationId: string;
  title: string;
  foodType: string;
  category: FoodCategory;
  quantityNeeded: number;
  unit: string;
  deadline: string;
  location: Mission["location"];
  rewardSol?: number;
  rewardCondition: string;
  eligibility: string[];
  status: "draft" | "open";
}

export interface ProposeDonationInput {
  donorUserId: string;
  fridgeId: string;
  missionId?: string;
  itemName: string;
  category: FoodCategory;
  quantity: number;
  unit: string;
  expiresAt?: string;
  note?: string;
}

export interface CreateEventInput {
  organizationId: string;
  name: string;
  description: string;
  startsAt: string;
  endsAt: string;
  fridgeIds: string[];
  donationGoal: number;
  eligibleItems: string[];
  leaderboardRule: CommunityEvent["leaderboardRule"];
  prizeWinners: number;
  prizeBudgetSol: number;
  status: "draft" | "published";
}

export interface FridgeyActions {
  // Inventory
  addInventoryItem(input: AddInventoryInput, actor?: "operator" | "camera" | "donor"): InventoryItem;
  updateInventoryItem(id: string, patch: Partial<Pick<InventoryItem, "name" | "category" | "quantity" | "unit" | "expiresAt" | "status">>): void;
  removeInventoryItem(id: string, note?: string): void;
  confirmRecognition(id: string, patch?: Partial<Pick<InventoryItem, "name" | "category" | "expiresAt" | "quantity">>): void;
  // Sensors & alerts
  recordSensorReading(fridgeId: string, metric: SensorMetric, value: number, source?: "hardware" | "demo"): { alert?: Alert };
  acknowledgeAlert(id: string): void;
  resolveAlert(id: string): void;
  updateFridge(id: string, patch: Partial<Pick<Fridge, "name" | "visibility" | "thresholds" | "hours" | "description" | "status">>): void;
  // Missions
  createMission(input: CreateMissionInput): Mission;
  updateMission(id: string, patch: Partial<CreateMissionInput>): void;
  setMissionStatus(id: string, status: Mission["status"]): void;
  joinMission(missionId: string, userId: string): void;
  leaveMission(missionId: string, userId: string): void;
  // Donations
  proposeDonation(input: ProposeDonationInput): Donation;
  markDonationDelivered(id: string): void;
  acceptDonation(id: string, verifiedByUserId: string): { donation: Donation; missionCompleted: boolean };
  rejectDonation(id: string, verifiedByUserId: string, reason: string): void;
  // Events
  createEvent(input: CreateEventInput): CommunityEvent;
  updateEvent(id: string, patch: Partial<CreateEventInput>): void;
  setEventStatus(id: string, status: CommunityEvent["status"]): void;
  deleteEvent(id: string): void;
  // Connections
  requestConnection(organizationId: string, fridgeId: string, message: string, sharing: SharingPreferences): ConnectionRequest;
  respondToConnection(id: string, decision: "approved" | "rejected", sharing?: SharingPreferences): void;
  updateSharing(id: string, sharing: SharingPreferences): void;
  // Rewards
  requestRewardVerification(allocationId: string): void;
  approveReward(allocationId: string): void;
  rejectReward(allocationId: string): void;
  recordRewardPayout(allocationId: string, tx: Omit<RewardTransaction, "id" | "allocationId">): void;
  setWalletAddress(userId: string, address?: string): void;
  // Demo-only
  resetDemo(): void;
}
