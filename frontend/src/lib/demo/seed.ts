/**
 * DEMO DATA — synthetic, internally consistent seed for Fridgey's demonstration mode.
 * Every record here is fabricated for the hackathon demo. Dates are generated relative
 * to the moment the seed is created so the dataset always looks current.
 */
import type {
  Alert,
  CommunityEvent,
  ConnectionRequest,
  Donation,
  Fridge,
  FridgeyDataset,
  InventoryEvent,
  InventoryItem,
  LeaderboardEvent,
  Mission,
  Organization,
  RewardAllocation,
  RewardTransaction,
  SensorReading,
  User,
} from "@/types";

export const DEMO_IDS = {
  foodBankUser: "user_demo_foodbank",
  operatorUser: "user_demo_operator",
  donorUser: "user_demo_donor",
  organization: "org_third_ward_pantry",
  operatorFridge: "fridge_montrose",
} as const;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Small deterministic PRNG so the seed is stable between reloads. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const iso = (ms: number) => new Date(ms).toISOString();

export function createSeed(now = new Date()): FridgeyDataset {
  const t = now.getTime();
  const ago = (ms: number) => iso(t - ms);
  const ahead = (ms: number) => iso(t + ms);
  const rand = mulberry32(42);

  const users: User[] = [
    {
      id: DEMO_IDS.foodBankUser,
      name: "Maya Okafor",
      email: "maya@thirdwardpantry.demo",
      initials: "MO",
      memberships: [{ role: "food_bank", organizationId: DEMO_IDS.organization }],
      isDemo: true,
      createdAt: ago(120 * DAY),
    },
    {
      id: DEMO_IDS.operatorUser,
      name: "Daniel Reyes",
      email: "daniel@montrosefridge.demo",
      initials: "DR",
      memberships: [{ role: "operator", fridgeId: DEMO_IDS.operatorFridge }],
      isDemo: true,
      createdAt: ago(90 * DAY),
    },
    {
      id: DEMO_IDS.donorUser,
      name: "Priya Natarajan",
      email: "priya@donor.demo",
      initials: "PN",
      memberships: [{ role: "donor" }],
      walletAddress: undefined,
      isDemo: true,
      createdAt: ago(60 * DAY),
    },
    // Additional community members so leaderboards and activity feel real.
    { id: "user_jalen", name: "Jalen Brooks", email: "jalen@donor.demo", initials: "JB", memberships: [{ role: "donor" }], isDemo: true, createdAt: ago(200 * DAY) },
    { id: "user_sofia", name: "Sofia Mendes", email: "sofia@donor.demo", initials: "SM", memberships: [{ role: "donor" }], isDemo: true, createdAt: ago(150 * DAY) },
    { id: "user_tomas", name: "Tomás Herrera", email: "tomas@donor.demo", initials: "TH", memberships: [{ role: "donor" }], isDemo: true, createdAt: ago(80 * DAY) },
    { id: "user_aisha", name: "Aisha Rahman", email: "aisha@donor.demo", initials: "AR", memberships: [{ role: "donor" }], isDemo: true, createdAt: ago(40 * DAY) },
    { id: "user_op_heights", name: "Lena Park", email: "lena@heightsfridge.demo", initials: "LP", memberships: [{ role: "operator", fridgeId: "fridge_heights" }], isDemo: true, createdAt: ago(100 * DAY) },
    { id: "user_op_eastend", name: "Marcus Hill", email: "marcus@eastend.demo", initials: "MH", memberships: [{ role: "operator", fridgeId: "fridge_east_end" }], isDemo: true, createdAt: ago(110 * DAY) },
    { id: "user_op_thirdward", name: "Grace Nwosu", email: "grace@thirdward.demo", initials: "GN", memberships: [{ role: "operator", fridgeId: "fridge_third_ward" }], isDemo: true, createdAt: ago(130 * DAY) },
    { id: "user_op_midtown", name: "Owen Castillo", email: "owen@midtown.demo", initials: "OC", memberships: [{ role: "operator", fridgeId: "fridge_midtown" }], isDemo: true, createdAt: ago(70 * DAY) },
    { id: "user_op_sunnyside", name: "Ruth Adeyemi", email: "ruth@sunnyside.demo", initials: "RA", memberships: [{ role: "operator", fridgeId: "fridge_sunnyside" }], isDemo: true, createdAt: ago(50 * DAY) },
  ];

  const organizations: Organization[] = [
    {
      id: DEMO_IDS.organization,
      name: "Third Ward Community Pantry",
      kind: "food_bank",
      description:
        "Neighborhood food bank serving Third Ward and the University of Houston corridor. Coordinates six community fridges across central Houston.",
      city: "Houston, TX",
      location: { lat: 29.7218, lng: -95.3402 },
      rewardBudgetSol: 12.5,
      createdAt: ago(400 * DAY),
    },
    {
      id: "org_bayou_harvest",
      name: "Bayou Harvest Collective",
      kind: "food_bank",
      description: "Regional surplus-rescue network focused on produce recovery from East End markets.",
      city: "Houston, TX",
      location: { lat: 29.7465, lng: -95.3345 },
      rewardBudgetSol: 4,
      createdAt: ago(300 * DAY),
    },
  ];

  const fullCaps = { temperature: true, humidity: true, airQuality: true, frontCamera: true, interiorCamera: true, voiceAssistant: true };
  const baseThresholds = { tempMinC: 1, tempMaxC: 5, humidityMaxPct: 65, airQualityMaxPpm: 1000 };

  const fridges: Fridge[] = [
    {
      id: DEMO_IDS.operatorFridge,
      name: "Montrose Corner Fridge",
      operatorUserId: DEMO_IDS.operatorUser,
      visibility: "public",
      location: { lat: 29.7426, lng: -95.3906 },
      neighborhood: "Montrose",
      city: "Houston, TX",
      address: "1413 Westheimer Rd, Houston, TX 77006",
      status: "online",
      lastSeenAt: ago(2 * 60_000),
      capabilities: fullCaps,
      thresholds: baseThresholds,
      hours: "Open 24/7 · covered porch",
      description: "Hosted outside a neighborhood café. Full Fridgey hardware kit with both cameras and the voice assistant.",
      hardwareVersion: "Fridgey Kit v0.4 (dual camera, env sensor board)",
      createdAt: ago(90 * DAY),
    },
    {
      id: "fridge_third_ward",
      name: "Emancipation Park Fridge",
      operatorUserId: "user_op_thirdward",
      visibility: "public",
      location: { lat: 29.7342, lng: -95.3612 },
      neighborhood: "Third Ward",
      city: "Houston, TX",
      address: "3018 Emancipation Ave, Houston, TX 77004",
      status: "online",
      lastSeenAt: ago(6 * 60_000),
      capabilities: { ...fullCaps, humidity: false },
      thresholds: { tempMinC: 1, tempMaxC: 5, airQualityMaxPpm: 1000 },
      hours: "6am–10pm",
      description: "Run by the park's community garden volunteers. No humidity sensor installed yet.",
      hardwareVersion: "Fridgey Kit v0.3 (dual camera, temp + air quality)",
      createdAt: ago(130 * DAY),
    },
    {
      id: "fridge_east_end",
      name: "Navigation Esplanade Fridge",
      operatorUserId: "user_op_eastend",
      visibility: "public",
      location: { lat: 29.7471, lng: -95.3358 },
      neighborhood: "East End",
      city: "Houston, TX",
      address: "2800 Navigation Blvd, Houston, TX 77003",
      status: "degraded",
      lastSeenAt: ago(48 * 60_000),
      capabilities: fullCaps,
      thresholds: baseThresholds,
      hours: "Open 24/7",
      description: "Sits next to the farmers market. Interior camera reconnects intermittently since last week.",
      hardwareVersion: "Fridgey Kit v0.4 (dual camera, env sensor board)",
      createdAt: ago(110 * DAY),
    },
    {
      id: "fridge_heights",
      name: "Heights Library Fridge",
      operatorUserId: "user_op_heights",
      visibility: "public",
      location: { lat: 29.7921, lng: -95.3983 },
      neighborhood: "The Heights",
      city: "Houston, TX",
      address: "1302 Heights Blvd, Houston, TX 77008",
      status: "online",
      lastSeenAt: ago(60_000),
      capabilities: { ...fullCaps, voiceAssistant: false },
      thresholds: baseThresholds,
      hours: "Library hours · 9am–8pm",
      description: "Indoor unit inside the branch lobby. Speaker not installed to keep the library quiet.",
      hardwareVersion: "Fridgey Kit v0.4 (dual camera, env sensor board, no speaker)",
      createdAt: ago(100 * DAY),
    },
    {
      id: "fridge_midtown",
      name: "Midtown Transit Fridge",
      operatorUserId: "user_op_midtown",
      visibility: "private",
      location: { lat: 29.7392, lng: -95.3764 },
      neighborhood: "Midtown",
      city: "Houston, TX",
      address: "2900 Main St, Houston, TX 77002",
      status: "offline",
      lastSeenAt: ago(19 * HOUR),
      capabilities: { ...fullCaps, airQuality: false, humidity: false },
      thresholds: { tempMinC: 1, tempMaxC: 5 },
      hours: "5am–midnight",
      description: "Private location. Board lost Wi-Fi after a power cut last night; operator notified.",
      hardwareVersion: "Fridgey Kit v0.2 (single camera, temp only)",
      createdAt: ago(70 * DAY),
    },
    {
      id: "fridge_sunnyside",
      name: "Sunnyside Community Center Fridge",
      operatorUserId: "user_op_sunnyside",
      visibility: "public",
      location: { lat: 29.6712, lng: -95.3551 },
      neighborhood: "Sunnyside",
      city: "Houston, TX",
      address: "3502 Bellfort St, Houston, TX 77051",
      status: "online",
      lastSeenAt: ago(4 * 60_000),
      capabilities: fullCaps,
      thresholds: baseThresholds,
      hours: "7am–9pm",
      description: "Newest unit in the network. Not yet connected to a food bank.",
      hardwareVersion: "Fridgey Kit v0.4 (dual camera, env sensor board)",
      createdAt: ago(50 * DAY),
    },
  ];

  // ---------- Inventory ----------
  const inventory: InventoryItem[] = [];
  const inventoryEvents: InventoryEvent[] = [];
  let itemSeq = 0;
  const addItem = (
    fridgeId: string,
    name: string,
    category: InventoryItem["category"],
    quantity: number,
    unit: string,
    addedAgoMs: number,
    expiresInMs: number | undefined,
    opts: Partial<InventoryItem> = {},
  ) => {
    const id = `item_${String(++itemSeq).padStart(3, "0")}`;
    const item: InventoryItem = {
      id,
      fridgeId,
      name,
      category,
      quantity,
      unit,
      addedAt: ago(addedAgoMs),
      expiresAt: expiresInMs === undefined ? undefined : ahead(expiresInMs),
      recognitionSource: "demo_recognition",
      recognitionConfidence: Number((0.72 + rand() * 0.26).toFixed(2)),
      recognitionConfirmed: true,
      status: "available",
      updatedAt: ago(addedAgoMs),
      ...opts,
    };
    inventory.push(item);
    inventoryEvents.push({
      id: `ev_${id}`,
      fridgeId,
      itemId: id,
      itemName: name,
      type: "added",
      quantityDelta: quantity,
      actor: item.recognitionSource === "manual" ? "operator" : "camera",
      at: item.addedAt,
    });
    return item;
  };

  const F = DEMO_IDS.operatorFridge;
  addItem(F, "Whole milk, 1 gal", "dairy", 3, "cartons", 26 * HOUR, 5 * DAY);
  addItem(F, "Greek yogurt cups", "dairy", 8, "cups", 20 * HOUR, 9 * DAY);
  addItem(F, "Roma tomatoes", "produce", 12, "pcs", 2 * DAY, 4 * DAY);
  addItem(F, "Baby spinach", "produce", 2, "bags", 30 * HOUR, 36 * HOUR, { recognitionConfidence: 0.91 });
  addItem(F, "Eggs, dozen", "protein", 4, "cartons", 3 * DAY, 12 * DAY);
  addItem(F, "Rotisserie chicken", "prepared", 1, "pcs", 9 * HOUR, 30 * HOUR, { recognitionConfidence: 0.64, recognitionConfirmed: false, status: "needs_review" });
  addItem(F, "Orange juice", "beverages", 2, "bottles", 4 * DAY, 10 * DAY);
  addItem(F, "Sourdough loaf", "bakery", 2, "loaves", 14 * HOUR, 2 * DAY);
  addItem(F, "Tofu, firm", "protein", 3, "packs", 2 * DAY, 8 * DAY, { recognitionConfidence: 0.58, recognitionConfirmed: false, status: "needs_review" });
  addItem(F, "Carrots, 2 lb", "produce", 5, "bags", 5 * DAY, 14 * DAY);
  addItem(F, "Hummus", "prepared", 3, "tubs", 3 * DAY, 20 * HOUR);
  addItem(F, "Cheddar block", "dairy", 2, "pcs", 6 * DAY, 21 * DAY, { recognitionSource: "manual", recognitionConfidence: undefined });

  addItem("fridge_third_ward", "2% milk, half gal", "dairy", 2, "cartons", 10 * HOUR, 6 * DAY);
  addItem("fridge_third_ward", "Apples", "produce", 18, "pcs", 2 * DAY, 12 * DAY);
  addItem("fridge_third_ward", "Bean burritos", "prepared", 6, "pcs", 8 * HOUR, 2 * DAY);
  addItem("fridge_third_ward", "Bell peppers", "produce", 7, "pcs", 36 * HOUR, 5 * DAY);
  addItem("fridge_third_ward", "Butter", "dairy", 3, "pcs", 4 * DAY, 30 * DAY);

  addItem("fridge_east_end", "Collard greens", "produce", 4, "bunches", 18 * HOUR, 3 * DAY);
  addItem("fridge_east_end", "Corn tortillas", "bakery", 5, "packs", 2 * DAY, 9 * DAY);
  addItem("fridge_east_end", "Oat milk", "beverages", 3, "cartons", 3 * DAY, 15 * DAY);
  addItem("fridge_east_end", "Ground turkey", "protein", 2, "packs", 11 * HOUR, 26 * HOUR, { recognitionConfidence: 0.69, recognitionConfirmed: false, status: "needs_review" });

  addItem("fridge_heights", "Whole milk, 1 gal", "dairy", 1, "cartons", 30 * HOUR, 4 * DAY);
  addItem("fridge_heights", "Strawberries", "produce", 6, "pints", 12 * HOUR, 2 * DAY);
  addItem("fridge_heights", "Cottage cheese", "dairy", 4, "tubs", 2 * DAY, 10 * DAY);
  addItem("fridge_heights", "Veggie lasagna", "prepared", 2, "trays", 7 * HOUR, 2 * DAY);
  addItem("fridge_heights", "Lemons", "produce", 10, "pcs", 4 * DAY, 16 * DAY);

  addItem("fridge_midtown", "Eggs, dozen", "protein", 2, "cartons", 2 * DAY, 10 * DAY);
  addItem("fridge_midtown", "Cucumbers", "produce", 6, "pcs", 3 * DAY, 4 * DAY);

  addItem("fridge_sunnyside", "Sweet potatoes", "produce", 9, "pcs", 2 * DAY, 20 * DAY);
  addItem("fridge_sunnyside", "Whole milk, 1 gal", "dairy", 2, "cartons", 15 * HOUR, 6 * DAY);
  addItem("fridge_sunnyside", "Chicken soup", "prepared", 5, "tubs", 6 * HOUR, 3 * DAY);
  addItem("fridge_sunnyside", "Bananas", "produce", 14, "pcs", 20 * HOUR, 3 * DAY);

  // Removals and anomalies in the operator's recent history.
  inventoryEvents.push(
    { id: "ev_rm_1", fridgeId: F, itemName: "Bagels, 6 pack", type: "removed", quantityDelta: -1, actor: "camera", note: "Taken 7:42 am, confirmed by front camera", at: ago(5 * HOUR) },
    { id: "ev_rm_2", fridgeId: F, itemName: "Apple sauce cups", type: "removed", quantityDelta: -4, actor: "camera", at: ago(9 * HOUR) },
    { id: "ev_rm_3", fridgeId: F, itemName: "Whole milk, 1 gal", type: "unconfirmed_removal", quantityDelta: -1, actor: "system", note: "Shelf count changed between frames with no door-open event. Needs review.", at: ago(31 * HOUR) },
    { id: "ev_rm_4", fridgeId: F, itemName: "Hummus", type: "edited", quantityDelta: 0, actor: "operator", note: "Expiration corrected from label", at: ago(2 * DAY) },
    { id: "ev_rm_5", fridgeId: F, itemName: "Pasta salad", type: "expired", quantityDelta: -2, actor: "system", note: "Past recorded best-by date; flagged for disposal", at: ago(3 * DAY) },
  );

  // ---------- Sensor readings (time-series) ----------
  const sensorReadings: SensorReading[] = [];
  let readingSeq = 0;
  const pushReading = (fridgeId: string, metric: SensorReading["metric"], value: number, unit: SensorReading["unit"], at: number) => {
    sensorReadings.push({ id: `rd_${++readingSeq}`, fridgeId, metric, value: Number(value.toFixed(metric === "air_quality" ? 0 : 1)), unit, source: "demo", at: iso(at) });
  };

  for (const fridge of fridges) {
    if (fridge.status === "offline") {
      // Offline fridge: readings stop at lastSeenAt.
      const stop = new Date(fridge.lastSeenAt).getTime();
      for (let ts = t - 7 * DAY; ts <= stop; ts += HOUR) {
        pushReading(fridge.id, "temperature", 3.4 + Math.sin(ts / (6 * HOUR)) * 0.5 + (rand() - 0.5) * 0.3, "°C", ts);
      }
      continue;
    }
    const baseTemp = fridge.id === "fridge_east_end" ? 4.1 : 3.2;
    // Hourly for 7 days, then every 15 minutes for the last 24 hours.
    const samples: number[] = [];
    for (let ts = t - 7 * DAY; ts < t - DAY; ts += HOUR) samples.push(ts);
    for (let ts = t - DAY; ts <= t; ts += 15 * 60_000) samples.push(ts);
    for (const ts of samples) {
      const dayPhase = Math.sin((ts / DAY) * Math.PI * 2);
      let temp = baseTemp + dayPhase * 0.4 + (rand() - 0.5) * 0.35;
      // Operator fridge: a door-open excursion ~3h ago that recovered.
      if (fridge.id === F) {
        const dt = t - ts;
        if (dt < 3.4 * HOUR && dt > 2.6 * HOUR) temp += 2.8 * (1 - Math.abs(dt - 3 * HOUR) / (0.4 * HOUR));
      }
      // East End: degraded cooling drifting warm during afternoons.
      if (fridge.id === "fridge_east_end") temp += Math.max(0, dayPhase) * 1.1;
      pushReading(fridge.id, "temperature", temp, "°C", ts);
      if (fridge.capabilities.humidity && (t - ts) % HOUR === 0) {
        pushReading(fridge.id, "humidity", 52 + dayPhase * 4 + (rand() - 0.5) * 3, "%", ts);
      }
      if (fridge.capabilities.airQuality && (t - ts) % HOUR === 0) {
        const spike = fridge.id === F && (t - ts) < 8 * HOUR && (t - ts) > 5 * HOUR ? 380 : 0;
        pushReading(fridge.id, "air_quality", 620 + dayPhase * 60 + (rand() - 0.5) * 50 + spike, "ppm", ts);
      }
    }
  }

  // ---------- Alerts ----------
  const alerts: Alert[] = [
    { id: "alert_1", fridgeId: F, type: "temperature_excursion", severity: "warning", title: "Temperature reached 6.1 °C", detail: "Reading exceeded the 5 °C threshold for 22 minutes around a door-open event, then recovered to 3.3 °C.", createdAt: ago(3 * HOUR), resolvedAt: ago(2.6 * HOUR) },
    { id: "alert_2", fridgeId: F, type: "expiring_soon", severity: "info", title: "3 items expire within 36 hours", detail: "Baby spinach, hummus, and rotisserie chicken reach their recorded best-by dates soon.", createdAt: ago(1 * HOUR) },
    { id: "alert_3", fridgeId: F, type: "unconfirmed_removal", severity: "warning", title: "Unconfirmed removal: whole milk", detail: "Shelf count dropped by one between frames with no matching door event. This is an anomaly to review, not a theft determination.", createdAt: ago(31 * HOUR) },
    { id: "alert_4", fridgeId: F, type: "air_quality", severity: "info", title: "CO₂-equivalent briefly above 1,000 ppm", detail: "Air-quality reading spiked to ~1,020 ppm for about two hours. Check for spoiled produce. This reading does not certify food safety either way.", createdAt: ago(6 * HOUR), resolvedAt: ago(5 * HOUR), acknowledgedAt: ago(5.5 * HOUR) },
    { id: "alert_5", fridgeId: "fridge_east_end", type: "temperature_excursion", severity: "critical", title: "Afternoon temperatures above 5 °C", detail: "Three consecutive afternoons above threshold. Compressor or door seal may need service.", createdAt: ago(5 * HOUR) },
    { id: "alert_6", fridgeId: "fridge_east_end", type: "sensor_offline", severity: "warning", title: "Interior camera reconnecting", detail: "Interior camera dropped 4 times in the last 24 hours. Inventory counts may lag.", createdAt: ago(14 * HOUR) },
    { id: "alert_7", fridgeId: "fridge_midtown", type: "sensor_offline", severity: "critical", title: "Board offline for 19 hours", detail: "No heartbeat since a reported power cut. Last temperature reading was 3.1 °C.", createdAt: ago(18.5 * HOUR) },
    { id: "alert_8", fridgeId: "fridge_heights", type: "expiring_soon", severity: "info", title: "Strawberries expire tomorrow", detail: "6 pints reach best-by date in under 48 hours.", createdAt: ago(5 * HOUR) },
  ];

  // ---------- Missions ----------
  const missions: Mission[] = [
    {
      id: "mission_milk",
      organizationId: DEMO_IDS.organization,
      title: "Milk for weekend family pickups",
      foodType: "Whole or 2% milk, sealed, within date",
      category: "dairy",
      quantityNeeded: 10,
      quantityVerified: 4,
      unit: "cartons",
      deadline: ahead(2 * DAY + 6 * HOUR),
      location: { mode: "dropoff", fridgeId: F, label: "Drop off at Montrose Corner Fridge" },
      rewardSol: 0.25,
      rewardCondition: "Reward is shared across donors whose accepted cartons count toward the goal. Paid only after the mission is verified complete.",
      eligibility: ["Sealed cartons only", "Best-by date at least 3 days out", "Must be checked in by the fridge operator"],
      status: "open",
      participantUserIds: [DEMO_IDS.donorUser, "user_jalen"],
      createdAt: ago(2 * DAY),
    },
    {
      id: "mission_produce",
      organizationId: DEMO_IDS.organization,
      title: "Fresh produce for Emancipation Park",
      foodType: "Whole fruit and vegetables",
      category: "produce",
      quantityNeeded: 40,
      quantityVerified: 26,
      unit: "lbs",
      deadline: ahead(5 * DAY),
      location: { mode: "dropoff", fridgeId: "fridge_third_ward", label: "Drop off at Emancipation Park Fridge" },
      rewardSol: 0.4,
      rewardCondition: "Top two contributors by verified pounds share the reward after close.",
      eligibility: ["Unbruised, uncut produce", "No home-canned goods"],
      status: "open",
      participantUserIds: ["user_sofia", "user_tomas", "user_aisha"],
      createdAt: ago(4 * DAY),
    },
    {
      id: "mission_eggs",
      organizationId: "org_bayou_harvest",
      title: "Eggs for East End breakfast program",
      foodType: "Eggs, dozen cartons",
      category: "protein",
      quantityNeeded: 12,
      quantityVerified: 12,
      unit: "cartons",
      deadline: ago(1 * DAY),
      location: { mode: "dropoff", fridgeId: "fridge_east_end", label: "Drop off at Navigation Esplanade Fridge" },
      rewardSol: 0.15,
      rewardCondition: "Split evenly between all donors with accepted cartons.",
      eligibility: ["Refrigerated cartons only", "Best-by date at least 5 days out"],
      status: "completed",
      participantUserIds: [DEMO_IDS.donorUser, "user_jalen", "user_sofia"],
      createdAt: ago(8 * DAY),
      completedAt: ago(1.5 * DAY),
    },
    {
      id: "mission_meals",
      organizationId: DEMO_IDS.organization,
      title: "Prepared meals for Sunnyside seniors",
      foodType: "Sealed prepared meals from licensed kitchens",
      category: "prepared",
      quantityNeeded: 30,
      quantityVerified: 0,
      unit: "meals",
      deadline: ahead(9 * DAY),
      location: { mode: "dropoff", fridgeId: "fridge_sunnyside", label: "Drop off at Sunnyside Community Center Fridge" },
      rewardCondition: "No reward attached. Recognition on the community leaderboard.",
      eligibility: ["Commercially prepared and labeled", "Ingredients listed on packaging"],
      status: "draft",
      participantUserIds: [],
      createdAt: ago(6 * HOUR),
    },
  ];

  // ---------- Donations ----------
  const donations: Donation[] = [
    { id: "don_1", missionId: "mission_milk", donorUserId: "user_jalen", fridgeId: F, itemName: "Whole milk, 1 gal", category: "dairy", quantity: 2, unit: "cartons", expiresAt: ahead(5 * DAY), status: "accepted", proposedAt: ago(30 * HOUR), deliveredAt: ago(27 * HOUR), verifiedAt: ago(26 * HOUR), verifiedByUserId: DEMO_IDS.operatorUser, pointsAwarded: 10 },
    { id: "don_2", missionId: "mission_milk", donorUserId: DEMO_IDS.donorUser, fridgeId: F, itemName: "2% milk, 1 gal", category: "dairy", quantity: 2, unit: "cartons", expiresAt: ahead(6 * DAY), status: "accepted", proposedAt: ago(22 * HOUR), deliveredAt: ago(20 * HOUR), verifiedAt: ago(19 * HOUR), verifiedByUserId: DEMO_IDS.operatorUser, pointsAwarded: 10 },
    { id: "don_3", missionId: "mission_produce", donorUserId: "user_sofia", fridgeId: "fridge_third_ward", itemName: "Apples", category: "produce", quantity: 12, unit: "lbs", status: "accepted", proposedAt: ago(3 * DAY), deliveredAt: ago(2.8 * DAY), verifiedAt: ago(2.7 * DAY), verifiedByUserId: "user_op_thirdward", pointsAwarded: 60 },
    { id: "don_4", missionId: "mission_produce", donorUserId: "user_tomas", fridgeId: "fridge_third_ward", itemName: "Bell peppers", category: "produce", quantity: 8, unit: "lbs", status: "accepted", proposedAt: ago(2 * DAY), deliveredAt: ago(1.8 * DAY), verifiedAt: ago(1.7 * DAY), verifiedByUserId: "user_op_thirdward", pointsAwarded: 40 },
    { id: "don_5", missionId: "mission_produce", donorUserId: "user_aisha", fridgeId: "fridge_third_ward", itemName: "Oranges", category: "produce", quantity: 6, unit: "lbs", status: "accepted", proposedAt: ago(1.2 * DAY), deliveredAt: ago(1 * DAY), verifiedAt: ago(22 * HOUR), verifiedByUserId: "user_op_thirdward", pointsAwarded: 30 },
    { id: "don_6", missionId: "mission_produce", donorUserId: "user_tomas", fridgeId: "fridge_third_ward", itemName: "Bagged salad mix", category: "produce", quantity: 5, unit: "lbs", status: "rejected", proposedAt: ago(1.5 * DAY), deliveredAt: ago(1.4 * DAY), verifiedAt: ago(1.3 * DAY), verifiedByUserId: "user_op_thirdward", rejectionReason: "Bags were already open; not eligible.", pointsAwarded: 0 },
    { id: "don_7", missionId: "mission_eggs", donorUserId: DEMO_IDS.donorUser, fridgeId: "fridge_east_end", itemName: "Eggs, dozen", category: "protein", quantity: 5, unit: "cartons", status: "accepted", proposedAt: ago(5 * DAY), deliveredAt: ago(4.5 * DAY), verifiedAt: ago(4.4 * DAY), verifiedByUserId: "user_op_eastend", pointsAwarded: 25 },
    { id: "don_8", missionId: "mission_eggs", donorUserId: "user_jalen", fridgeId: "fridge_east_end", itemName: "Eggs, dozen", category: "protein", quantity: 4, unit: "cartons", status: "accepted", proposedAt: ago(4 * DAY), deliveredAt: ago(3.5 * DAY), verifiedAt: ago(3.4 * DAY), verifiedByUserId: "user_op_eastend", pointsAwarded: 20 },
    { id: "don_9", missionId: "mission_eggs", donorUserId: "user_sofia", fridgeId: "fridge_east_end", itemName: "Eggs, dozen", category: "protein", quantity: 3, unit: "cartons", status: "accepted", proposedAt: ago(2 * DAY), deliveredAt: ago(1.6 * DAY), verifiedAt: ago(1.5 * DAY), verifiedByUserId: "user_op_eastend", pointsAwarded: 35 },
    { id: "don_10", donorUserId: DEMO_IDS.donorUser, fridgeId: "fridge_heights", itemName: "Strawberries", category: "produce", quantity: 6, unit: "pints", expiresAt: ahead(2 * DAY), status: "accepted", proposedAt: ago(13 * HOUR), deliveredAt: ago(12.5 * HOUR), verifiedAt: ago(12 * HOUR), verifiedByUserId: "user_op_heights", pointsAwarded: 30 },
    { id: "don_11", missionId: "mission_milk", donorUserId: "user_aisha", fridgeId: F, itemName: "Whole milk, half gal", category: "dairy", quantity: 2, unit: "cartons", expiresAt: ahead(4 * DAY), status: "delivered", proposedAt: ago(4 * HOUR), deliveredAt: ago(50 * 60_000), pointsAwarded: 0 },
  ];

  // ---------- Leaderboard events (only from accepted donations) ----------
  const leaderboard: LeaderboardEvent[] = donations
    .filter((d) => d.status === "accepted")
    .map((d) => ({
      id: `lb_${d.id}`,
      userId: d.donorUserId,
      donationId: d.id,
      points: d.pointsAwarded,
      reason: `${d.quantity} ${d.unit} of ${d.itemName} accepted`,
      at: d.verifiedAt ?? d.proposedAt,
    }));
  // Mission completion bonus for the last egg donor.
  leaderboard.push({ id: "lb_bonus_eggs", userId: "user_sofia", donationId: "don_9", points: 20, reason: "Completed mission: Eggs for East End breakfast program", at: ago(1.5 * DAY) });

  // ---------- Community events ----------
  const events: CommunityEvent[] = [
    {
      id: "event_harvest",
      organizationId: DEMO_IDS.organization,
      name: "Fall Harvest Week",
      description: "A week-long push to stock every connected fridge with fresh produce before the holidays.",
      startsAt: ahead(3 * DAY),
      endsAt: ahead(10 * DAY),
      fridgeIds: [F, "fridge_third_ward", "fridge_heights"],
      donationGoal: 300,
      eligibleItems: ["Produce", "Dairy", "Eggs"],
      leaderboardRule: "verified_quantity",
      prizeWinners: 3,
      prizeBudgetSol: 1.5,
      status: "published",
      createdAt: ago(5 * DAY),
    },
    {
      id: "event_finals",
      organizationId: DEMO_IDS.organization,
      name: "Finals Week Fuel",
      description: "Keep the campus-adjacent fridges stocked with grab-and-go meals during exams.",
      startsAt: ahead(20 * DAY),
      endsAt: ahead(27 * DAY),
      fridgeIds: ["fridge_third_ward"],
      donationGoal: 150,
      eligibleItems: ["Prepared meals", "Beverages", "Fruit"],
      leaderboardRule: "verified_points",
      prizeWinners: 2,
      prizeBudgetSol: 0.8,
      status: "draft",
      createdAt: ago(2 * DAY),
    },
    {
      id: "event_summer",
      organizationId: DEMO_IDS.organization,
      name: "Summer Hydration Drive",
      description: "Bottled water and juice for the hottest weeks of the year.",
      startsAt: ago(60 * DAY),
      endsAt: ago(46 * DAY),
      fridgeIds: [F, "fridge_east_end"],
      donationGoal: 500,
      eligibleItems: ["Water", "Juice", "Electrolyte drinks"],
      leaderboardRule: "verified_quantity",
      prizeWinners: 3,
      prizeBudgetSol: 1.2,
      status: "closed",
      createdAt: ago(75 * DAY),
    },
  ];

  // ---------- Connections ----------
  const fullSharing = { inventory: true, sensors: true, alerts: true, preciseLocation: true };
  const connections: ConnectionRequest[] = [
    { id: "conn_1", organizationId: DEMO_IDS.organization, fridgeId: F, status: "approved", message: "We'd like to list your fridge for our weekend pickups.", sharing: fullSharing, requestedAt: ago(80 * DAY), respondedAt: ago(79 * DAY) },
    { id: "conn_2", organizationId: DEMO_IDS.organization, fridgeId: "fridge_third_ward", status: "approved", message: "Park fridge partnership.", sharing: fullSharing, requestedAt: ago(120 * DAY), respondedAt: ago(119 * DAY) },
    { id: "conn_3", organizationId: DEMO_IDS.organization, fridgeId: "fridge_heights", status: "approved", message: "Library partnership for the Heights.", sharing: { inventory: true, sensors: true, alerts: false, preciseLocation: true }, requestedAt: ago(60 * DAY), respondedAt: ago(58 * DAY) },
    { id: "conn_4", organizationId: DEMO_IDS.organization, fridgeId: "fridge_midtown", status: "pending", message: "Could we include your fridge in the Fall Harvest Week event?", sharing: { inventory: true, sensors: false, alerts: false, preciseLocation: false }, requestedAt: ago(2 * DAY) },
    { id: "conn_5", organizationId: "org_bayou_harvest", fridgeId: F, status: "pending", message: "Bayou Harvest would like to route East End surplus produce to Montrose on Tuesdays.", sharing: { inventory: true, sensors: false, alerts: false, preciseLocation: false }, requestedAt: ago(20 * HOUR) },
    { id: "conn_6", organizationId: "org_bayou_harvest", fridgeId: "fridge_east_end", status: "approved", message: "Market partnership.", sharing: fullSharing, requestedAt: ago(100 * DAY), respondedAt: ago(99 * DAY) },
  ];

  // ---------- Rewards ----------
  const rewards: RewardAllocation[] = [
    { id: "rw_1", missionId: "mission_eggs", userId: DEMO_IDS.donorUser, organizationId: "org_bayou_harvest", amountSol: 0.05, status: "paid", createdAt: ago(1.5 * DAY), approvedAt: ago(1.2 * DAY), transactionId: "tx_1" },
    { id: "rw_2", missionId: "mission_eggs", userId: "user_jalen", organizationId: "org_bayou_harvest", amountSol: 0.05, status: "approved", createdAt: ago(1.5 * DAY), approvedAt: ago(1.1 * DAY) },
    { id: "rw_3", missionId: "mission_eggs", userId: "user_sofia", organizationId: "org_bayou_harvest", amountSol: 0.05, status: "pending_verification", createdAt: ago(1.5 * DAY) },
    { id: "rw_4", missionId: "mission_milk", userId: DEMO_IDS.donorUser, organizationId: DEMO_IDS.organization, amountSol: 0.125, status: "eligible", createdAt: ago(19 * HOUR) },
  ];

  const rewardTransactions: RewardTransaction[] = [
    {
      id: "tx_1",
      allocationId: "rw_1",
      network: "simulated",
      signature: "SIMULATED5b3c9d2e1f0a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1",
      toAddress: "DemoWa11etPriyaNatarajan1111111111111111111",
      amountSol: 0.05,
      status: "confirmed",
      at: ago(1.1 * DAY),
    },
  ];

  return {
    users,
    organizations,
    fridges,
    inventory,
    inventoryEvents,
    sensorReadings,
    alerts,
    missions,
    donations,
    events,
    connections,
    leaderboard,
    rewards,
    rewardTransactions,
  };
}
