import Link from "next/link";

import { formatServiceType } from "@/lib/ai-context";
import { prisma } from "@/lib/db";
import { computeNextMaintenance } from "@/lib/maintenance";

/**
 * Screen 1 — Dashboard (PLAN.md §9).
 *
 * A Server Component: it reads Prisma directly, so there is no API endpoint for
 * the dashboard and no client component that could pull database code into the
 * browser. Nothing on this page calls Gemma — the reminder comes from the pure
 * arithmetic in lib/maintenance.ts (PLAN.md §19).
 */

/** Read fresh on every request, so a newly recorded service shows up at once. */
export const dynamic = "force-dynamic";

/** How many records the "Recent service" list shows. */
const RECENT_RECORD_LIMIT = 5;

/**
 * Seeded record dates are stored at UTC midnight. Without pinning the time zone
 * a viewer behind UTC would read "2026-09-12T00:00:00Z" as Sep 11, so every
 * date on this page is formatted in UTC.
 *
 * `day: "2-digit"` zero-pads the day, matching the short form in PLAN.md §9
 * ("Aug 03"). `day: "numeric"` would render "Aug 3".
 */
const shortDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "2-digit",
  timeZone: "UTC",
});

function formatShortDate(date: Date): string {
  return shortDateFormatter.format(date);
}

function formatOdometer(km: number): string {
  return km.toLocaleString("en-US");
}

const sectionLabelClass =
  "text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400";

const primaryButtonClass =
  "flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white";

const secondaryButtonClass =
  "flex items-center justify-center rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800";

export default async function DashboardPage() {
  // One vehicle in ServiceLog for now, so the oldest row is the one to show.
  // A vehicle switcher is out of scope for this screen.
  const vehicle = await prisma.vehicle.findFirst({ orderBy: { createdAt: "asc" } });

  /**
   * Every record for the vehicle, not just the newest few. The display list is
   * sliced below, but the reminder needs the latest record of each service
   * type, which a capped query would hide for any type missing from the slice.
   */
  const records = vehicle
    ? await prisma.serviceRecord.findMany({
        where: { vehicleId: vehicle.id },
        orderBy: { date: "desc" },
      })
    : [];

  const nextMaintenance = vehicle
    ? computeNextMaintenance(vehicle.currentOdometer, records)
    : null;

  const recentRecords = records.slice(0, RECENT_RECORD_LIMIT);

  return (
    <main className="flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">ServiceLog</h1>

      {!vehicle ? (
        <section className="flex flex-col gap-2">
          <p className={sectionLabelClass}>No vehicle yet</p>
          <p className="rounded-lg border border-dashed border-zinc-300 p-4 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
            Add your vehicle to start tracking service history.
          </p>
        </section>
      ) : (
        <>
          <section className="flex flex-col gap-1">
            <p className="text-lg font-medium text-zinc-900 dark:text-zinc-100">
              {vehicle.name}
            </p>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {`${formatOdometer(vehicle.currentOdometer)} km`}
            </p>
          </section>

          {nextMaintenance ? (
            <section className="flex flex-col gap-2">
              <p className={sectionLabelClass}>Next maintenance</p>
              <div className="flex flex-col gap-1 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                <p className="text-base font-medium text-zinc-900 dark:text-zinc-100">
                  {formatServiceType(nextMaintenance.type)}
                </p>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  {nextMaintenance.isOverdue
                    ? `Overdue by ${formatOdometer(-nextMaintenance.remainingKm)} km`
                    : `~${formatOdometer(nextMaintenance.remainingKm)} km`}
                </p>
              </div>
            </section>
          ) : null}

          <section className="flex flex-col gap-3">
            <p className={sectionLabelClass}>Recent service</p>
            {recentRecords.length === 0 ? (
              <p className="rounded-lg border border-dashed border-zinc-300 p-4 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
                No service recorded yet.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {recentRecords.map((record) => (
                  <li
                    key={record.id}
                    className="flex items-baseline justify-between gap-4 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
                  >
                    <div className="flex flex-col gap-1">
                      <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                        {formatShortDate(record.date)}
                      </span>
                      <span className="text-sm text-zinc-600 dark:text-zinc-400">
                        {formatServiceType(record.type)}
                      </span>
                    </div>
                    <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
                      {`${formatOdometer(record.odometer)} km`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        <Link href="/services/new" className={primaryButtonClass}>
          Add Service
        </Link>
        <Link href="/ask" className={secondaryButtonClass}>
          Ask ServiceLog
        </Link>
      </div>
    </main>
  );
}