import "server-only";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  seedWorld,
  seedRescues,
  advanceRescue,
  refill,
  type CommunityWorld,
  type Refill,
  setMission,
} from "./model";
const directory = path.resolve(process.cwd(), "../runtime");
const filename = path.join(directory, "community-demo.json");
let queue: Promise<unknown> = Promise.resolve();
export async function readWorld(): Promise<CommunityWorld> {
  try {
    const world = JSON.parse(
      await readFile(filename, "utf8"),
    ) as CommunityWorld;
    if (!world.rescues) {
      world.rescues = seedRescues();
      await writeFile(filename + ".rescues.tmp", JSON.stringify(world), {
        mode: 0o600,
      });
      await rename(filename + ".rescues.tmp", filename);
    }
    return {
      ...world,
      version: 2,
      crews: seedWorld().crews,
      refills: [
        ...world.refills,
        ...seedWorld().refills.filter(
          (e) => !world.refills.some((old) => old.id === e.id),
        ),
      ],
      memberships: world.memberships ?? {},
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const world = { ...seedWorld(), rescues: seedRescues() };
    await mkdir(directory, { recursive: true });
    await writeFile(filename, JSON.stringify(world), { mode: 0o600 });
    return world;
  }
}
export function recordRefill(event: Refill): Promise<CommunityWorld> {
  const task = queue.then(async () => {
    const next = refill(await readWorld(), event);
    await mkdir(directory, { recursive: true });
    const temp = filename + ".tmp";
    await writeFile(temp, JSON.stringify(next), { mode: 0o600 });
    await rename(temp, filename);
    return next;
  });
  queue = task.catch(() => undefined);
  return task;
}

export function recordMission(
  userId: string,
  fridgeId: string,
  join: boolean,
): Promise<CommunityWorld> {
  const task = queue.then(async () => {
    const next = setMission(await readWorld(), userId, fridgeId, join);
    await mkdir(directory, { recursive: true });
    await writeFile(filename + ".tmp", JSON.stringify(next), { mode: 0o600 });
    await rename(filename + ".tmp", filename);
    return next;
  });
  queue = task.catch(() => undefined);
  return task;
}

export function recordRescue(
  userId: string,
  id: string,
  action: "pickup" | "deliver",
): Promise<CommunityWorld> {
  const task = queue.then(async () => {
    const next = advanceRescue(await readWorld(), userId, id, action);
    await writeFile(filename + ".tmp", JSON.stringify(next), { mode: 0o600 });
    await rename(filename + ".tmp", filename);
    return next;
  });
  queue = task.catch(() => undefined);
  return task;
}
