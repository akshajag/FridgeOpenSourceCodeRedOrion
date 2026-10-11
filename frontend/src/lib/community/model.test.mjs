import { test } from "node:test";
import assert from "node:assert/strict";
import { seedWorld, refill, owner, standings } from "./model.ts";
const event = {
  id: "test-refill",
  fridgeId: "houston-1",
  crewId: "nourish",
  units: 8,
  actor: "Test donor",
  at: "2026-10-11T12:00:00Z",
};
test("a refill updates stock, contribution, territory and ranking without modifying input", () => {
  const world = seedWorld();
  const next = refill(world, event);
  assert.equal(world.fridges[0].stock, 4);
  assert.equal(next.fridges[0].stock, 12);
  assert.equal(owner(next.fridges[0]), "nourish");
  assert.equal(
    standings(next).find((c) => c.id === "nourish").units,
    standings(world).find((c) => c.id === "nourish").units + 8,
  );
});
test("retrying the same confirmed refill does not duplicate stock or contributions", () => {
  const next = refill(seedWorld(), event);
  assert.deepEqual(refill(next, event), next);
});
test("refills reject unknown crews/fridges, fractional quantities, and overfilling", () => {
  for (const invalid of [
    { units: 37 },
    { units: 1.5 },
    { units: 0 },
    { crewId: "bad" },
    { fridgeId: "bad" },
  ])
    assert.throws(() => refill(seedWorld(), { ...event, ...invalid }));
});
test("a full fridge cannot be used to farm territory", () => {
  const next = refill(seedWorld(), { ...event, units: 36 });
  assert.equal(next.fridges[0].stock, 40);
  assert.throws(() => refill(next, { ...event, id: "another" }));
});
test("equal contributions resolve consistently regardless of insertion order", () => {
  const fridge = seedWorld().fridges[0];
  assert.equal(owner({ ...fridge, supplied: { z: 5, a: 5 } }), "a");
  assert.equal(owner({ ...fridge, supplied: { a: 5, z: 5 } }), "a");
});

test("territories have no overlap and every crew has one connected frontier", async () => {
  const { territoryCells } = await import("./model.ts");
  for (const world of [
    seedWorld(),
    refill(seedWorld(), { ...event, units: 30 }),
  ]) {
    const cells = territoryCells(world);
    assert.equal(new Set(cells.map((c) => `${c.x}:${c.y}`)).size, cells.length);
    for (const crew of world.crews) {
      const own = cells.filter((c) => c.crewId === crew.id);
      const keys = new Set(own.map((c) => `${c.x}:${c.y}`));
      const visited = new Set();
      const pending = [[own[0].x, own[0].y]];
      for (let i = 0; i < pending.length; i++) {
        const [x, y] = pending[i],
          key = `${x}:${y}`;
        if (!keys.has(key) || visited.has(key)) continue;
        visited.add(key);
        pending.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
      }
      assert.equal(visited.size, own.length);
      assert.equal(
        standings(world).find((c) => c.id === crew.id).territories,
        own.length,
      );
    }
  }
});
test("refilling grows the donating crew's territory", async () => {
  const { territoryCells } = await import("./model.ts");
  const count = (w) =>
    territoryCells(w).filter((c) => c.crewId === "nourish").length;
  const before = seedWorld();
  assert.equal(count(refill(before, event)) - count(before), event.units * 3);
});
test("mission enrollment is isolated by account and retries are idempotent", async () => {
  const { setMission, missions } = await import("./model.ts");
  const before = seedWorld();
  let after = setMission(before, "alice", "houston-1", true);
  after = setMission(after, "alice", "houston-1", true);
  assert.deepEqual(after.memberships.alice, ["houston-1"]);
  assert.equal(after.memberships.bob, undefined);
  assert.deepEqual(
    setMission(after, "alice", "houston-1", false).memberships.alice,
    [],
  );
  assert.throws(() => setMission(before, "alice", "bad", true));
  assert.equal(
    missions(refill(before, { ...event, units: 28 })).some(
      (m) => m.id === "houston-1",
    ),
    false,
  );
  assert.deepEqual(before.memberships, {});
});

test('rescue missions require enrollment and pickup before delivery, and remain demo only',async()=>{
 const {seedRescues,advanceRescue,setMission}=await import('./model.ts');
 let world={...seedWorld(),rescues:seedRescues()};
 assert.throws(()=>advanceRescue(world,'alice','rescue-meals','pickup'),/Join/);
 world=setMission(world,'alice','rescue-meals',true);
 assert.throws(()=>advanceRescue(world,'alice','rescue-meals','deliver'),/pickup/);
 world=advanceRescue(world,'alice','rescue-meals','pickup');
 world=setMission(world,'bob','rescue-meals',true);
 assert.throws(()=>advanceRescue(world,'bob','rescue-meals','deliver'),/Another/);
 world=advanceRescue(world,'alice','rescue-meals','deliver');
 assert.equal(world.rescues[0].stage,'delivered');assert.equal(world.demo,true);
 assert.equal(world.fridges[0].stock,seedWorld().fridges[0].stock);
});
