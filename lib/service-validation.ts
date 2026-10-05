import { ServiceType } from "@/generated/prisma/enums";
import type { ServiceType as ServiceTypeValue } from "@/generated/prisma/enums";

/**
 * Validation for POST /api/services (PLAN.md §13, "Create a service record").
 *
 * §13 requires the service type, date, odometer and notes length to be
 * validated and malformed requests to be rejected. This module is the
 * authoritative implementation of that: the form's native `required` and
 * `type="number"` hints are only UX, and everything is re-checked here because
 * a browser is not a trust boundary.
 *
 * Pure on purpose — no Prisma import and no database access — so every rule can
 * be unit-tested directly, and so the file is safe to read from anywhere.
 */

export const MAX_NOTES_LENGTH = 1000;
export const MIN_ODOMETER_KM = 1;
/** A typo guard, not a real limit: no motorcycle reaches this reading. */
export const MAX_ODOMETER_KM = 1_000_000;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const SERVICE_TYPE_VALUES: readonly string[] = Object.values(ServiceType);

export function isServiceType(value: string): value is ServiceTypeValue {
  return SERVICE_TYPE_VALUES.includes(value);
}

export type ServiceRecordInput = {
  type: ServiceTypeValue;
  /** Stored at UTC midnight, matching prisma/seed.ts, so the date never shifts. */
  date: Date;
  odometer: number;
  notes: string;
};

export type ParseResult =
  | { ok: true; value: ServiceRecordInput }
  | { ok: false; message: string };

/**
 * Today at UTC midnight.
 *
 * Dates arrive as plain calendar days and are stored at UTC midnight, so the
 * "is this in the future?" boundary has to be UTC midnight as well. Comparing
 * against the server's local midnight would reject a legitimate record entered
 * in the evening just west of UTC.
 */
function todayUtcMidnight(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

/**
 * Parses and validates a `YYYY-MM-DD` calendar day.
 *
 * The round-trip check is what catches impossible dates: JavaScript happily
 * rolls "2026-02-30" over to March 2nd, which would silently store a date the
 * user never entered.
 */
function parseDate(value: unknown): { ok: true; date: Date } | { ok: false; message: string } {
  if (typeof value !== "string") {
    return { ok: false, message: "`date` must be a string." };
  }

  if (!DATE_PATTERN.test(value)) {
    return { ok: false, message: "`date` must be a calendar date in YYYY-MM-DD format." };
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    return { ok: false, message: `\`date\` is not a real date: ${value}.` };
  }

  if (date.getTime() > todayUtcMidnight()) {
    return { ok: false, message: "`date` must not be in the future." };
  }

  return { ok: true, date };
}

function parseOdometer(value: unknown): { ok: true; odometer: number } | { ok: false; message: string } {
  // Deliberately strict: a numeric string such as "18420" is rejected instead of
  // coerced, so a client that sends the wrong JSON type is never silently fixed.
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return { ok: false, message: "`odometer` must be a whole number of kilometres." };
  }

  if (value < MIN_ODOMETER_KM) {
    return { ok: false, message: `\`odometer\` must be at least ${MIN_ODOMETER_KM} km.` };
  }

  if (value > MAX_ODOMETER_KM) {
    return { ok: false, message: `\`odometer\` must be at most ${MAX_ODOMETER_KM.toLocaleString("en-US")} km.` };
  }

  return { ok: true, odometer: value };
}

function parseNotes(value: unknown): { ok: true; notes: string } | { ok: false; message: string } {
  // `notes` is a non-nullable String in the schema, so the field is always sent;
  // what is validated is that it says something.
  if (typeof value !== "string") {
    return { ok: false, message: "`notes` must be a string." };
  }

  const notes = value.trim();

  if (notes.length === 0) {
    return { ok: false, message: "`notes` must not be empty." };
  }

  if (notes.length > MAX_NOTES_LENGTH) {
    return { ok: false, message: `\`notes\` must be at most ${MAX_NOTES_LENGTH} characters.` };
  }

  return { ok: true, notes };
}

/**
 * Validates an untrusted request body into a `ServiceRecordInput`.
 *
 * `vehicleId` is intentionally not accepted: the route resolves the vehicle
 * itself, so a caller cannot attach a record to a vehicle of its choosing.
 */
export function parseServiceRecordBody(body: unknown): ParseResult {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, message: "Request body must be a JSON object with service record fields." };
  }

  const input = body as Record<string, unknown>;

  const rawType = input.type;
  if (typeof rawType !== "string") {
    return { ok: false, message: "`type` must be a string." };
  }
  if (!isServiceType(rawType)) {
    return {
      ok: false,
      message: `\`type\` must be one of: ${SERVICE_TYPE_VALUES.join(", ")}.`,
    };
  }

  const date = parseDate(input.date);
  if (!date.ok) return { ok: false, message: date.message };

  const odometer = parseOdometer(input.odometer);
  if (!odometer.ok) return { ok: false, message: odometer.message };

  const notes = parseNotes(input.notes);
  if (!notes.ok) return { ok: false, message: notes.message };

  return {
    ok: true,
    value: {
      type: rawType,
      date: date.date,
      odometer: odometer.odometer,
      notes: notes.notes,
    },
  };
}