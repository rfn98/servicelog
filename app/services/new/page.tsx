import type { Metadata } from "next";
import Link from "next/link";

import { ServiceForm } from "@/components/service-form";
import { ServiceType } from "@/generated/prisma/enums";
import { formatServiceType } from "@/lib/ai-context";
import { prisma } from "@/lib/db";

/**
 * Screen 2 — Add Service (PLAN.md §9, §6 Flow B).
 *
 * Server Component shell. It resolves the vehicle and turns the generated
 * ServiceType enum into labelled options here, on the server, because
 * formatServiceType lives in lib/ai-context.ts which imports Prisma and so
 * cannot be pulled into the client form. Passing the options down as props keeps
 * a single label source without a third copy of the map.
 *
 * The receipt field is deliberately absent. The schema has an optional
 * `receiptUrl`, but PLAN.md defines no storage contract anywhere, and §29 lists
 * receipt upload as the first feature to cut. Inventing a directory, a serving
 * route or a dependency is out of scope, so the field is omitted rather than
 * faked.
 */

export const metadata: Metadata = {
  title: "Add Service",
};

/** Reads the database, so it must not be baked at build time. */
export const dynamic = "force-dynamic";

export default async function AddServicePage() {
  const vehicle = await prisma.vehicle.findFirst({ orderBy: { createdAt: "asc" } });

  const options = Object.values(ServiceType).map((value) => ({
    value,
    label: formatServiceType(value),
  }));

  return (
    <main className="flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Add Service</h1>

      {vehicle ? (
        <ServiceForm options={options} />
      ) : (
        <section className="flex flex-col gap-3">
          <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
            No vehicle yet
          </p>
          <p className="rounded-lg border border-dashed border-zinc-300 p-4 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
            Add your vehicle before recording a service, otherwise there is nothing to attach the
            record to.
          </p>
          <div>
            <Link
              href="/"
              className="flex w-full items-center justify-center rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 sm:w-auto dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Back to dashboard
            </Link>
          </div>
        </section>
      )}
    </main>
  );
}