import "dotenv/config";

import test, { after, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { POST } from "../app/api/services/route";
import { prisma } from "../lib/db";

/**
 * Route-level contract for POST /api/services (PLAN.md §13).
 *
 * Every Prisma method this route touches is stubbed, so these tests never write
 * to the database. The recorded calls are what prove the two interesting
 * behaviours: the vehicle is resolved server-side, and the odometer only ever
 * moves forward.
 */

const VEHICLE_ID = "vehicle-under-test";
const CURRENT_ODOMETER = 19820;

type CreateCall = { data: Record<string, unknown> };
type VehicleUpdateCall = { where: { id: string }; data: Record<string, unknown> };

let createCalls: CreateCall[] = [];
let vehicleUpdateCalls: VehicleUpdateCall[] = [];
let currentVehicle: { id: string; name: string; currentOdometer: number } | null = null;
let failCreate = false;
const restorers: Array<() => void> = [];

/**
 * Prisma 7 hands out model delegates and `$transaction` through a proxy whose
 * property descriptors report `value: undefined`, so `mock.method` refuses them.
 * Plain assignment is the only way to swap them out, hence the manual restore.
 */
function stubProperty(target: object, key: string, value: unknown): void {
  const record = target as Record<string, unknown>;
  const original = record[key];
  record[key] = value;
  restorers.push(() => {
    record[key] = original;
  });
}

function restoreStubs(): void {
  while (restorers.length > 0) restorers.pop()?.();
}

function stubDatabase(): void {
  stubProperty(prisma.vehicle, "findFirst", async () => currentVehicle as never);

  stubProperty(prisma, "$transaction", async (arg: unknown) => {
    const callback = arg as (tx: unknown) => Promise<unknown>;
    return callback({
      serviceRecord: {
        create: async ({ data }: CreateCall) => {
          if (failCreate) throw new Error("simulated driver failure");
          createCalls.push({ data: data as Record<string, unknown> });
          return {
            id: "record-created",
            vehicleId: VEHICLE_ID,
            type: data.type,
            date: data.date,
            odometer: data.odometer,
            notes: data.notes,
            receiptUrl: null,
          };
        },
      },
      vehicle: {
        update: async ({ where, data }: VehicleUpdateCall) => {
          vehicleUpdateCalls.push({ where, data });
          return { id: where.id, currentOdometer: data.currentOdometer };
        },
      },
    });
  });
}

function post(body: unknown): Promise<Response> {
  return POST(
    new Request("http://localhost/api/services", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

function validBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: "OIL_CHANGE",
    date: "2026-10-01",
    odometer: 19000,
    notes: "ServiceLog route test record",
    ...overrides,
  };
}

/** Expected-failure paths log to stderr by design; keep the output readable. */
function silenceLogs(): () => void {
  const original = console.error;
  console.error = () => {};
  return () => {
    console.error = original;
  };
}

beforeEach(() => {
  restoreStubs();
  createCalls = [];
  vehicleUpdateCalls = [];
  currentVehicle = { id: VEHICLE_ID, name: "Yamaha R15", currentOdometer: CURRENT_ODOMETER };
  failCreate = false;
  stubDatabase();
});

after(async () => {
  restoreStubs();
  await prisma.$disconnect();
});

/* ------------------------------- happy path ------------------------------- */

test("creates the record and returns 201", async () => {
  const res = await post(validBody());
  const body = await res.json();

  assert.equal(res.status, 201);
  assert.equal(body.record.id, "record-created");
  assert.equal(body.record.type, "OIL_CHANGE");
  assert.equal(body.record.date, "2026-10-01");
  assert.equal(body.record.odometer, 19000);
  assert.equal(createCalls.length, 1);
});

test("attaches the record to the server-resolved vehicle", async () => {
  await post(validBody());

  assert.equal(createCalls[0].data.vehicleId, VEHICLE_ID);
});

test("stores the date at UTC midnight", async () => {
  await post(validBody({ date: "2026-10-01" }));

  const stored = createCalls[0].data.date as Date;
  assert.equal(stored.toISOString(), "2026-10-01T00:00:00.000Z");
});

test("stores trimmed notes", async () => {
  await post(validBody({ notes: "  Motul 5100 10W-40  " }));

  assert.equal(createCalls[0].data.notes, "Motul 5100 10W-40");
});

/* --------------------------- odometer monotonic --------------------------- */

test("bumps currentOdometer when the new reading is higher", async () => {
  await post(validBody({ odometer: 20000 }));

  assert.equal(vehicleUpdateCalls.length, 1);
  assert.equal(vehicleUpdateCalls[0].where.id, VEHICLE_ID);
  assert.equal(vehicleUpdateCalls[0].data.currentOdometer, 20000);
});

test("leaves currentOdometer alone when the reading is lower (backfill)", async () => {
  await post(validBody({ odometer: 15000 }));

  assert.equal(createCalls.length, 1, "the record must still be saved");
  assert.equal(
    vehicleUpdateCalls.length,
    0,
    "an older record must never walk the odometer backwards",
  );
});

test("leaves currentOdometer alone when the reading matches exactly", async () => {
  await post(validBody({ odometer: CURRENT_ODOMETER }));

  assert.equal(createCalls.length, 1);
  assert.equal(vehicleUpdateCalls.length, 0);
});

/* ------------------------------ no vehicle ------------------------------ */

test("returns 409 and writes nothing when no vehicle exists", async () => {
  currentVehicle = null;
  const res = await post(validBody());

  assert.equal(res.status, 409);
  assert.match((await res.json()).error, /No vehicle has been added/);
  assert.equal(createCalls.length, 0);
  assert.equal(vehicleUpdateCalls.length, 0);
});

/* ------------------------------ validation ------------------------------ */

test("rejects a malformed JSON body with 400", async () => {
  const res = await post("{not json");

  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /valid JSON/);
  assert.equal(createCalls.length, 0);
});

test("rejects a non-object body with 400", async () => {
  assert.equal((await post("[1,2,3]")).status, 400);
  assert.equal((await post("\"nope\"")).status, 400);
  assert.equal(createCalls.length, 0);
});

test("rejects an invalid service type with 400 and writes nothing", async () => {
  const res = await post(validBody({ type: "OIL_CHANGE " }));

  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /must be one of/);
  assert.equal(createCalls.length, 0);
});

test("rejects an invalid date with 400 and writes nothing", async () => {
  const impossible = await post(validBody({ date: "2026-02-30" }));
  assert.equal(impossible.status, 400);
  assert.match((await impossible.json()).error, /not a real date/);

  const future = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  assert.equal((await post(validBody({ date: future }))).status, 400);

  assert.equal(createCalls.length, 0, "no record may be written for a rejected date");
});

test("rejects an invalid odometer with 400 and writes nothing", async () => {
  assert.equal((await post(validBody({ odometer: "19000" }))).status, 400);
  assert.equal((await post(validBody({ odometer: 0 }))).status, 400);
  assert.equal((await post(validBody({ odometer: -1 }))).status, 400);
  assert.equal((await post(validBody({ odometer: 19000.5 }))).status, 400);
  assert.equal(createCalls.length, 0);
});

test("rejects missing required fields with 400", async () => {
  assert.equal((await post({})).status, 400);
  assert.equal((await post(validBody({ type: undefined }))).status, 400);
  assert.equal((await post(validBody({ date: undefined }))).status, 400);
  assert.equal((await post(validBody({ odometer: undefined }))).status, 400);
  assert.equal((await post(validBody({ notes: undefined }))).status, 400);
  assert.equal(createCalls.length, 0);
});

test("rejects empty notes with 400", async () => {
  const res = await post(validBody({ notes: "   " }));

  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /must not be empty/);
  assert.equal(createCalls.length, 0);
});

/* ------------------------------- failure path ------------------------------- */

test("returns a generic 500 and no stack trace when the write fails", async () => {
  failCreate = true;
  const restore = silenceLogs();

  try {
    const res = await post(validBody());
    const raw = await res.text();

    assert.equal(res.status, 500);
    assert.match(raw, /couldn't save this service record/);
    assert.doesNotMatch(raw, /simulated driver failure/);
    assert.doesNotMatch(raw, /at .*route\.ts/);
    assert.doesNotMatch(raw, /Error:/);
  } finally {
    restore();
  }
});