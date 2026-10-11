import "server-only";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { seedWorld, refill, type CommunityWorld, type Refill } from "./model";
const directory = path.resolve(process.cwd(), "../runtime");
const filename = path.join(directory, "community-demo.json");
let queue: Promise<unknown> = Promise.resolve();
export async function readWorld(): Promise<CommunityWorld> {
  try {
    return JSON.parse(await readFile(filename, "utf8")) as CommunityWorld;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return seedWorld();
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
