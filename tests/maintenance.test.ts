import "dotenv/config";

import test from "node:test";
import assert from "node:assert/strict";

import {
  MAINTENANCE_INTERVAL_KM,
  computeNextMaintenance,
  isReminderServiceType,
  type MaintenanceRecord,
} from "../lib/maintenance";

function makeRecord(
  type: string,
  date: string,
  odometer: number,
): MaintenanceRecord {
  return { type, date: new Date(`${date}T00:00:00.000Z`), odometer };
}

/**
 * The three rows from prisma/seed.ts, at the vehicle's seeded odometer.
 * Guards the number the dashboard actually renders.
 */
const SEED_RECORDS: MaintenanceRecord[] = [
  makeRecord("OIL_CHANGE", "2026-09-12", 18420),
  makeRecord("BRAKE", "2026-08-03", 17900),
  makeRecord("CHAIN", "2026-06-15", 16800),
];
const SEED_ODOMETER = 19820;

test("seeded data yields the oil reminder at 600 km remaining", () => {
  const next = computeNextMaintenance(SEED_ODOMETER, SEED_RECORDS);

  assert.ok(next, "expected a reminder from the seeded records");
  assert.equal(next.type, "OIL_CHANGE");
  assert.equal(next.lastDoneOdometer, 18420);
  assert.equal(next.intervalKm, 2000);
  assert.equal(next.dueAtOdometer, 20420);
  assert.equal(next.remainingKm, 600);
  assert.equal(next.isOverdue, false);
});

test("seeded data picks oil over chain and brake", () => {
  const next = computeNextMaintenance(SEED_ODOMETER, SEED_RECORDS);

  // Guards the interval table: chain 16,800 + 4,000 = 980 km left,
  // brake 17,900 + 6,000 = 4,080 km left. Both are further out than oil.
  const chain = computeNextMaintenance(SEED_ODOMETER, [makeRecord("CHAIN", "2026-06-15", 16800)]);
  const brake = computeNextMaintenance(SEED_ODOMETER, [makeRecord("BRAKE", "2026-08-03", 17900)]);

  assert.equal(chain?.remainingKm, 980);
  assert.equal(brake?.remainingKm, 4080);
  assert.equal(next?.remainingKm, 600);
  assert.ok((next?.remainingKm ?? Infinity) < (chain?.remainingKm ?? Infinity));
});

test("a service already past its interval is overdue", () => {
  // 18,420 + 2,000 = 20,420, which is behind a 22,000 km reading.
  const next = computeNextMaintenance(22000, [makeRecord("OIL_CHANGE", "2026-09-12", 18420)]);

  assert.equal(next?.remainingKm, -1580);
  assert.equal(next?.isOverdue, true);
  assert.equal(next?.dueAtOdometer, 20420);
});

test("an overdue service outranks one that is merely approaching", () => {
  // Oil is 1,580 km overdue; brake is still 1,900 km away.
  const next = computeNextMaintenance(22000, [
    makeRecord("OIL_CHANGE", "2026-09-12", 18420),
    makeRecord("BRAKE", "2026-08-03", 17900),
  ]);

  assert.equal(next?.type, "OIL_CHANGE");
  assert.equal(next?.isOverdue, true);
});

test("the approved chain interval keeps chain out of overdue at the seeded odometer", () => {
  // 16,800 + 4,000 = 20,800, so chain is 980 km away and must not win over oil.
  const next = computeNextMaintenance(SEED_ODOMETER, SEED_RECORDS);

  assert.equal(next?.type, "OIL_CHANGE");
  assert.equal(next?.isOverdue, false);
});

test("remaining of exactly zero is due now, not overdue", () => {
  // 18,420 + 2,000 = 20,420.
  const next = computeNextMaintenance(20420, [makeRecord("OIL_CHANGE", "2026-09-12", 18420)]);

  assert.equal(next?.remainingKm, 0);
  assert.equal(next?.isOverdue, false);
});

test("only the most recent record of a type is used", () => {
  const next = computeNextMaintenance(19820, [
    makeRecord("OIL_CHANGE", "2026-01-10", 10000),
    makeRecord("OIL_CHANGE", "2026-09-12", 18420),
  ]);

  assert.equal(next?.lastDoneOdometer, 18420);
  assert.equal(next?.dueAtOdometer, 20420);
  assert.equal(next?.remainingKm, 600);
});

test("on an identical date the higher odometer wins", () => {
  const next = computeNextMaintenance(19820, [
    makeRecord("OIL_CHANGE", "2026-09-12", 17000),
    makeRecord("OIL_CHANGE", "2026-09-12", 18420),
  ]);

  assert.equal(next?.lastDoneOdometer, 18420);
});

test("record order in the input does not change the result", () => {
  const ascending = computeNextMaintenance(19820, SEED_RECORDS);
  const descending = computeNextMaintenance(19820, [...SEED_RECORDS].reverse());

  assert.deepEqual(ascending, descending);
});

test("a type with no record is skipped rather than guessed", () => {
  const next = computeNextMaintenance(SEED_ODOMETER, SEED_RECORDS);

  assert.notEqual(next?.type, "TIRE");
  assert.notEqual(next?.type, "BATTERY");
  assert.notEqual(next?.type, "GENERAL_SERVICE");
});

test("OTHER never produces a reminder", () => {
  const next = computeNextMaintenance(SEED_ODOMETER, [
    makeRecord("OTHER", "2026-09-01", 19000),
  ]);

  assert.equal(next, null);
  assert.equal(isReminderServiceType("OTHER"), false);
});

test("no records means no reminder", () => {
  assert.equal(computeNextMaintenance(SEED_ODOMETER, []), null);
});

test("every interval in the table is a positive whole number of km", () => {
  for (const [type, interval] of Object.entries(MAINTENANCE_INTERVAL_KM)) {
    assert.ok(Number.isInteger(interval) && interval > 0, `${type} interval`);
  }
});

test("the oil interval stays at the 2,000 km fixed by PLAN.md §19", () => {
  assert.equal(MAINTENANCE_INTERVAL_KM.OIL_CHANGE, 2000);
});