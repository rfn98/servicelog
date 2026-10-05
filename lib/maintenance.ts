/**
 * Deterministic maintenance reminder — PLAN.md §19.
 *
 * The reminder is pure business logic:
 *
 *     Deterministic data          (Prisma rows)
 *           ↓
 *     Deterministic calculations  (this file)
 *           ↓
 *     Gemma                      (lib/gemma.ts, Screen 3)
 *           ↓
 *     Natural-language explanation
 *
 * §19 is explicit that the AI does NOT determine the maintenance interval:
 * "The AI explains recorded information." So nothing here may call a model,
 * read a prompt, or infer anything. Every number below is a plain subtraction.
 *
 * Deliberately free of any Prisma import: the caller passes rows in, and this
 * module stays unit-testable without a database. It also keeps the DB client
 * out of anything a client component might reach for.
 */

/**
 * Configured interval per service type, in kilometres.
 *
 * PLAN.md §19 fixes only the oil-change interval (2,000 km) via its worked
 * example. The remaining values are ordinary workshop intervals for the
 * service list in §6 and are configuration, not data — no seeded vehicle or
 * service record is referenced here.
 *
 * `OTHER` is intentionally absent: "Other" is a user-defined catch-all with no
 * meaningful interval, so it never produces a reminder.
 */
export const MAINTENANCE_INTERVAL_KM = {
  OIL_CHANGE: 2000,
  CHAIN: 4000,
  BRAKE: 6000,
  TIRE: 8000,
  GENERAL_SERVICE: 6000,
  BATTERY: 12000,
} as const;

export type ReminderServiceType = keyof typeof MAINTENANCE_INTERVAL_KM;

/** The subset of a ServiceRecord row this calculation needs. */
export type MaintenanceRecord = {
  type: string;
  date: Date;
  odometer: number;
};

export type NextMaintenance = {
  /** Service type whose interval drives the reminder. */
  type: ReminderServiceType;
  /** Odometer reading of the most recent record of that type. */
  lastDoneOdometer: number;
  /** Date of the most recent record of that type. */
  lastDoneDate: Date;
  /** Configured interval, in km. */
  intervalKm: number;
  /** lastDoneOdometer + intervalKm. */
  dueAtOdometer: number;
  /** dueAtOdometer - currentOdometer. Negative once the service is overdue. */
  remainingKm: number;
  /** True when remainingKm < 0. */
  isOverdue: boolean;
};

export function isReminderServiceType(
  type: string,
): type is ReminderServiceType {
  return Object.hasOwn(MAINTENANCE_INTERVAL_KM, type);
}

/** Newest wins; equal dates fall back to the higher odometer. */
function isLaterRecord(candidate: MaintenanceRecord, current: MaintenanceRecord): boolean {
  const byDate = candidate.date.getTime() - current.date.getTime();
  if (byDate !== 0) return byDate > 0;
  return candidate.odometer > current.odometer;
}

/** Most recent record per interval-backed service type. */
function latestRecordPerType(
  records: MaintenanceRecord[],
): Map<ReminderServiceType, MaintenanceRecord> {
  const latest = new Map<ReminderServiceType, MaintenanceRecord>();
  for (const record of records) {
    if (!isReminderServiceType(record.type)) continue;
    const current = latest.get(record.type);
    if (!current || isLaterRecord(record, current)) {
      latest.set(record.type, record);
    }
  }
  return latest;
}

/**
 * Next maintenance item for a vehicle: the interval-backed service type with
 * the least distance left before it is due.
 *
 * Returns null when no interval-backed service type has ever been recorded,
 * which is the "next maintenance reminder if enough information exists" case in
 * PLAN.md §5 — the dashboard then shows no reminder rather than a guess.
 *
 * `records` must be every record for the vehicle. Capping it in the query would
 * hide the latest record of any type that happens not to appear in the newest
 * slice, and the reminder would silently use a stale odometer.
 */
export function computeNextMaintenance(
  currentOdometer: number,
  records: MaintenanceRecord[],
): NextMaintenance | null {
  const latest = latestRecordPerType(records);

  let winner: NextMaintenance | null = null;

  for (const [type, record] of latest) {
    const intervalKm = MAINTENANCE_INTERVAL_KM[type];
    const dueAtOdometer = record.odometer + intervalKm;
    const remainingKm = dueAtOdometer - currentOdometer;

    const candidate: NextMaintenance = {
      type,
      lastDoneOdometer: record.odometer,
      lastDoneDate: record.date,
      intervalKm,
      dueAtOdometer,
      remainingKm,
      isOverdue: remainingKm < 0,
    };

    // `latest` is insertion-ordered, so a strict comparison keeps the result
    // deterministic when two types tie on remaining kilometres.
    if (winner === null || candidate.remainingKm < winner.remainingKm) {
      winner = candidate;
    }
  }

  return winner;
}