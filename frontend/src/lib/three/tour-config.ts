/**
 * Fridge tour configuration.
 *
 * Camera keyframes, door angles and label anchors come from the Blender scene
 * (blender/smart_fridge_final.blend, exported reference in blender/camera_reference.json).
 * Positions below are already in the glTF / three.js Y-up frame; rotations are kept as Blender
 * XYZ Euler degrees and converted at runtime by `blenderEulerToThreeQuaternion`.
 *
 * Blender object names the rig relies on (all present in /public/models/fridge.glb):
 *   SmartFridge_Root, Door_L_Pivot, Door_R_Pivot, Electronics_Top_Panel, Electronics_Fastener_1..4,
 *   Camera_Front_Body, Camera_Interior_Body, Speaker_Body, Arduino_PCB, Sensor_*_Body,
 *   Anchor_Camera_Front, Anchor_Camera_Interior, Anchor_Speaker, Anchor_Arduino_Board,
 *   Anchor_Sensor_Temperature, Anchor_Sensor_AirQuality, Anchor_Sensor_Moisture.
 * Missing objects fall back to the documented positions and log a warning once.
 */

export type Vec3 = [number, number, number];

export type HardwareKey =
  | "Camera_Front"
  | "Camera_Interior"
  | "Speaker"
  | "Arduino_Board"
  | "Sensor_Temperature"
  | "Sensor_AirQuality"
  | "Sensor_Moisture";

/** Door swing in degrees at full open (Blender: Door_L -100°, Door_R +100° about the hinge axis). */
export const DOOR_OPEN_DEG = 100;

/**
 * Cross-fade from the Cycles hero render to the real-time kitchen, as a tour-progress window.
 * Starts just after the hero and ends before stage 2 so the camera has moved enough that cabinets are peripheral.
 */
export const KITCHEN_FADE = { start: 0.03, end: 0.11 };
export function kitchenBlend(progress: number) {
  const t = Math.min(1, Math.max(0, (progress - KITCHEN_FADE.start) / (KITCHEN_FADE.end - KITCHEN_FADE.start)));
  return t * t * (3 - 2 * t);
}

/** The hero render (public/images/kitchen-background.webp) was rendered from this camera at 16:9. */
export const HERO_CAMERA = { lensMm: 35, position: [0, 1.05, 4.4] as Vec3, rotationBlenderDeg: [90, 0, 0] as Vec3, imageAspect: 16 / 9 };

/** `labelSide` is where the label card extends from its anchor dot, chosen so cards never cover the part itself. */
export const HARDWARE_LABELS: Record<HardwareKey, { title: string; detail: string; fallbackAnchor: Vec3; labelSide: "left" | "right" | "below" }> = {
  Camera_Front: { title: "Front camera", detail: "Watches the approach and the doors; timestamps every drop-off.", fallbackAnchor: [0, 1.905, 0.56], labelSide: "right" },
  Camera_Interior: { title: "Interior camera", detail: "Photographs the shelves on every door event for Gemini recognition.", fallbackAnchor: [0.165, 1.455, -0.12], labelSide: "right" },
  Speaker: { title: "Speaker", detail: "ElevenLabs voice guides donors through check-in.", fallbackAnchor: [-0.43, 1.7, 0.515], labelSide: "right" },
  Arduino_Board: { title: "Arduino-compatible board", detail: "Reads the sensors, drives both cameras, posts to TigerData.", fallbackAnchor: [0, 1.8, 0.26], labelSide: "below" },
  Sensor_Temperature: { title: "Temperature probe", detail: "Cabinet temperature logged every 60 seconds.", fallbackAnchor: [-0.33, 1.422, 0.04], labelSide: "right" },
  Sensor_AirQuality: { title: "Air-quality sensor", detail: "CO₂-equivalent rises as produce spoils.", fallbackAnchor: [0.33, 1.422, 0.04], labelSide: "left" },
  Sensor_Moisture: { title: "Moisture sensor", detail: "Optional humidity module near the crisper drawers.", fallbackAnchor: [-0.035, 0.585, -0.14], labelSide: "right" },
};

export interface TourStage {
  id: string;
  index: number;
  /** Blender tour marker (A–H) for traceability. */
  blenderStage: string;
  title: string;
  body: string;
  side: "left" | "right" | "center";
  camera: { position: Vec3; rotationBlenderDeg: Vec3; lensMm: number };
  /** Door swing as a fraction of DOOR_OPEN_DEG. */
  doors: number;
  /** When true the electronics top panel lifts away so the Arduino bay is visible. */
  coverHidden?: boolean;
  hotspots: HardwareKey[];
  facts?: string[];
  /** Portrait phones: vertical shift of the camera target (meters) so the subject clears the copy. */
  portraitShift?: number;
}

export const TOUR_STAGES: TourStage[] = [
  {
    id: "overview",
    index: 1,
    blenderStage: "A_Kitchen_Overview",
    title: "A smarter fridge for a more connected community.",
    body: "Nourish turns an ordinary refrigerator into a monitored, shareable food point.",
    side: "left",
    camera: { position: [0, 1.05, 4.4], rotationBlenderDeg: [90, 0, 0], lensMm: 35 },
    doors: 0,
    hotspots: [],
    portraitShift: 1.15,
  },
  {
    id: "doors",
    index: 2,
    blenderStage: "B_Doors_Opening",
    title: "Two doors, two cameras, one shared inventory.",
    body: "Each door swings on its own hinge, bins and all. Opening either one wakes the interior camera, so every change on a shelf is captured the moment it happens.",
    side: "right",
    camera: { position: [0, 1.08, 3.3], rotationBlenderDeg: [88.568, 0, 0], lensMm: 35 },
    doors: 80.2 / DOOR_OPEN_DEG,
    hotspots: [],
    facts: ["Independent hinge pivots", "Door events timestamp each inventory change"],
    portraitShift: -0.4,
  },
  {
    id: "interior",
    index: 3,
    blenderStage: "C_Interior_Overview",
    title: "Four glass shelves, two drawers, six door bins.",
    body: "Cool LED strips light the cabinet evenly so the interior camera sees every label. What you see here is what food banks and donors see in their inventory lists.",
    side: "left",
    camera: { position: [0, 1.05, 1.95], rotationBlenderDeg: [87.138, 0, 0], lensMm: 32 },
    doors: 1,
    hotspots: [],
    facts: ["Shared inventory with operator-controlled sharing", "Expiration dates read from packaging"],
    portraitShift: -0.3,
  },
  {
    id: "interior-camera",
    index: 4,
    blenderStage: "D_Interior_Camera",
    title: "Gemini reads the shelves so nobody has to type.",
    body: "The interior camera sends a frame to Gemini after each door close. It names each item, estimates quantity, and reads printed best-by dates. Low-confidence recognitions wait for the operator to confirm them.",
    side: "left",
    camera: { position: [0.14, 1.41, 0.7], rotationBlenderDeg: [94.401, 0, 8.606], lensMm: 50 },
    doors: 1,
    hotspots: ["Camera_Interior"],
    facts: ["Item name, category, quantity", "Confidence shown on every recognition"],
    portraitShift: -0.25,
  },
  {
    id: "sensors",
    index: 5,
    blenderStage: "E_Sensors",
    title: "Temperature, air quality, and moisture, logged continuously.",
    body: "A probe on the left wall tracks cabinet temperature. An air-quality sensor on the right flags rising CO₂-equivalent from spoiling produce. A moisture module near the drawers is optional. Each is a separate reading with its own thresholds.",
    side: "left",
    camera: { position: [0, 1.02, 1.45], rotationBlenderDeg: [88.522, 0, 0], lensMm: 28 },
    doors: 1,
    hotspots: ["Sensor_Temperature", "Sensor_AirQuality", "Sensor_Moisture"],
    facts: ["Readings every 60 s to TigerData", "Alerts on threshold excursions", "No reading claims food is safe"],
    portraitShift: -0.3,
  },
  {
    id: "arduino",
    index: 6,
    blenderStage: "F_Arduino",
    title: "An Arduino-compatible board ties it together.",
    body: "Under the top panel of the electronics bay, the board reads the sensors, triggers both cameras, and posts readings to the Nourish API. If Wi-Fi drops, readings queue locally until the connection returns.",
    side: "left",
    camera: { position: [0, 2.18, 0.3], rotationBlenderDeg: [3.96, 0, 0], lensMm: 60 },
    doors: 1,
    coverHidden: true,
    hotspots: ["Arduino_Board"],
    facts: ["Time-series stored in TigerData", "Local queue when offline", "Per-device ingest token"],
    portraitShift: -0.15,
  },
  {
    id: "voice",
    index: 7,
    blenderStage: "G_FrontCam_Speaker",
    title: "Donating is a conversation.",
    body: "The front camera notices someone approaching and the speaker greets them. Donors say what they brought; the voice assistant, powered by ElevenLabs, confirms the item and tells them which shelf has space.",
    side: "right",
    camera: { position: [-0.12, 1.8, 1.25], rotationBlenderDeg: [88.026, 0, 0], lensMm: 40 }, // Blender G: 50 mm at x -0.1; widened so the speaker anchor stays in frame
    doors: 1,
    hotspots: ["Camera_Front", "Speaker"],
    facts: ["Hands-free check-in", "Drop-offs matched to open missions"],
    portraitShift: -0.3,
  },
  {
    id: "cta",
    index: 8,
    blenderStage: "H_Final_CTA",
    title: "Connect to your community.",
    body: "Run a fridge, coordinate a network, or bring food where it is needed.",
    side: "center",
    camera: { position: [0.75, 1.2, 4.8], rotationBlenderDeg: [87.602, 0, 10.251], lensMm: 38 },
    doors: 1,
    hotspots: [],
    portraitShift: -0.5,
  },
];

export const TOUR_TIMING = {
  scrollHeightVh: 100 * TOUR_STAGES.length,
  autoplaySecondsPerStage: 6,
  cameraLerpRate: 3.4,
  doorLerpRate: 4.5,
};

/** Map global tour progress (0..1) to a stage index and intra-stage fraction. */
export function progressToStage(progress: number) {
  const n = TOUR_STAGES.length;
  const scaled = Math.min(Math.max(progress, 0), 0.999999) * (n - 1);
  const from = Math.floor(scaled);
  const t = scaled - from;
  return { from, to: Math.min(from + 1, n - 1), t };
}

export function stageToProgress(stageIndex: number) {
  return stageIndex / (TOUR_STAGES.length - 1);
}

/** Outer dimensions of the Blender fridge (meters), used by the fallback blockout. */
export const FRIDGE_DIMENSIONS = { width: 1.036, height: 1.6, depth: 0.81, headHeight: 0.3 };
