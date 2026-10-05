import "dotenv/config";

import test from "node:test";
import assert from "node:assert/strict";

import type { ServiceRecord, Vehicle } from "../generated/prisma/client";
import {
  MAX_CONTEXT_RECORDS,
  formatServiceType,
  renderAskContext,
} from "../lib/ai-context";

const NOW = new Date("2026-10-01T00:00:00.000Z");

function makeVehicle(overrides: Partial<Vehicle> = {}): Vehicle {
  return {
    id: "vehicle-1",
    name: "Yamaha R15",
    brand: "Yamaha",
    model: "R15",
    year: 2022,
    currentOdometer: 19820,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeRecord(
  id: string,
  type: string,
  date: string,
  odometer: number,
  notes = "",
): ServiceRecord {
  return {
    id,
    vehicleId: "vehicle-1",
    type,
    date: new Date(`${date}T00:00:00.000Z`),
    odometer,
    notes,
    receiptUrl: null,
    createdAt: NOW,
    updatedAt: NOW,
  } as ServiceRecord;
}

/** The three rows produced by prisma/seed.ts. */
const SEED_RECORDS: ServiceRecord[] = [
  makeRecord("svc-oil", "OIL_CHANGE", "2026-09-12", 18420, "Motul 5100 10W-40"),
  makeRecord("svc-brake", "BRAKE", "2026-08-03", 17900, "Front brake inspection"),
  makeRecord("svc-chain", "CHAIN", "2026-06-15", 16800, "Chain lube 2500"),
];

test("formats enum values into human labels", () => {
  assert.equal(formatServiceType("OIL_CHANGE"), "Oil Change");
  assert.equal(formatServiceType("GENERAL_SERVICE"), "General Service");
  assert.equal(formatServiceType("SOMETHING_NEW"), "SOMETHING_NEW");
});

test("renders the three seeded records as [R1], [R2], [R3] in the order given", () => {
  const context = renderAskContext(makeVehicle(), SEED_RECORDS);

  assert.deepEqual(context.allowedSourceIds, ["R1", "R2", "R3"]);
  assert.deepEqual(
    context.sources.map((s) => s.sourceId),
    ["R1", "R2", "R3"],
  );
  assert.deepEqual(
    context.sources.map((s) => s.serviceRecordId),
    ["svc-oil", "svc-brake", "svc-chain"],
  );
});

test("context text carries the vehicle, ISO dates and odometer readings", () => {
  const { text } = renderAskContext(makeVehicle(), SEED_RECORDS);

  assert.match(text, /Yamaha R15/);
  assert.match(text, /Current odometer: 19820 km/);
  assert.match(text, /\[R1\]\nType: Oil Change\nDate: 2026-09-12\nOdometer: 18420 km/);
  assert.match(text, /Notes: Motul 5100 10W-40/);
  assert.match(text, /\[R3\]\nType: Chain\nDate: 2026-06-15\nOdometer: 16800 km/);
});

test("never renders more than 12 records", () => {
  const many = Array.from({ length: 20 }, (_, i) =>
    makeRecord(`svc-${i}`, "OTHER", `2026-01-${String(i + 1).padStart(2, "0")}`, 1000 + i),
  );

  const context = renderAskContext(makeVehicle(), many);

  assert.equal(MAX_CONTEXT_RECORDS, 12);
  assert.equal(context.sources.length, 12);
  assert.equal(context.allowedSourceIds.length, 12);
  assert.equal(context.allowedSourceIds.at(-1), "R12");
  assert.ok(!context.text.includes("[R13]"));
});

test("omits the Notes line when a record has no notes", () => {
  const context = renderAskContext(makeVehicle(), [
    makeRecord("svc-x", "TIRE", "2026-05-05", 1234),
  ]);

  assert.match(context.text, /\[R1\]\nType: Tire\nDate: 2026-05-05\nOdometer: 1234 km$/);
  assert.ok(!context.text.includes("Notes:"));
});

test("reports clearly when there is no vehicle", () => {
  const context = renderAskContext(null, []);

  assert.equal(context.vehicle, null);
  assert.deepEqual(context.sources, []);
  assert.deepEqual(context.allowedSourceIds, []);
  assert.match(context.text, /No vehicle has been added/);
});

test("reports clearly when the vehicle has no history yet", () => {
  const context = renderAskContext(makeVehicle(), []);

  assert.deepEqual(context.sources, []);
  assert.deepEqual(context.allowedSourceIds, []);
  assert.match(context.text, /No service records have been recorded/);
});