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
  at: string;
};
export type CommunityWorld = {
  demo: true;
  crews: Crew[];
  fridges: CommunityFridge[];
  refills: Refill[];
  updatedAt: string;
};
export function seedWorld(): CommunityWorld {
  const crews = [
    { id: "bayou", name: "Bayou Builders", color: "#397c69" },
    { id: "cougars", name: "Cougar Collective", color: "#9670b2" },
    { id: "east", name: "East End Neighbors", color: "#da975b" },
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
  return {
    demo: true,
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
}
export function owner(fridge: CommunityFridge): string | null {
  const sorted = Object.entries(fridge.supplied).sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );
  return sorted.length && sorted[0][1] > 0 ? sorted[0][0] : null;
}
export function standings(world: CommunityWorld) {
  return world.crews
    .map((crew) => ({
      ...crew,
      units: world.fridges.reduce((n, f) => n + (f.supplied[crew.id] ?? 0), 0),
      helped: world.fridges.filter((f) => (f.supplied[crew.id] ?? 0) > 0)
        .length,
      territories: world.fridges.filter((f) => owner(f) === crew.id).length,
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
