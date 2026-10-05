/**
 * ServiceLog demo seed.
 *
 * ⚠️  ALL DATA BELOW IS DEMO/FIXTURE DATA, NOT REAL DATA.
 *     Per PLAN.md §21 it must never be presented as real friend feedback.
 *     Real friend feedback has to be collected separately.
 *
 * Idempotent by design: every row uses a stable, hand-written id and is written
 * with `upsert`, so running `npm run db:seed` repeatedly updates the existing
 * rows instead of inserting duplicates. No extra unique constraint is needed.
 *
 * Self-contained on purpose — it builds its own client from DATABASE_URL, so it
 * does not depend on the tsconfig "@/*" alias (which plain `tsx` does not
 * resolve).
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

const DEMO_VEHICLE_ID = "demo_vehicle_yamaha_r15";

const demoVehicle = {
  id: DEMO_VEHICLE_ID,
  name: "Yamaha R15",
  brand: "Yamaha",
  model: "R15",
  // Not specified in PLAN.md §21; chosen as a plausible used-bike model year.
  year: 2022,
  currentOdometer: 19820,
} as const;

const demoServiceRecords = [
  {
    id: "demo_service_oil_2026_09_12",
    type: "OIL_CHANGE" as const,
    date: new Date("2026-09-12T00:00:00.000Z"),
    odometer: 18420,
    notes: "Motul 5100 10W-40",
  },
  {
    id: "demo_service_brake_2026_08_03",
    type: "BRAKE" as const,
    date: new Date("2026-08-03T00:00:00.000Z"),
    odometer: 17900,
    notes: "Front brake inspection",
  },
  {
    id: "demo_service_chain_2026_06_15",
    type: "CHAIN" as const,
    date: new Date("2026-06-15T00:00:00.000Z"),
    odometer: 16800,
    notes: "Chain cleaned and adjusted",
  },
];

function resolveDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env and set DATABASE_URL to your PostgreSQL connection string.",
    );
  }
  return url;
}

async function main() {
  const adapter = new PrismaPg({ connectionString: resolveDatabaseUrl() });
  const prisma = new PrismaClient({ adapter });

  try {
    const vehicle = await prisma.vehicle.upsert({
      where: { id: demoVehicle.id },
      update: {
        name: demoVehicle.name,
        brand: demoVehicle.brand,
        model: demoVehicle.model,
        year: demoVehicle.year,
        currentOdometer: demoVehicle.currentOdometer,
      },
      create: demoVehicle,
    });

    for (const record of demoServiceRecords) {
      await prisma.serviceRecord.upsert({
        where: { id: record.id },
        update: {
          type: record.type,
          date: record.date,
          odometer: record.odometer,
          notes: record.notes,
        },
        create: { ...record, vehicleId: vehicle.id },
      });
    }

    const vehicleCount = await prisma.vehicle.count();
    const recordCount = await prisma.serviceRecord.count();

    console.log("Seeded ServiceLog demo data (PLAN.md §21) — fixture data, not real data.");
    console.log(`  vehicle:  ${vehicle.name} @ ${vehicle.currentOdometer.toLocaleString("en-US")} km`);
    console.log(`  records:  ${demoServiceRecords.length}`);
    console.log(`  database totals after seed -> vehicles: ${vehicleCount}, serviceRecords: ${recordCount}`);
    if (vehicleCount !== 1 || recordCount !== demoServiceRecords.length) {
      console.warn(
        "  NOTE: totals differ from the demo fixture — the database already contained other rows.",
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });