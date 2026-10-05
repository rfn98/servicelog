import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { parseServiceRecordBody } from "@/lib/service-validation";

/**
 * POST /api/services — create a service record (PLAN.md §13).
 *
 * §13 also lists GET /api/services. It is not implemented here: nothing in the
 * app reads service records over HTTP (the dashboard reads Prisma directly in a
 * Server Component), so an unused endpoint would only widen the surface.
 */

/** better-sqlite3 is a native Node module, so this cannot run on the edge. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Generic on purpose: a provider or driver message must never reach the browser. */
const SAVE_FAILED_MESSAGE = "ServiceLog couldn't save this service record. Please try again.";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = parseServiceRecordBody(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.message }, { status: 400 });
  }

  try {
    // Resolved server-side, exactly as the dashboard does, so a caller cannot
    // choose which vehicle the record belongs to.
    const vehicle = await prisma.vehicle.findFirst({ orderBy: { createdAt: "asc" } });

    if (!vehicle) {
      return NextResponse.json(
        { error: "No vehicle has been added to ServiceLog yet." },
        { status: 409 },
      );
    }

    const { type, date, odometer, notes } = parsed.value;

    /**
     * Insert and odometer bump in one transaction: a record must never be
     * visible without the vehicle reading that goes with it.
     *
     * The odometer only moves forward. Backfilling an old record — which the
     * seeded history already does — must never walk the vehicle's current
     * reading backwards.
     */
    const record = await prisma.$transaction(async (tx) => {
      const created = await tx.serviceRecord.create({
        data: { vehicleId: vehicle.id, type, date, odometer, notes },
      });

      if (odometer > vehicle.currentOdometer) {
        await tx.vehicle.update({
          where: { id: vehicle.id },
          data: { currentOdometer: odometer },
        });
      }

      return created;
    });

    return NextResponse.json(
      {
        record: {
          id: record.id,
          type: record.type,
          date: record.date.toISOString().slice(0, 10),
          odometer: record.odometer,
          notes: record.notes,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    // Class name only, same as /api/ask. No stack trace, no driver message.
    const kind = error instanceof Error ? error.name : "unknown";
    console.error(`[services] create failed: ${kind}`);

    return NextResponse.json({ error: SAVE_FAILED_MESSAGE }, { status: 500 });
  }
}