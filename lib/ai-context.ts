import { prisma } from "@/lib/db";
import type { ServiceRecord, Vehicle } from "@/generated/prisma/client";

/**
 * Builds the grounded service-history context handed to the model, plus the
 * allowlist of source tags the model is permitted to cite (PLAN.md §12, §13).
 *
 * Retrieval is deterministic — newest records first, `id` ascending as a
 * tiebreaker — so the same database always produces the same `[Rn]` mapping.
 */

/** PLAN.md §12 caps how much history reaches the model. */
export const MAX_CONTEXT_RECORDS = 12;

/** One service record as exposed to the model and to the API response. */
export type ContextSource = {
  /** Citation tag shown in the prompt, e.g. "R1". */
  sourceId: string;
  serviceRecordId: string;
  /** Raw enum value, e.g. "OIL_CHANGE". */
  type: string;
  date: Date;
  odometer: number;
  notes: string;
};

export type AskContext = {
  vehicle: Vehicle | null;
  sources: ContextSource[];
  /** Rendered text sent to the model. */
  text: string;
  /** The only citation tags a valid answer may use, e.g. ["R1", "R2"]. */
  allowedSourceIds: string[];
};

const SERVICE_TYPE_LABELS: Record<string, string> = {
  OIL_CHANGE: "Oil Change",
  BRAKE: "Brake",
  CHAIN: "Chain",
  TIRE: "Tire",
  BATTERY: "Battery",
  GENERAL_SERVICE: "General Service",
  OTHER: "Other",
};

export function formatServiceType(type: string): string {
  return SERVICE_TYPE_LABELS[type] ?? type;
}

/** ISO date, so the model copies the stored value instead of reformatting it. */
export function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function sourceIdFor(index: number): string {
  return `R${index + 1}`;
}

/**
 * Render already-loaded rows into prompt text and the citation allowlist.
 *
 * Pure, so it can be unit-tested without touching the database.
 */
export function renderAskContext(
  vehicle: Vehicle | null,
  records: ServiceRecord[],
): AskContext {
  if (!vehicle) {
    return {
      vehicle: null,
      sources: [],
      text: "No vehicle has been added to ServiceLog yet, so there is no service history to answer from.",
      allowedSourceIds: [],
    };
  }

  const header = [
    "VEHICLE",
    `Name: ${vehicle.name}`,
    `Brand: ${vehicle.brand}`,
    `Model: ${vehicle.model}`,
    `Year: ${vehicle.year}`,
    `Current odometer: ${vehicle.currentOdometer} km`,
  ].join("\n");

  // Enforced here as well as in the query, so the cap cannot be bypassed.
  const limited = records.slice(0, MAX_CONTEXT_RECORDS);

  if (limited.length === 0) {
    return {
      vehicle,
      sources: [],
      text: `${header}\n\nSERVICE HISTORY\n\nNo service records have been recorded for this vehicle yet.`,
      allowedSourceIds: [],
    };
  }

  const sources: ContextSource[] = limited.map((record, index) => ({
    sourceId: sourceIdFor(index),
    serviceRecordId: record.id,
    type: record.type,
    date: record.date,
    odometer: record.odometer,
    notes: record.notes,
  }));

  const blocks = sources.map((source) => {
    const lines = [
      `[${source.sourceId}]`,
      `Type: ${formatServiceType(source.type)}`,
      `Date: ${formatDate(source.date)}`,
      `Odometer: ${source.odometer} km`,
    ];
    if (source.notes.length > 0) {
      lines.push(`Notes: ${source.notes}`);
    }
    return lines.join("\n");
  });

  return {
    vehicle,
    sources,
    text: `${header}\n\nSERVICE HISTORY (newest first)\n\n${blocks.join("\n\n")}`,
    allowedSourceIds: sources.map((source) => source.sourceId),
  };
}

/** Load the single demo vehicle and its most recent records. */
export async function buildAskContext(): Promise<AskContext> {
  const vehicle = await prisma.vehicle.findFirst({
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  if (!vehicle) {
    return renderAskContext(null, []);
  }

  const records = await prisma.serviceRecord.findMany({
    where: { vehicleId: vehicle.id },
    orderBy: [{ date: "desc" }, { id: "asc" }],
    take: MAX_CONTEXT_RECORDS,
  });

  return renderAskContext(vehicle, records);
}