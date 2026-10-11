export type Crew = { id: string; name: string; color: string };
export type CommunityFridge = {
  id: string;
  name: string;
  neighborhood: string;
  lat: number;
  lng: number;
  stock: number;
  capacity: number;
  need: string;
  supplied: Record<string, number>;
};
export type Refill = {
  id: string;
  fridgeId: string;
  crewId: string;
  units: number;
  actor: string;
  actorId?: string;
  at: string;
};
export type CommunityWorld = {
  demo: true;
  rescues?: RescueMission[];
  version?: number;
  memberships?: Record<string, string[]>;
  viewer?: { id: string; name: string; joined: string[] } | null;
  crews: Crew[];
  fridges: CommunityFridge[];
  refills: Refill[];
  updatedAt: string;
};
export function seedWorld(): CommunityWorld {
  const crews = [
    { id: "bayou", name: "Orion Builders", color: "#397c69" },
    { id: "cougars", name: "Cougar Collective", color: "#9670b2" },
    { id: "east", name: "MLH Community Crew", color: "#da975b" },
    { id: "nourish", name: "Team Nourish", color: "#4c8fb9" },
  ];
  const sites = [
    ["Third Ward", "Emancipation Park", 29.736, -95.365, "Produce & dairy"],
    ["East End", "Navigation Pantry", 29.753, -95.336, "Prepared meals"],
    ["Downtown", "Main Street Fridge", 29.76, -95.365, "Fresh fruit"],
    ["Midtown", "Community Table", 29.742, -95.377, "Milk & eggs"],
    ["Montrose", "Westheimer Share", 29.744, -95.398, "Vegetables"],
    [
      "Museum District",
      "Oak Grove Fridge",
      29.721,
      -95.389,
      "Ready-to-eat meals",
    ],
    [
      "University",
      "Cougar Community Fridge",
      29.72,
      -95.345,
      "Produce & yogurt",
    ],
    ["Second Ward", "Canal Street Pantry", 29.746, -95.321, "Fresh produce"],
    ["Heights", "Heights Helping Hands", 29.791, -95.399, "Milk & eggs"],
    [
      "Rice Village",
      "Sunset Community Fridge",
      29.717,
      -95.414,
      "Prepared meals",
    ],
    ["Greater Eastwood", "Eastwood Share", 29.735, -95.318, "Vegetables"],
    ["Northside", "Fulton Food Share", 29.786, -95.363, "Fresh fruit"],
  ] as const;
  const stocks = [4, 12, 22, 8, 30, 5, 14, 2, 27, 9, 18, 6];
  const world: CommunityWorld = {
    demo: true,
    version: 2,
    memberships: {},
    crews,
    refills: [],
    updatedAt: new Date().toISOString(),
    fridges: sites.map(([neighborhood, name, lat, lng, need], i) => ({
      id: `houston-${i + 1}`,
      name,
      neighborhood,
      lat,
      lng,
      need,
      stock: stocks[i],
      capacity: 40,
      supplied:
        i === 7
          ? {}
          : { [crews[i % 4].id]: 6 + (i % 5), [crews[(i + 1) % 4].id]: 2 },
    })),
  };
  const names = [
    "Orion volunteer Maya",
    "CodeRED participant Alex",
    "MLH community volunteer Sam",
    "Nourish volunteer Jordan",
  ];
  world.refills = world.fridges
    .flatMap((f, i) =>
      Object.entries(f.supplied).map(([crewId, units], j) => ({
        id: `seed-${f.id}-${crewId}`,
        fridgeId: f.id,
        crewId,
        units,
        actor: names[(i + j) % names.length],
        at: new Date(Date.UTC(2026, 9, 11, 9, i * 3 + j)).toISOString(),
      })),
    )
    .reverse();
  return world;
}
export function owner(fridge: CommunityFridge): string | null {
  const sorted = Object.entries(fridge.supplied).sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );
  return sorted.length && sorted[0][1] > 0 ? sorted[0][0] : null;
}
export function standings(world: CommunityWorld) {
  const cells = territoryCells(world);
  return world.crews
    .map((crew) => ({
      ...crew,
      units: world.fridges.reduce((n, f) => n + (f.supplied[crew.id] ?? 0), 0),
      helped: world.fridges.filter((f) => (f.supplied[crew.id] ?? 0) > 0)
        .length,
      territories: cells.filter((c) => c.crewId === crew.id).length,
    }))
    .sort(
      (a, b) =>
        b.units - a.units || b.helped - a.helped || a.id.localeCompare(b.id),
    );
}
export function refill(world: CommunityWorld, event: Refill): CommunityWorld {
  if (world.refills.some((e) => e.id === event.id)) return world;
  if (!Number.isInteger(event.units) || event.units < 1 || event.units > 40)
    throw new Error("Choose 1–40 food units.");
  if (!world.crews.some((c) => c.id === event.crewId))
    throw new Error("Unknown crew.");
  const fridge = world.fridges.find((f) => f.id === event.fridgeId);
  if (!fridge) throw new Error("Unknown fridge.");
  if (event.units > fridge.capacity - fridge.stock)
    throw new Error("This refill exceeds the fridge’s remaining capacity.");
  return {
    ...world,
    updatedAt: event.at,
    fridges: world.fridges.map((f) =>
      f.id === fridge.id
        ? {
            ...f,
            stock: f.stock + event.units,
            supplied: {
              ...f.supplied,
              [event.crewId]: (f.supplied[event.crewId] ?? 0) + event.units,
            },
          }
        : f,
    ),
    refills: [event, ...world.refills].slice(0, 500),
  };
}

// A bounded square lattice: each crew expands only through its own connected frontier.
// Cells are a visual game footprint, not land ownership or food access rights.
export type TerritoryCell = {
  x: number;
  y: number;
  crewId: string;
  lng: number;
  lat: number;
  size: number;
};
export function territoryCells(world: CommunityWorld): TerritoryCell[] {
  const size = 0.0025;
  const west = -95.435,
    south = 29.7,
    cols = 52,
    rows = 44;
  const anchors = ["houston-4", "houston-1", "houston-2", "houston-7"];
  const used = new Set<string>();
  const queues = world.crews.map((crew, i) => {
    const f =
      world.fridges.find((f) => f.id === anchors[i]) ?? world.fridges[i];
    const x = Math.max(
      0,
      Math.min(cols - 1, Math.floor((f.lng - west) / size)),
    );
    const y = Math.max(
      0,
      Math.min(rows - 1, Math.floor((f.lat - south) / size)),
    );
    const budget =
      12 +
      world.fridges.reduce((n, f) => n + (f.supplied[crew.id] ?? 0), 0) * 3;
    return {
      crewId: crew.id,
      frontier: [[x, y]] as number[][],
      head: 0,
      count: 0,
      budget,
    };
  });
  const cells: TerritoryCell[] = [];
  let growing = true;
  while (growing) {
    growing = false;
    for (const q of queues) {
      if (q.count >= q.budget) continue;
      while (q.head < q.frontier.length) {
        const [x, y] = q.frontier[q.head++];
        const key = `${x}:${y}`;
        if (used.has(key) || x < 0 || y < 0 || x >= cols || y >= rows) continue;
        used.add(key);
        cells.push({
          x,
          y,
          crewId: q.crewId,
          lng: west + x * size,
          lat: south + y * size,
          size,
        });
        q.count++;
        q.frontier.push([x + 1, y], [x, y + 1], [x - 1, y], [x, y - 1]);
        growing = true;
        break;
      }
    }
  }
  return cells;
}
export function territoryGeoJSON(
  world: CommunityWorld,
): GeoJSON.FeatureCollection {
  const cells = territoryCells(world);
  const byKey = new Map(cells.map((c) => [`${c.x}:${c.y}`, c.crewId]));
  const features: GeoJSON.Feature[] = [];
  for (const c of cells) {
    const color = world.crews.find((crew) => crew.id === c.crewId)!.color;
    const x = c.lng,
      y = c.lat,
      d = c.size;
    const ring = [
      [x, y],
      [x + d, y],
      [x + d, y + d],
      [x, y + d],
      [x, y],
    ];
    features.push({
      type: "Feature",
      properties: { kind: "cell", color, crewId: c.crewId },
      geometry: { type: "Polygon", coordinates: [ring] },
    });
    const sides = [
      [c.x, c.y - 1, ring[0], ring[1]],
      [c.x + 1, c.y, ring[1], ring[2]],
      [c.x, c.y + 1, ring[2], ring[3]],
      [c.x - 1, c.y, ring[3], ring[0]],
    ] as const;
    for (const [nx, ny, a, b] of sides)
      if (byKey.get(`${nx}:${ny}`) !== c.crewId)
        features.push({
          type: "Feature",
          properties: { kind: "edge", color },
          geometry: { type: "LineString", coordinates: [a, b] },
        });
  }
  for (const crew of world.crews) {
    const held = cells.filter((c) => c.crewId === crew.id);
    if (!held.length) continue;
    features.push({
      type: "Feature",
      properties: { kind: "label", color: crew.color, name: crew.name },
      geometry: {
        type: "Point",
        coordinates: [
          held.reduce((n, c) => n + c.lng + c.size / 2, 0) / held.length,
          held.reduce((n, c) => n + c.lat + c.size / 2, 0) / held.length,
        ],
      },
    });
  }
  return { type: "FeatureCollection", features };
}
export function missions(world: CommunityWorld) {
  return world.fridges
    .filter((f) => f.stock < 32)
    .map((f) => ({
      id: f.id,
      title: `Refill ${f.neighborhood}`,
      fridge: f,
      target: 32,
      remaining: 32 - f.stock,
      urgency: f.stock < 8 ? "Urgent" : f.stock < 16 ? "Priority" : "Open",
      progress: Math.round((f.stock / 32) * 100),
    }));
}
export function setMission(
  world: CommunityWorld,
  userId: string,
  fridgeId: string,
  join: boolean,
): CommunityWorld {
  if (
    !world.fridges.some((f) => f.id === fridgeId) &&
    !world.rescues?.some((m) => m.id === fridgeId)
  )
    throw new Error("Unknown mission.");
  const current = world.memberships?.[userId] ?? [];
  return {
    ...world,
    memberships: {
      ...world.memberships,
      [userId]: join
        ? [...new Set([...current, fridgeId])]
        : current.filter((id) => id !== fridgeId),
    },
  };
}

export type RescueMission = {
  id: string;
  title: string;
  kind: "rescue" | "delivery";
  food: string;
  quantity: number;
  pickup: string;
  destination: string;
  deadline: string;
  handling: string;
  rewardSol: number;
  stage: "open" | "picked_up" | "delivered";
  assignedTo?: string;
};
export function seedRescues(now = Date.now()): RescueMission[] {
  return [
    {
      id: "rescue-meals",
      title: "Get meals to the next meal service",
      kind: "delivery",
      food: "Chilled prepared meals",
      quantity: 24,
      pickup: "Community Table fridge · Midtown",
      destination: "Orion evening meal service · Third Ward",
      deadline: new Date(now + 45 * 60000).toISOString(),
      handling:
        "Keep chilled in an insulated carrier. Receiving volunteer confirms quantity and condition.",
      rewardSol: 0.03,
      stage: "open",
    },
    {
      id: "rescue-produce",
      title: "Rescue surplus produce before pickup closes",
      kind: "rescue",
      food: "Fresh produce crates",
      quantity: 12,
      pickup: "CodeRED demo market · East End",
      destination: "Navigation community food bank",
      deadline: new Date(now + 90 * 60000).toISOString(),
      handling:
        "Collect only accepted produce. Confirm the receiving site is open before leaving.",
      rewardSol: 0.02,
      stage: "open",
    },
    {
      id: "rescue-dairy",
      title: "Deliver dairy for the morning distribution",
      kind: "delivery",
      food: "Sealed milk and yogurt",
      quantity: 18,
      pickup: "Cougar Community Fridge · University",
      destination: "MLH demo neighborhood pantry",
      deadline: new Date(now + 120 * 60000).toISOString(),
      handling:
        "Check date labels and maintain the cold chain. A sensor alert requires review before transport.",
      rewardSol: 0.025,
      stage: "open",
    },
  ];
}
export function advanceRescue(
  world: CommunityWorld,
  userId: string,
  id: string,
  action: "pickup" | "deliver",
): CommunityWorld {
  const mission = world.rescues?.find((m) => m.id === id);
  if (!mission) throw new Error("Unknown rescue mission.");
  if (!(world.memberships?.[userId] ?? []).includes(id))
    throw new Error("Join this mission first.");
  if (mission.assignedTo && mission.assignedTo !== userId)
    throw new Error("Another volunteer has this delivery.");
  if (Date.parse(mission.deadline) < Date.now())
    throw new Error("This delivery window has closed.");
  if (action === "deliver" && mission.stage !== "picked_up")
    throw new Error("Confirm pickup before delivery.");
  if (mission.stage === "delivered")
    throw new Error("This demo delivery is already complete.");
  return {
    ...world,
    rescues: world.rescues?.map((m) =>
      m.id === id
        ? {
            ...m,
            stage: action === "pickup" ? "picked_up" : "delivered",
            assignedTo: userId,
          }
        : m,
    ),
    updatedAt: new Date().toISOString(),
  };
}
