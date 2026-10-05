import "dotenv/config";

import test from "node:test";
import assert from "node:assert/strict";

import {
  MAX_NOTES_LENGTH,
  MAX_ODOMETER_KM,
  MIN_ODOMETER_KM,
  isServiceType,
  parseServiceRecordBody,
} from "../lib/service-validation";

/**
 * Unit tests for the POST /api/services validation boundary (PLAN.md §13).
 *
 * These run without a database or an HTTP server: parseServiceRecordBody is
 * pure, so every rule is checked directly.
 */

function validBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: "OIL_CHANGE",
    date: "2026-09-12",
    odometer: 18420,
    notes: "Motul 5100 10W-40",
    ...overrides,
  };
}

function expectError(body: unknown, pattern: RegExp): string {
  const result = parseServiceRecordBody(body);
  assert.equal(result.ok, false, `expected rejection for ${JSON.stringify(body)}`);
  if (result.ok) throw new Error("unreachable");
  assert.match(result.message, pattern);
  return result.message;
}

/* ------------------------------- happy path ------------------------------- */

test("accepts a complete valid record", () => {
  const result = parseServiceRecordBody(validBody());

  assert.ok(result.ok);
  if (!result.ok) return;

  assert.equal(result.value.type, "OIL_CHANGE");
  assert.equal(result.value.date.toISOString(), "2026-09-12T00:00:00.000Z");
  assert.equal(result.value.odometer, 18420);
  assert.equal(result.value.notes, "Motul 5100 10W-40");
});

test("stores the date at UTC midnight so it never shifts a day", () => {
  const result = parseServiceRecordBody(validBody({ date: "2026-09-12" }));

  assert.ok(result.ok);
  if (!result.ok) return;

  // Exactly midnight UTC — the same shape prisma/seed.ts writes. A local-midnight
  // Date would render as Sep 11 for any viewer west of UTC.
  assert.equal(result.value.date.getTime(), Date.UTC(2026, 8, 12));
});

test("accepts every service type in the schema enum", () => {
  for (const value of [
    "OIL_CHANGE",
    "BRAKE",
    "CHAIN",
    "TIRE",
    "BATTERY",
    "GENERAL_SERVICE",
    "OTHER",
  ]) {
    const result = parseServiceRecordBody(validBody({ type: value }));
    assert.ok(result.ok, `${value} should be accepted`);
    assert.equal(isServiceType(value), true);
  }
});

test("accepts an odometer below the vehicle's current reading (backfill)", () => {
  // The seeded history already does this: 16,800 km against a 19,820 km reading.
  const result = parseServiceRecordBody(validBody({ odometer: 16800 }));

  assert.ok(result.ok);
});

test("trims surrounding whitespace from notes", () => {
  const result = parseServiceRecordBody(validBody({ notes: "  Motul 5100  \n" }));

  assert.ok(result.ok);
  if (!result.ok) return;
  assert.equal(result.value.notes, "Motul 5100");
});

test("ignores a client-supplied vehicleId", () => {
  const result = parseServiceRecordBody(validBody({ vehicleId: "some-other-vehicle" }));

  assert.ok(result.ok, "the extra field must not fail validation");
  if (!result.ok) return;
  assert.equal(
    "vehicleId" in result.value,
    false,
    "vehicleId must not survive validation; the route resolves the vehicle",
  );
});

/* ------------------------------ envelope ------------------------------ */

test("rejects a non-object body", () => {
  expectError(null, /JSON object/);
  expectError([1, 2, 3], /JSON object/);
  expectError("a string", /JSON object/);
  expectError(42, /JSON object/);
});

/* ------------------------------- type ------------------------------- */

test("rejects an unknown service type", () => {
  expectError(validBody({ type: "OIL CHANGE" }), /must be one of/);
  expectError(validBody({ type: "oil_change" }), /must be one of/);
  expectError(validBody({ type: "ENGINE_REBUILD" }), /must be one of/);
});

test("rejects a non-string service type", () => {
  expectError(validBody({ type: 1 }), /`type` must be a string/);
  expectError(validBody({ type: null }), /`type` must be a string/);
  expectError(validBody({ type: undefined }), /`type` must be a string/);
});

test("the error lists the allowed types so a bad client can recover", () => {
  const message = expectError(validBody({ type: "NOPE" }), /must be one of/);
  assert.match(message, /OIL_CHANGE/);
  assert.match(message, /GENERAL_SERVICE/);
});

/* ------------------------------- date ------------------------------- */

test("rejects a malformed date", () => {
  expectError(validBody({ date: "12/09/2026" }), /YYYY-MM-DD/);
  expectError(validBody({ date: "2026-9-12" }), /YYYY-MM-DD/);
  expectError(validBody({ date: "Sep 12, 2026" }), /YYYY-MM-DD/);
  expectError(validBody({ date: "" }), /YYYY-MM-DD/);
});

test("rejects a non-string date", () => {
  expectError(validBody({ date: 20260912 }), /`date` must be a string/);
  expectError(validBody({ date: null }), /`date` must be a string/);
});

test("rejects a date that does not exist instead of rolling it over", () => {
  // Without the round-trip check, new Date("2026-02-30") silently becomes Mar 2.
  expectError(validBody({ date: "2026-02-30" }), /not a real date/);
  expectError(validBody({ date: "2026-13-01" }), /not a real date/);
  expectError(validBody({ date: "2026-00-10" }), /not a real date/);
  expectError(validBody({ date: "2025-02-29" }), /not a real date/);
});

test("accepts a real leap day", () => {
  const result = parseServiceRecordBody(validBody({ date: "2024-02-29" }));
  assert.ok(result.ok);
});

test("rejects a future date", () => {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  expectError(validBody({ date: tomorrow }), /must not be in the future/);
});

test("accepts today", () => {
  const today = new Date().toISOString().slice(0, 10);
  const result = parseServiceRecordBody(validBody({ date: today }));
  assert.ok(result.ok, "a record dated today must be accepted");
});

test("accepts a date in the past", () => {
  const result = parseServiceRecordBody(validBody({ date: "2020-01-01" }));
  assert.ok(result.ok);
});

/* ----------------------------- odometer ----------------------------- */

test("rejects a non-number odometer instead of coercing it", () => {
  expectError(validBody({ odometer: "18420" }), /whole number/);
  expectError(validBody({ odometer: null }), /whole number/);
  expectError(validBody({ odometer: undefined }), /whole number/);
  expectError(validBody({ odometer: {} }), /whole number/);
});

test("rejects a fractional odometer", () => {
  expectError(validBody({ odometer: 18420.5 }), /whole number/);
});

test("rejects NaN and Infinity", () => {
  expectError(validBody({ odometer: Number.NaN }), /whole number/);
  expectError(validBody({ odometer: Number.POSITIVE_INFINITY }), /whole number/);
});

test("rejects an odometer below the minimum", () => {
  expectError(validBody({ odometer: 0 }), /at least 1 km/);
  expectError(validBody({ odometer: -5 }), /at least 1 km/);
});

test("accepts the minimum odometer", () => {
  const result = parseServiceRecordBody(validBody({ odometer: MIN_ODOMETER_KM }));
  assert.ok(result.ok);
});

test("rejects an absurd odometer that is almost certainly a typo", () => {
  expectError(validBody({ odometer: MAX_ODOMETER_KM + 1 }), /at most 1,000,000 km/);
});

test("accepts the odometer ceiling exactly", () => {
  const result = parseServiceRecordBody(validBody({ odometer: MAX_ODOMETER_KM }));
  assert.ok(result.ok);
});

/* ------------------------------- notes ------------------------------- */

test("rejects a non-string notes field", () => {
  expectError(validBody({ notes: null }), /`notes` must be a string/);
  expectError(validBody({ notes: 42 }), /`notes` must be a string/);
  expectError(validBody({ notes: undefined }), /`notes` must be a string/);
});

test("rejects empty or whitespace-only notes", () => {
  expectError(validBody({ notes: "" }), /must not be empty/);
  expectError(validBody({ notes: " " }), /must not be empty/);
  expectError(validBody({ notes: "\n\t  " }), /must not be empty/);
});

test("rejects notes longer than the limit after trimming", () => {
  assert.ok(parseServiceRecordBody(validBody({ notes: "a".repeat(MAX_NOTES_LENGTH) })).ok);

  expectError(validBody({ notes: "a".repeat(MAX_NOTES_LENGTH + 1) }), /at most 1000 characters/);
  // Padding is trimmed before the length check, so this is exactly at the limit.
  assert.ok(
    parseServiceRecordBody(
      validBody({ notes: `   ${"a".repeat(MAX_NOTES_LENGTH)}   ` }),
    ).ok,
    "surrounding whitespace must not count toward the limit",
  );
});

/* ---------------------------- field ordering ---------------------------- */

test("reports the first invalid field rather than a generic failure", () => {
  // Bad type and bad odometer: the type message must win, so the form can show
  // something actionable.
  const message = expectError(
    validBody({ type: "NOPE", odometer: -1 }),
    /must be one of/,
  );
  assert.doesNotMatch(message, /odometer/);
});