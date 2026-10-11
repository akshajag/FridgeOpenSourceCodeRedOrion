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
